import argparse
import asyncio
import datetime
from pathlib import Path
import pytest

from pes import database
from pes.calendar_export import export_calendar
from pes.commands import inbox, repeat, review, schedule
from pes.config import load_config
from pes.database import get_db, init_db
from pes.engine.graph_engine import add_link, outcome_map, remove_link
from pes.engine.state_machine import move_card
from pes.engine.state_machine import VALID_TRANSITIONS
from pes.pes_cli import build_parser, main
from pes.tui import PESApp


@pytest.fixture(autouse=True)
def isolated_db(tmp_path, monkeypatch):
    path = tmp_path / "data" / "pes.db"
    monkeypatch.setattr(database, "DB_PATH", str(path))
    monkeypatch.setenv("PES_CONFIG_PATH", str(tmp_path / "missing.toml"))
    init_db()
    yield path


def add_card(card_id="T-001", state="Captured", **fields):
    values = {
        "name": card_id, "level": "Task", "current_state_desc": "before",
        "desired_state_desc": "after", "proof_of_completion": "proof",
        "next_physical_action": "act", "priority": 0, "risk_level": "Low",
    }
    values.update(fields)
    conn = get_db()
    cols = ["id", "state", *values]
    conn.execute(
        f"INSERT INTO commitments ({','.join(cols)}) VALUES ({','.join('?' for _ in cols)})",
        [card_id, state, *values.values()],
    )
    conn.commit()
    conn.close()


def set_capacity(week="2026-08-03"):
    conn = get_db()
    conn.execute(
        "INSERT INTO capacity (week_of,total_hours,fixed_commitments,meals_travel_transitions,recovery_reserve,available_capacity,schedule_limit) VALUES (?,?,?,?,?,?,?)",
        (week, 40, 12, 6, 6, 16, 11.0),
    )
    conn.commit(); conn.close()


def test_inbox_process_creates_card_and_closes_item():
    args = argparse.Namespace(inbox_action="add", text=["Build", "proof"])
    inbox.handle(args)
    inbox.handle(argparse.Namespace(
        inbox_action="process", id=1, action="define", card_id="T-100",
        name="Build proof", level="Task", current="none", desired="exists",
        proof="file", next_action="draft",
    ))
    conn = get_db()
    assert conn.execute("SELECT state FROM commitments WHERE id='T-100'").fetchone()[0] == "Captured"
    item = conn.execute("SELECT processed_at, card_id FROM inbox WHERE id=1").fetchone()
    assert item[0] and item[1] == "T-100"
    conn.close()


def test_schedule_and_unschedule_round_trip():
    add_card(state="Ready", planned_duration=60)
    set_capacity()
    schedule.schedule_card("T-001", "2026-08-05", "09:00", 90)
    conn = get_db(); assert conn.execute("SELECT state FROM commitments").fetchone()[0] == "Scheduled"; conn.close()
    schedule.unschedule_card("T-001")
    conn = get_db(); row = conn.execute("SELECT state,planned_date FROM commitments").fetchone(); conn.close()
    assert tuple(row) == ("Ready", None)


def test_execution_guards_require_timestamps_results_and_fallback():
    add_card(state="Scheduled", planned_date="2026-08-05", planned_duration=60)
    with pytest.raises(ValueError, match="actual_start"):
        move_card("T-001", "Active")
    move_card("T-001", "Active", actual_start=datetime.datetime.now().isoformat())
    with pytest.raises(ValueError, match="result"):
        move_card("T-001", "Completed", actual_end=datetime.datetime.now().isoformat())
    move_card("T-001", "Blocked", actual_end=datetime.datetime.now().isoformat(),
              block_reason="vendor", waiting_for="vendor", review_date="2026-08-10")
    add_card("T-002", state="Active", priority=90)
    with pytest.raises(ValueError, match="fallback"):
        move_card("T-002", "Blocked", actual_end=datetime.datetime.now().isoformat(),
                  block_reason="vendor", waiting_for="vendor", review_date="2026-08-10")


def test_graph_add_remove_and_parent_map():
    add_card("P-1", level="Project")
    add_card("T-2", parent_id="P-1")
    conn = get_db()
    add_link(conn, "P-1", "T-2", "produces"); conn.commit()
    cards, links = outcome_map(conn, "P-1")
    assert [c["id"] for c in cards] == ["P-1", "T-2"]
    assert links[0]["link_type"] == "produces"
    remove_link(conn, "P-1", "T-2", "produces"); conn.commit()
    assert conn.execute("SELECT COUNT(*) FROM links").fetchone()[0] == 0
    conn.close()


def test_repeat_materializes_new_linked_card():
    add_card(state="Verified", repeat_rule="start=done; interval=weekly; proof=file; review=weekly",
             result="made", proof_location="/proof")
    new_id = repeat.materialize("T-001")
    conn = get_db()
    assert new_id == "T-001-R1"
    assert conn.execute("SELECT repeat_rule FROM commitments WHERE id=?", (new_id,)).fetchone()[0]
    assert conn.execute("SELECT link_type FROM links WHERE from_id='T-001'").fetchone()[0] == "helps"
    conn.close()


def test_reviews_persist_a_real_review_record():
    add_card(state="Ready")
    review.end_of_day("Full", "Ship proof")
    review.weekly()
    conn = get_db()
    rows = conn.execute("SELECT review_type,changes_made FROM review_runs ORDER BY id").fetchall()
    conn.close()
    assert [tuple(r) for r in rows] == [("end-of-day", 1), ("weekly", 1)]


def test_calendar_export_has_stable_card_uid(tmp_path):
    add_card(state="Scheduled", planned_date="2026-08-05", planned_start="09:00", planned_duration=60)
    target = tmp_path / "pes.ics"
    assert export_calendar(target) == 1
    text = target.read_text()
    assert "UID:T-001@pes.local" in text and "BEGIN:VEVENT" in text


def test_config_defaults_and_validation(tmp_path):
    assert load_config()["default_mode"] == "Full"
    path = tmp_path / "bad.toml"; path.write_text('[pes]\ndefault_mode="Wrong"\n')
    with pytest.raises(ValueError, match="default_mode"):
        load_config(path)


def test_cli_help_and_required_commands():
    help_text = build_parser().format_help()
    for name in ("inbox", "card", "capacity", "proof", "link", "map", "review", "calendar", "tui"):
        assert name in help_text
    assert main(["config"]) == 0


def test_textual_tui_starts_and_reads_same_database():
    add_card(state="Ready")
    async def run():
        app = PESApp()
        async with app.run_test() as pilot:
            assert "T-001" in str(app.query_one("#daily").content)
            await pilot.press("e")
            await pilot.press("w")
            await pilot.press("q")
    asyncio.run(run())
    conn = get_db()
    assert conn.execute("SELECT COUNT(*) FROM review_runs").fetchone()[0] == 2
    conn.close()


def test_ten_commitment_full_flow_and_acceptance_gates(monkeypatch):
    for i in range(1, 11):
        inbox.handle(argparse.Namespace(inbox_action="add", text=[f"Commitment {i}"]))
        inbox.handle(argparse.Namespace(
            inbox_action="process", id=i, action="define", card_id=f"T-{i:03d}",
            name=f"Commitment {i}", level="Task", current="not made",
            desired="made", proof=f"proof-{i}", next_action="perform work",
        ))
        move_card(f"T-{i:03d}", "Ready")
    set_capacity()
    schedule.schedule_card("T-001", "2026-08-05", "09:00", 60)
    now = datetime.datetime.now().isoformat()
    move_card("T-001", "Active", actual_start=now)
    move_card("T-001", "Completed", actual_end=now, result="made",
              proof_location="C:/proof/1", what_happened="work completed")
    conn = get_db()
    conn.execute(
        "UPDATE commitments SET desired_result_made=1,proof_exists=1,proof_stored=1,required_action_remains=0 WHERE id='T-001'"
    )
    conn.commit(); conn.close()
    move_card("T-001", "Verified")
    move_card("T-001", "Done")
    with pytest.raises(ValueError, match="Invalid transition"):
        move_card("T-001", "Ready")
    conn = get_db()
    assert conn.execute("SELECT COUNT(*) FROM inbox WHERE processed_at IS NOT NULL").fetchone()[0] == 10
    assert conn.execute("SELECT COUNT(*) FROM commitments").fetchone()[0] == 10
    assert conn.execute("SELECT COUNT(*) FROM proof_index WHERE card_id='T-001'").fetchone()[0] == 1
    assert conn.execute("SELECT state FROM commitments WHERE id='T-001'").fetchone()[0] == "Done"
    conn.close()


def test_database_survives_reinitialization(isolated_db):
    add_card()
    init_db()
    conn = get_db()
    assert conn.execute("SELECT name FROM commitments WHERE id='T-001'").fetchone()[0] == "T-001"
    conn.close()


def test_at_001_all_new_input_enters_one_inbox():
    assert main(["card", "define", "T-001", "--name", "Controlled work",
                 "--current", "none", "--desired", "done", "--proof", "file",
                 "--next-action", "work"]) == 0
    conn = get_db()
    rows = conn.execute("SELECT raw_text,processed_at,card_id FROM inbox").fetchall()
    conn.close()
    assert len(rows) == 1 and rows[0]["processed_at"] and rows[0]["card_id"] == "T-001"


def test_at_002_controlled_commitment_has_one_unique_card_id():
    add_card()
    conn = get_db()
    with pytest.raises(Exception):
        conn.execute(
            "INSERT INTO commitments (id,name,state) VALUES ('T-001','duplicate','Captured')"
        )
    conn.close()


def test_at_003_ready_requires_all_four_front_fields():
    add_card(current_state_desc="")
    with pytest.raises(ValueError, match="current_state_desc"):
        move_card("T-001", "Ready")


def test_at_004_only_one_card_can_be_active():
    now = datetime.datetime.now().isoformat()
    add_card("T-001", state="Scheduled")
    add_card("T-002", state="Scheduled")
    move_card("T-001", "Active", actual_start=now)
    with pytest.raises(ValueError, match="already Active"):
        move_card("T-002", "Active", actual_start=now)


def test_at_005_scheduled_cards_count_against_week_capacity():
    set_capacity()
    add_card("T-001", state="Ready")
    add_card("T-002", state="Ready")
    schedule.schedule_card("T-001", "2026-08-05", "09:00", 360)
    schedule.schedule_card("T-002", "2026-08-06", "09:00", 300)
    conn = get_db()
    total = conn.execute(
        "SELECT SUM(planned_duration) FROM commitments WHERE schedule_status='scheduled'"
    ).fetchone()[0]
    conn.close()
    assert total == 660


def test_at_006_planned_work_cannot_exceed_seventy_percent_limit():
    set_capacity()
    add_card(state="Ready")
    with pytest.raises(ValueError, match="Weekly limit"):
        schedule.schedule_card("T-001", "2026-08-05", "09:00", 661)


def test_at_007_blocked_card_requires_review_date():
    add_card(state="Active")
    with pytest.raises(ValueError, match="review_date"):
        move_card("T-001", "Blocked", actual_end=datetime.datetime.now().isoformat(),
                  block_reason="waiting", waiting_for="vendor")


def test_at_008_high_priority_or_risk_requires_fallback():
    add_card(priority=80)
    with pytest.raises(ValueError, match="fallback_action"):
        move_card("T-001", "Ready")


def test_at_009_done_requires_verified_checked_proof():
    now = datetime.datetime.now().isoformat()
    add_card(state="Active")
    move_card("T-001", "Completed", actual_end=now, result="result",
              proof_location="C:/proof/result", what_happened="finished")
    with pytest.raises(ValueError, match="Completion gate"):
        move_card("T-001", "Verified")
    conn = get_db()
    conn.execute(
        "UPDATE commitments SET desired_result_made=1,proof_exists=1,"
        "proof_stored=1,required_action_remains=0 WHERE id='T-001'"
    )
    conn.commit(); conn.close()
    move_card("T-001", "Verified")
    move_card("T-001", "Done")


def test_at_010_each_review_records_a_system_change():
    review.end_of_day("Reduced", "Protect capacity")
    conn = get_db()
    row = conn.execute("SELECT changes_made FROM review_runs").fetchone()
    conn.close()
    assert row["changes_made"] >= 1


def test_at_011_each_mapped_task_links_to_a_card():
    add_card("P-001", level="Project")
    add_card("T-001", parent_id="P-001")
    conn = get_db()
    add_link(conn, "P-001", "T-001", "produces")
    conn.commit()
    cards, links = outcome_map(conn, "P-001")
    conn.close()
    assert {c["id"] for c in cards} == {"P-001", "T-001"}
    assert any(link["to_id"] == "T-001" for link in links)


def test_at_012_each_work_block_makes_a_log_entry():
    add_card(state="Active")
    move_card("T-001", "Blocked", actual_end=datetime.datetime.now().isoformat(),
              block_reason="waiting", waiting_for="vendor", review_date="2026-08-10")
    conn = get_db()
    row = conn.execute(
        "SELECT state_from,state_to,actual_end FROM log WHERE card_id='T-001'"
    ).fetchone()
    conn.close()
    assert tuple(row) == ("Active", "Blocked", row["actual_end"]) and row["actual_end"]


def test_at_013_each_open_card_has_a_valid_state_and_place():
    for index, state in enumerate(VALID_TRANSITIONS):
        if state not in {"Done", "Canceled"}:
            add_card(f"T-{index:03d}", state=state)
    conn = get_db()
    rows = conn.execute(
        "SELECT state,schedule_status FROM commitments WHERE state NOT IN ('Done','Canceled')"
    ).fetchall()
    conn.close()
    assert rows
    assert all(r["state"] in VALID_TRANSITIONS for r in rows)
    assert all(r["schedule_status"] in {"scheduled", "unscheduled"} for r in rows)


def test_at_014_closed_card_stays_in_records_after_reopen():
    add_card(state="Done", result="result", proof_location="C:/proof/result")
    init_db()
    conn = get_db()
    row = conn.execute("SELECT state FROM commitments WHERE id='T-001'").fetchone()
    conn.close()
    assert row["state"] == "Done"


def test_at_015_completed_result_has_findable_proof_location():
    add_card(state="Completed", result="result", proof_location="C:/proof/result",
             desired_result_made=1, proof_exists=1, proof_stored=1,
             required_action_remains=0)
    move_card("T-001", "Verified")
    conn = get_db()
    row = conn.execute(
        "SELECT result,proof_location,verified FROM proof_index WHERE card_id='T-001'"
    ).fetchone()
    conn.close()
    assert tuple(row) == ("result", "C:/proof/result", 1)


def test_generic_card_move_adds_required_execution_timestamps():
    add_card(state="Scheduled")
    args = build_parser().parse_args(["card", "move", "T-001", "--to", "active"])
    from pes.commands import card
    card.handle(args)
    conn = get_db()
    row = conn.execute("SELECT state,actual_start FROM commitments WHERE id='T-001'").fetchone()
    conn.close()
    assert row["state"] == "Active" and row["actual_start"]


def test_end_of_day_uses_configured_default_mode(tmp_path, monkeypatch):
    config = tmp_path / "pes.toml"
    config.write_text('[pes]\ndefault_day_mode="Recovery"\n')
    monkeypatch.setenv("PES_CONFIG_PATH", str(config))
    assert main(["review", "end-of-day", "--must-happen", "Recover"]) == 0
    conn = get_db()
    row = conn.execute("SELECT tomorrow_mode FROM review_runs").fetchone()
    conn.close()
    assert row["tomorrow_mode"] == "Recovery"
