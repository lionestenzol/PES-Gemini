import concurrent.futures
import json
import xml.etree.ElementTree as ET

import pytest

from pes import database
from pes.camunda import (
    COMPLETION_DECISION_ID, PROCESS_ID, REPEAT_PROCESS_ID, REVIEW_PROCESS_ID,
)
from pes.camunda.client import resource_files
from pes.camunda.services import (
    acquire_active, audit_user_task, authorize_user, check_ready,
    completion_gate, create_repeat_cycle, project_state, record_review,
    register_user, release_active, reserve_schedule, store_proof,
)
from pes.database import get_db, init_db


@pytest.fixture(autouse=True)
def isolated_path_c_db(tmp_path, monkeypatch):
    db_path = tmp_path / "path-c" / "pes.db"
    monkeypatch.setattr(database, "DB_PATH", str(db_path))
    init_db()


def variables(card_id="C-001", **overrides):
    data = {
        "card_id": card_id, "name": f"Card {card_id}", "level": "Task",
        "parent_id": None, "current_state_desc": "Current",
        "desired_state_desc": "Desired", "proof_of_completion": "Proof file",
        "next_physical_action": "Do it", "owner": "worker-1", "priority": 0,
        "risk_level": "Low", "pes_state": "Captured", "projection_version": 0,
        "process_version": 1,
    }
    data.update(overrides)
    return data


def create_card(card_id="C-001", **overrides):
    data = variables(card_id, **overrides)
    return project_state(f"project-{card_id}", f"instance-{card_id}", data)


def test_all_path_c_resources_are_well_formed_and_forms_are_valid_json():
    files = resource_files()
    assert len(files) == 10
    for path in files:
        assert path.exists(), path
        if path.suffix == ".form":
            form = json.loads(path.read_text(encoding="utf-8"))
            assert form["id"] and form["components"]
        else:
            ET.parse(path)


def test_bpmn_contains_stable_models_states_guards_tasks_and_terminal_events():
    root = ET.parse(resource_files()[-1]).getroot()
    xml = ET.tostring(root, encoding="unicode")
    assert f'id="{PROCESS_ID}"' in xml
    for state in ("Captured", "Ready", "Scheduled", "Active", "Completed",
                  "Verified", "Done", "Paused", "Blocked", "Canceled"):
        assert f'&quot;{state}&quot;' in xml or f'"{state}"' in xml
    for job_type in ("pes-ready-check", "pes-schedule-check", "pes-acquire-active",
                     "pes-release-active", "pes-project-state", "pes-store-proof"):
        assert job_type in xml
    assert "pes-completion-gate" in xml
    assert 'name="Done"' in xml and 'name="Canceled"' in xml
    assert "source=\"=1\"" not in xml
    assert xml.count("projection_version + 1") == 10
    assert xml.count('type="pes-audit-user-task"') == 7


def test_review_process_is_separate_and_timer_started():
    review = next(path for path in resource_files() if path.name == "pes-review.bpmn")
    xml = review.read_text(encoding="utf-8")
    assert f'id="{REVIEW_PROCESS_ID}"' in xml
    assert xml.count("<bpmn:timerEventDefinition>") == 2
    assert "End-of-day timer" in xml and "Weekly timer" in xml
    assert xml.count('type="pes-record-review"') == 2
    assert "pes-reviewers" in xml
    assert xml.count('type="pes-audit-user-task"') == 2


def test_repeat_process_calls_commitment_uses_timer_and_has_terminal_stop():
    path = next(path for path in resource_files() if path.name == "pes-repeat-series.bpmn")
    xml = path.read_text(encoding="utf-8")
    assert f'id="{REPEAT_PROCESS_ID}"' in xml
    assert 'type="pes-create-repeat-cycle"' in xml
    assert 'processId="pes-commitment"' in xml
    assert "timerEventDefinition" in xml and "repeat_interval" in xml
    assert 'name="Repeat series stopped"' in xml


def test_dmn_has_typed_four_input_single_pass_rule_and_default_fail():
    decision = next(path for path in resource_files() if path.suffix == ".dmn")
    xml = decision.read_text(encoding="utf-8")
    assert f'id="{COMPLETION_DECISION_ID}"' in xml
    assert xml.count('typeRef="boolean"') >= 5
    for name in ("desired_result_made", "proof_exists", "proof_stored",
                 "required_action_remains"):
        assert name in xml
    assert "completion_pass" in xml and "completion_fail" in xml


@pytest.mark.parametrize(
    "facts,passed",
    [
        ({"desired_result_made": True, "proof_exists": True,
          "proof_stored": True, "required_action_remains": False}, True),
        ({"desired_result_made": False, "proof_exists": True,
          "proof_stored": True, "required_action_remains": False}, False),
        ({"desired_result_made": True, "proof_exists": False,
          "proof_stored": True, "required_action_remains": False}, False),
        ({"desired_result_made": True, "proof_exists": True,
          "proof_stored": False, "required_action_remains": False}, False),
        ({"desired_result_made": True, "proof_exists": True,
          "proof_stored": True, "required_action_remains": True}, False),
        ({"desired_result_made": True}, False),
        ({"desired_result_made": "yes", "proof_exists": True,
          "proof_stored": True, "required_action_remains": False}, False),
    ],
)
def test_completion_decision_truth_table(facts, passed):
    assert completion_gate(facts)["completion_passed"] is passed


def test_projection_maps_one_card_to_one_instance_and_is_idempotent():
    data = variables()
    first = project_state("job-1", "instance-1", data)
    second = project_state("job-1", "instance-1", data)
    assert first == second == {"projection_status": "applied", "pes_state": "Captured"}
    conn = get_db()
    assert conn.execute("SELECT COUNT(*) FROM commitments").fetchone()[0] == 1
    assert conn.execute("SELECT COUNT(*) FROM camunda_instances").fetchone()[0] == 1
    assert conn.execute("SELECT COUNT(*) FROM camunda_job_results").fetchone()[0] == 1
    assert conn.execute("SELECT COUNT(*) FROM log").fetchone()[0] == 1
    conn.close()


def test_equal_or_older_projection_cannot_replace_newer_business_state():
    project_state("v1", "instance-1", variables(projection_version=1))
    applied = project_state(
        "v2", "instance-1",
        variables(pes_state="Ready", projection_version=2),
    )
    stale = project_state(
        "another-v2", "instance-1",
        variables(pes_state="Canceled", projection_version=2),
    )
    older = project_state(
        "old-v1", "instance-1",
        variables(pes_state="Canceled", projection_version=1),
    )
    assert applied == {"projection_status": "applied", "pes_state": "Ready"}
    assert stale == older == {"projection_status": "stale", "pes_state": "Ready"}
    conn = get_db()
    assert conn.execute("SELECT state FROM commitments WHERE id='C-001'").fetchone()[0] == "Ready"
    conn.close()


def test_projection_persists_schedule_and_proof_facts():
    create_card("FACTS")
    project_state(
        "facts-v1", "instance-FACTS",
        variables(
            "FACTS", pes_state="Scheduled", projection_version=1,
            planned_date="2026-08-03", planned_start="09:00",
            planned_duration=30,
        ),
    )
    project_state(
        "facts-v2", "instance-FACTS",
        variables(
            "FACTS", pes_state="Verified", projection_version=2,
            planned_date="2026-08-03", planned_start="09:00",
            planned_duration=30, desired_result_made=True,
            proof_exists=True, proof_stored=True,
            required_action_remains=False,
        ),
    )
    conn = get_db()
    row = conn.execute(
        "SELECT schedule_status,planned_date,planned_start,planned_duration,"
        "desired_result_made,proof_exists,proof_stored,required_action_remains "
        "FROM commitments WHERE id='FACTS'"
    ).fetchone()
    conn.close()
    assert tuple(row) == (
        "unscheduled", "2026-08-03", "09:00", 30, 1, 1, 1, 0,
    )


def test_ready_gate_accepts_defined_card_and_rejects_missing_field():
    create_card("GOOD")
    create_card("BAD", next_physical_action="")
    assert check_ready("ready-good", "instance-GOOD", {"card_id": "GOOD"})["ready_passed"]
    result = check_ready("ready-bad", "instance-BAD", {"card_id": "BAD"})
    assert not result["ready_passed"]
    assert "next_physical_action" in result["ready_reason"]


def test_schedule_is_atomic_idempotent_and_enforces_seventy_percent_capacity():
    create_card("C-1")
    create_card("C-2")
    conn = get_db()
    conn.execute("INSERT INTO capacity(week_of,total_hours,available_capacity,schedule_limit) VALUES (?,?,?,?)",
                 ("2026-08-03", 10, 10, 7))
    conn.commit(); conn.close()
    payloads = [
        ("schedule-1", "instance-C-1", {"card_id": "C-1", "planned_date": "2026-08-03", "planned_duration": 300}),
        ("schedule-2", "instance-C-2", {"card_id": "C-2", "planned_date": "2026-08-03", "planned_duration": 300}),
    ]
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(lambda args: reserve_schedule(*args), payloads))
    assert sum(result["schedule_passed"] for result in results) == 1
    winner = next(i for i, result in enumerate(results) if result["schedule_passed"])
    assert reserve_schedule(*payloads[winner]) == results[winner]
    conn = get_db()
    assert conn.execute("SELECT COUNT(*) FROM schedule_reservations").fetchone()[0] == 1
    conn.close()


def test_schedule_and_active_reject_unmet_dependency():
    create_card("BLOCKER")
    create_card("WORK")
    conn = get_db()
    conn.execute("INSERT INTO links(from_id,to_id,link_type) VALUES ('BLOCKER','WORK','blocks')")
    conn.execute("INSERT INTO capacity(week_of,total_hours,available_capacity,schedule_limit) VALUES (?,?,?,?)",
                 ("2026-08-03", 10, 10, 7))
    conn.commit(); conn.close()
    schedule = reserve_schedule("schedule", "instance-WORK", {
        "card_id": "WORK", "planned_date": "2026-08-03", "planned_duration": 60,
    })
    active = acquire_active("active", "instance-WORK", {"card_id": "WORK"})
    assert not schedule["schedule_passed"] and "BLOCKER" in schedule["schedule_reason"]
    assert not active["active_passed"] and "BLOCKER" in active["active_reason"]


def test_single_active_is_atomic_and_retry_safe():
    create_card("C-1"); create_card("C-2")
    calls = [
        ("active-1", "instance-C-1", {"card_id": "C-1"}),
        ("active-2", "instance-C-2", {"card_id": "C-2"}),
    ]
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(lambda args: acquire_active(*args), calls))
    assert sum(result["active_passed"] for result in results) == 1
    winner = next(i for i, result in enumerate(results) if result["active_passed"])
    assert acquire_active(*calls[winner]) == results[winner]
    release_active("release", calls[winner][1], calls[winner][2])
    loser = 1 - winner
    assert acquire_active("active-retry", calls[loser][1], calls[loser][2])["active_passed"]


def test_proof_index_only_written_for_complete_valid_decision():
    create_card()
    invalid = store_proof("proof-1", "instance-C-001", {
        "card_id": "C-001", "result": "Made", "proof_location": "proof.pdf",
        "desired_result_made": True, "proof_exists": False,
        "proof_stored": True, "required_action_remains": False,
    })
    assert not invalid["completion_passed"]
    valid = store_proof("proof-2", "instance-C-001", {
        "card_id": "C-001", "result": "Made", "proof_location": "proof.pdf",
        "desired_result_made": True, "proof_exists": True,
        "proof_stored": True, "required_action_remains": False,
    })
    assert valid["completion_passed"] and valid["decision_time"]
    conn = get_db()
    row = conn.execute("SELECT * FROM proof_index WHERE card_id='C-001'").fetchone()
    assert row["verified"] == 1 and row["proof_location"] == "proof.pdf"
    card = conn.execute(
        "SELECT result,proof_location,desired_result_made,proof_exists,"
        "proof_stored,required_action_remains FROM commitments WHERE id='C-001'"
    ).fetchone()
    assert tuple(card) == ("Made", "proof.pdf", 1, 1, 1, 0)
    conn.close()


def test_path_c_cli_is_registered_and_requires_owner():
    from pes.pes_cli import build_parser
    parser = build_parser()
    args = parser.parse_args(["path-c", "resources"])
    assert args.path_c_action == "resources"
    with pytest.raises(SystemExit):
        parser.parse_args(["path-c", "start", "C-1", "--name", "n",
                           "--current", "c", "--desired", "d", "--proof", "p",
                           "--next-action", "a"])


def test_path_c_two_week_protocol_is_tracked_and_time_gated():
    from pes.commands.protocol import record, start, status
    run_id = start("C", "2026-08-02")
    record(run_id, "test_users", "worker-1 created", event_date="2026-08-02")
    result = status(run_id)
    assert result["path"] == "C"
    assert result["ends_on"] == "2026-08-15"
    assert result["event_counts"]["test_users"] == 1
    assert not result["ready_to_complete"]


def test_access_roles_allow_workers_and_deny_operator_model_author_and_unknown():
    register_user("worker-1", "worker")
    register_user("operator-1", "operator")
    register_user("author-1", "model-author")
    assert authorize_user("worker-1") == (True, "authorized")
    for user_id in ("operator-1", "author-1", "missing", None):
        allowed, reason = authorize_user(user_id)
        assert not allowed and reason


def test_human_task_audit_uses_registered_actor_time_and_is_idempotent():
    create_card()
    register_user("worker-1", "worker")
    data = {"card_id": "C-001", "actor_id": "worker-1",
            "element_id": "active_work", "listener_event_type": "completing"}
    first = audit_user_task("listener-job", "instance-C-001", data)
    second = audit_user_task("listener-job", "instance-C-001", data)
    assert first == second
    assert first["task_audited"] and first["task_completed_at"]
    conn = get_db()
    rows = conn.execute(
        "SELECT * FROM camunda_audit WHERE event_type='human-task-completion'"
    ).fetchall()
    assert len(rows) == 1 and rows[0]["actor_id"] == "worker-1"
    conn.close()


def test_human_task_audit_denies_unregistered_or_non_work_role():
    create_card()
    register_user("operator-1", "operator")
    with pytest.raises(PermissionError):
        audit_user_task("listener-denied", "instance-C-001", {
            "card_id": "C-001", "actor_id": "operator-1",
            "element_id": "active_work",
        })


def test_repeat_cycles_have_unique_ids_keep_series_link_and_retry_is_idempotent():
    data = {
        "series_id": "SERIES-1", "name": "Weekly report",
        "current_state_desc": "No report", "desired_state_desc": "Report sent",
        "proof_of_completion": "Sent message URL", "next_physical_action": "Draft report",
        "owner": "worker-1", "repeat_interval": "P7D",
        "repeat_review_rule": "Review after each cycle", "repeat_active": True,
    }
    first = create_repeat_cycle("repeat-job-1", "repeat-instance", data)
    retry = create_repeat_cycle("repeat-job-1", "repeat-instance", data)
    second = create_repeat_cycle("repeat-job-2", "repeat-instance", data)
    assert first == retry
    assert first["card_id"] == "SERIES-1-C0001" and first["cycle_no"] == 1
    assert second["card_id"] == "SERIES-1-C0002" and second["cycle_no"] == 2
    assert first["proof_of_completion"] == second["proof_of_completion"]
    conn = get_db()
    rows = conn.execute(
        "SELECT series_id,cycle_no,card_id FROM camunda_repeat_cycles ORDER BY cycle_no"
    ).fetchall()
    assert [tuple(row) for row in rows] == [
        ("SERIES-1", 1, "SERIES-1-C0001"),
        ("SERIES-1", 2, "SERIES-1-C0002"),
    ]
    conn.close()


def test_end_of_day_review_requires_change_mode_and_next_must_happen():
    register_user("worker-1", "worker")
    base = {"review_type": "end-of-day", "actor_id": "worker-1",
            "review_change": "Moved C-1 to Ready"}
    with pytest.raises(ValueError, match="tomorrow_mode"):
        record_review("eod-bad", "review-1", base)
    valid = {**base, "tomorrow_mode": "Full", "must_happen": "Ship C-1",
             "planned_actual_checked": True, "proof_checked": True,
             "blocked_dates_checked": True}
    first = record_review("eod-good", "review-1", valid)
    retry = record_review("eod-good", "review-1", valid)
    assert first == retry
    assert first["review_recorded"] and first["changes_made"] == 1


def test_weekly_review_requires_all_seven_steps_and_capacity():
    register_user("worker-1", "worker")
    data = {"review_type": "weekly", "actor_id": "worker-1",
            "review_change": "Scheduled next week's selected work",
            "next_week_capacity": 21}
    for step in ("collect", "clarify", "verify", "update", "remove", "select"):
        data[step] = True
    with pytest.raises(ValueError, match="seven review steps"):
        record_review("weekly-bad", "review-2", data)
    data["schedule"] = True
    result = record_review("weekly-good", "review-2", data)
    assert result["review_type"] == "weekly" and result["changes_made"] == 1
