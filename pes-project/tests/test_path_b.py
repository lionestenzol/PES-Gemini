import asyncio
import argparse
import datetime
import sqlite3
from concurrent.futures import ThreadPoolExecutor

import pytest
from temporalio.testing import WorkflowEnvironment
from temporalio.worker import Replayer, Worker

from pes import database
from pes.database import get_db, init_db
from pes.temporal import activities, workflow_id
from pes.temporal.models import Command, CommitmentState, STATES
from pes.temporal.workflow import CommitmentWorkflow
from pes.temporal.worker import ACTIVITIES
from pes.temporal.review_workflow import ReviewWorkflow
from pes.temporal.models import ReviewRequest
from pes.temporal.models import RepeatSeries
from pes.temporal.repeat_workflow import RepeatSeriesWorkflow
from pes.temporal.rebuild import rebuild_commitment_projections
from pes.temporal.backup import backup_runtime, restore_runtime
from pes.temporal.evidence import nine_questions
from pes.pes_cli import build_parser
from pes.commands import inbox
from pes.engine.graph_engine import add_link, outcome_map


@pytest.fixture(autouse=True)
def isolated_db(tmp_path, monkeypatch):
    path = tmp_path / "data" / "pes.db"
    monkeypatch.setattr(database, "DB_PATH", str(path))
    init_db()
    yield path


def state(card_id="T-B-001", **values):
    defaults = {
        "card_id": card_id,
        "name": "Temporal commitment",
        "current_state_desc": "not complete",
        "desired_state_desc": "complete",
        "proof_of_completion": "proof file exists",
        "next_physical_action": "perform work",
    }
    defaults.update(values)
    return CommitmentState(**defaults)


async def command(handle, request_id, action, data=None):
    await handle.signal(
        CommitmentWorkflow.command,
        Command(request_id, action, data or {}),
    )
    for _ in range(100):
        result = await handle.query(CommitmentWorkflow.command_result, request_id)
        if result:
            return result
        await asyncio.sleep(0.01)
    raise AssertionError(f"command not processed: {request_id}")


async def environment():
    return await WorkflowEnvironment.start_time_skipping()


def test_path_b_workflow_accepts_valid_flow_and_projects_proof():
    async def run():
        env = await environment()
        try:
            with ThreadPoolExecutor(max_workers=4) as executor:
                async with Worker(
                    env.client, task_queue="test-pes",
                    workflows=[CommitmentWorkflow], activities=ACTIVITIES,
                    activity_executor=executor,
                ):
                    handle = await env.client.start_workflow(
                        CommitmentWorkflow.run, state(),
                        id=workflow_id("T-B-001"), task_queue="test-pes",
                    )
                    assert (await command(handle, "ready", "ready")).accepted
                    conn = get_db()
                    conn.execute(
                        "INSERT INTO capacity(week_of,total_hours,available_capacity,schedule_limit) "
                        "VALUES ('2026-08-03',40,16,11.2)"
                    )
                    conn.commit(); conn.close()
                    assert (await command(handle, "schedule", "schedule", {
                        "planned_date": "2026-08-05", "planned_duration": 60,
                    })).accepted
                    assert (await command(handle, "active", "activate")).accepted
                    assert (await command(handle, "complete", "complete", {
                        "result": "made", "proof_location": "C:/proof/path-b",
                    })).accepted
                    assert (await command(handle, "verify", "verify", {
                        "desired_result_made": True, "proof_exists": True,
                        "proof_stored": True, "required_action_remains": False,
                    })).accepted
                    assert (await command(handle, "done", "done")).accepted
                    output = await handle.result()
                    assert output.final_state == "Done"
                    assert output.proof_location == "C:/proof/path-b"
                    history = await handle.fetch_history()
                    replay = await Replayer(
                        workflows=[CommitmentWorkflow]
                    ).replay_workflow(history)
                    assert replay.replay_failure is None
        finally:
            await env.shutdown()
    asyncio.run(run())
    conn = get_db()
    card = conn.execute(
        "SELECT state,workflow_id,projection_version FROM commitments WHERE id='T-B-001'"
    ).fetchone()
    proof = conn.execute(
        "SELECT proof_location FROM proof_index WHERE card_id='T-B-001'"
    ).fetchone()
    conn.close()
    assert tuple(card) == ("Done", workflow_id("T-B-001"), 6)
    assert proof["proof_location"] == "C:/proof/path-b"


def test_path_b_rejects_invalid_ready_and_deduplicates_signal():
    async def run():
        env = await environment()
        try:
            with ThreadPoolExecutor(max_workers=4) as executor:
                async with Worker(
                    env.client, task_queue="test-pes",
                    workflows=[CommitmentWorkflow], activities=ACTIVITIES,
                    activity_executor=executor,
                ):
                    handle = await env.client.start_workflow(
                        CommitmentWorkflow.run,
                        state(current_state_desc=""),
                        id=workflow_id("T-B-001"), task_queue="test-pes",
                    )
                    first = await command(handle, "same-request", "ready")
                    second = await command(handle, "same-request", "ready")
                    assert not first.accepted
                    assert second == first
                    assert "current_state_desc" in first.reason
                    card = await handle.query(CommitmentWorkflow.card)
                    assert card.state == "Captured" and card.version == 0
        finally:
            await env.shutdown()
    asyncio.run(run())


def test_rejected_command_rolls_back_all_workflow_fields():
    async def run():
        env = await environment()
        try:
            with ThreadPoolExecutor(max_workers=4) as executor:
                async with Worker(
                    env.client, task_queue="test-pes",
                    workflows=[CommitmentWorkflow], activities=ACTIVITIES,
                    activity_executor=executor,
                ):
                    handle = await env.client.start_workflow(
                        CommitmentWorkflow.run, state(),
                        id=workflow_id("T-B-001"), task_queue="test-pes",
                    )
                    result = await command(handle, "bad-schedule", "schedule", {
                        "planned_date": "2026-08-05", "planned_duration": 60,
                    })
                    assert not result.accepted
                    card = await handle.query(CommitmentWorkflow.card)
                    assert card.state == "Captured"
                    assert card.planned_date is None
                    assert card.planned_duration is None
        finally:
            await env.shutdown()
    asyncio.run(run())


def test_concurrent_schedule_signals_cannot_oversubscribe_capacity():
    async def run():
        env = await environment()
        try:
            with ThreadPoolExecutor(max_workers=8) as executor:
                async with Worker(
                    env.client, task_queue="test-pes",
                    workflows=[CommitmentWorkflow], activities=ACTIVITIES,
                    activity_executor=executor,
                ):
                    handles = []
                    for card_id in ("T-B-001", "T-B-002"):
                        handles.append(await env.client.start_workflow(
                            CommitmentWorkflow.run, state(card_id),
                            id=workflow_id(card_id), task_queue="test-pes",
                        ))
                    await asyncio.gather(*[
                        command(handle, f"ready-{index}", "ready")
                        for index, handle in enumerate(handles)
                    ])
                    conn = get_db()
                    conn.execute(
                        "INSERT INTO capacity(week_of,total_hours,available_capacity,schedule_limit) "
                        "VALUES ('2026-08-03',40,16,11.2)"
                    )
                    conn.commit(); conn.close()
                    results = await asyncio.gather(*[
                        command(handle, f"schedule-{index}", "schedule", {
                            "planned_date": "2026-08-05",
                            "planned_duration": 400,
                        })
                        for index, handle in enumerate(handles)
                    ])
                    assert sum(result.accepted for result in results) == 1
                    conn = get_db()
                    total = conn.execute(
                        "SELECT SUM(planned_duration) FROM schedule_reservations"
                    ).fetchone()[0]
                    conn.close()
                    assert total == 400
        finally:
            await env.shutdown()
    asyncio.run(run())


def test_concurrent_activation_allows_only_one_workflow():
    async def run():
        env = await environment()
        try:
            with ThreadPoolExecutor(max_workers=8) as executor:
                async with Worker(
                    env.client, task_queue="test-pes",
                    workflows=[CommitmentWorkflow], activities=ACTIVITIES,
                    activity_executor=executor,
                ):
                    handles = []
                    for card_id in ("T-B-001", "T-B-002"):
                        handles.append(await env.client.start_workflow(
                            CommitmentWorkflow.run, state(card_id),
                            id=workflow_id(card_id), task_queue="test-pes",
                        ))
                    conn = get_db()
                    conn.execute(
                        "INSERT INTO capacity(week_of,total_hours,available_capacity,schedule_limit) "
                        "VALUES ('2026-08-03',40,40,28)"
                    )
                    conn.commit(); conn.close()
                    for index, handle in enumerate(handles):
                        assert (await command(handle, f"ready-{index}", "ready")).accepted
                        assert (await command(handle, f"schedule-{index}", "schedule", {
                            "planned_date": "2026-08-05", "planned_duration": 60,
                        })).accepted
                    results = await asyncio.gather(*[
                        command(handle, f"active-{index}", "activate")
                        for index, handle in enumerate(handles)
                    ])
                    assert sum(result.accepted for result in results) == 1
                    cards = await asyncio.gather(*[
                        handle.query(CommitmentWorkflow.card) for handle in handles
                    ])
                    assert [card.state for card in cards].count("Active") == 1
        finally:
            await env.shutdown()
    asyncio.run(run())


def test_blocked_review_and_fallback_timers_fire_once():
    async def run():
        env = await environment()
        try:
            with ThreadPoolExecutor(max_workers=8) as executor:
                async with Worker(
                    env.client, task_queue="test-pes",
                    workflows=[CommitmentWorkflow], activities=ACTIVITIES,
                    activity_executor=executor,
                ):
                    now = datetime.datetime.now(datetime.UTC)
                    planned = (now + datetime.timedelta(days=1)).date()
                    monday = planned - datetime.timedelta(days=planned.weekday())
                    review_date = (now + datetime.timedelta(days=1)).date().isoformat()
                    fallback_at = (now + datetime.timedelta(days=2)).isoformat()
                    conn = get_db()
                    conn.execute(
                        "INSERT INTO capacity(week_of,total_hours,available_capacity,schedule_limit) "
                        "VALUES (?,40,40,28)", (monday.isoformat(),)
                    )
                    conn.commit(); conn.close()
                    handle = await env.client.start_workflow(
                        CommitmentWorkflow.run,
                        state(priority=90, fallback_action="notify owner"),
                        id=workflow_id("T-B-001"), task_queue="test-pes",
                    )
                    with env.auto_time_skipping_disabled():
                        assert (await command(handle, "ready", "ready")).accepted
                        assert (await command(handle, "schedule", "schedule", {
                            "planned_date": planned.isoformat(), "planned_duration": 60,
                        })).accepted
                        assert (await command(handle, "active", "activate")).accepted
                        assert (await command(handle, "block", "block", {
                            "block_reason": "vendor", "waiting_for": "vendor",
                            "review_date": review_date,
                            "fallback_action": "notify owner",
                            "fallback_at": fallback_at,
                        })).accepted
                    await env.sleep(datetime.timedelta(days=1, hours=12))
                    card = await handle.query(CommitmentWorkflow.card)
                    assert len([e for e in card.review_events if e.startswith("blocked-review")]) == 1
                    assert not [e for e in card.review_events if e.startswith("fallback")]
                    await env.sleep(datetime.timedelta(days=1))
                    card = await handle.query(CommitmentWorkflow.card)
                    assert len([e for e in card.review_events if e.startswith("blocked-review")]) == 1
                    assert len([e for e in card.review_events if e.startswith("fallback")]) == 1
                    assert "completed" in card.what_happened
        finally:
            await env.shutdown()
    asyncio.run(run())


def test_early_unblock_makes_old_timers_harmless():
    async def run():
        env = await environment()
        try:
            with ThreadPoolExecutor(max_workers=8) as executor:
                async with Worker(
                    env.client, task_queue="test-pes",
                    workflows=[CommitmentWorkflow], activities=ACTIVITIES,
                    activity_executor=executor,
                ):
                    now = datetime.datetime.now(datetime.UTC)
                    planned = (now + datetime.timedelta(days=1)).date()
                    monday = planned - datetime.timedelta(days=planned.weekday())
                    conn = get_db()
                    conn.execute(
                        "INSERT INTO capacity(week_of,total_hours,available_capacity,schedule_limit) "
                        "VALUES (?,40,40,28)", (monday.isoformat(),)
                    )
                    conn.commit(); conn.close()
                    handle = await env.client.start_workflow(
                        CommitmentWorkflow.run,
                        state(fallback_action="notify owner"),
                        id=workflow_id("T-B-001"), task_queue="test-pes",
                    )
                    with env.auto_time_skipping_disabled():
                        for request_id, action, data in (
                            ("ready", "ready", {}),
                            ("schedule", "schedule", {
                                "planned_date": planned.isoformat(), "planned_duration": 60,
                            }),
                            ("active", "activate", {}),
                            ("block", "block", {
                                "block_reason": "vendor", "waiting_for": "vendor",
                                "review_date": (now + datetime.timedelta(days=2)).date().isoformat(),
                                "fallback_action": "notify owner",
                                "fallback_at": (now + datetime.timedelta(days=3)).isoformat(),
                            }),
                            ("unblock", "unblock", {}),
                        ):
                            assert (await command(handle, request_id, action, data)).accepted
                    await env.sleep(datetime.timedelta(days=5))
                    card = await handle.query(CommitmentWorkflow.card)
                    assert card.state == "Ready"
                    assert card.review_events == []
        finally:
            await env.shutdown()
    asyncio.run(run())


def test_external_activity_is_idempotent_for_duplicate_effect_key():
    first = activities.external_action("card:fallback:one")
    second = activities.external_action("card:fallback:one")
    assert first == second
    effects = list((database.Path(database.DB_PATH).parent / "effects").glob("*.json"))
    assert len(effects) == 1


def test_review_workflow_is_durable_and_idempotent():
    async def run():
        env = await environment()
        try:
            with ThreadPoolExecutor(max_workers=4) as executor:
                async with Worker(
                    env.client, task_queue="test-reviews",
                    workflows=[ReviewWorkflow], activities=ACTIVITIES,
                    activity_executor=executor,
                ):
                    request = ReviewRequest(
                        "end-of-day", mode="Recovery",
                        must_happen="Protect capacity", run_key="review-run-1",
                    )
                    first = await env.client.execute_workflow(
                        ReviewWorkflow.run, request, id="review-1",
                        task_queue="test-reviews",
                    )
                    second = await env.client.execute_workflow(
                        ReviewWorkflow.run, request, id="review-2",
                        task_queue="test-reviews",
                    )
                    assert first == second
                    assert first.changes_made == 1
        finally:
            await env.shutdown()
    asyncio.run(run())
    conn = get_db()
    rows = conn.execute(
        "SELECT review_type,tomorrow_mode,must_happen,run_key FROM review_runs"
    ).fetchall()
    conn.close()
    assert [tuple(row) for row in rows] == [
        ("end-of-day", "Recovery", "Protect capacity", "review-run-1")
    ]


def test_repeat_series_creates_distinct_durable_cycle():
    async def run():
        env = await environment()
        try:
            with ThreadPoolExecutor(max_workers=6) as executor:
                async with Worker(
                    env.client, task_queue="test-repeat",
                    workflows=[CommitmentWorkflow, RepeatSeriesWorkflow],
                    activities=ACTIVITIES, activity_executor=executor,
                ):
                    template = state(
                        card_id="SERIES",
                        repeat_rule="start=now; interval=daily; proof=file; review=weekly",
                        result="old result",
                        proof_location="C:/proof/old",
                    )
                    with env.auto_time_skipping_disabled():
                        handle = await env.client.start_workflow(
                            RepeatSeriesWorkflow.run,
                            RepeatSeries("SERIES", template, 86400),
                            id="pes/repeat/SERIES", task_queue="test-repeat",
                        )
                        series = None
                        for _ in range(100):
                            series = await handle.query(RepeatSeriesWorkflow.get_series)
                            if series.cycle_ids:
                                break
                            await asyncio.sleep(0.01)
                        assert series.cycle_ids == ["SERIES-R1"]
                        child = await env.client.get_workflow_handle(
                            workflow_id("SERIES-R1")
                        ).query(CommitmentWorkflow.card)
                        assert child.card_id == "SERIES-R1"
                        assert child.result is None
                        assert child.proof_location is None
                        conn = get_db()
                        projected = conn.execute(
                            "SELECT id,state FROM commitments WHERE id='SERIES-R1'"
                        ).fetchone()
                        conn.close()
                        assert tuple(projected) == ("SERIES-R1", "Captured")
                        await env.client.get_workflow_handle(
                            workflow_id("SERIES-R1")
                        ).cancel()
                        await handle.cancel()
        finally:
            await env.shutdown()
    asyncio.run(run())


def test_projection_rebuild_restores_deleted_query_state_from_temporal():
    async def run():
        env = await environment()
        try:
            with ThreadPoolExecutor(max_workers=4) as executor:
                async with Worker(
                    env.client, task_queue="test-rebuild",
                    workflows=[CommitmentWorkflow], activities=ACTIVITIES,
                    activity_executor=executor,
                ):
                    handle = await env.client.start_workflow(
                        CommitmentWorkflow.run, state(),
                        id=workflow_id("T-B-001"), task_queue="test-rebuild",
                    )
                    assert (await command(handle, "ready", "ready")).accepted
                    conn = get_db()
                    conn.execute("DELETE FROM commitments WHERE id='T-B-001'")
                    conn.commit(); conn.close()
                    results = await rebuild_commitment_projections(
                        env.client, ["T-B-001"]
                    )
                    assert results == {"T-B-001": "applied"}
                    conn = get_db()
                    restored = conn.execute(
                        "SELECT state,workflow_id,projection_version "
                        "FROM commitments WHERE id='T-B-001'"
                    ).fetchone()
                    conn.close()
                    assert tuple(restored) == (
                        "Ready", workflow_id("T-B-001"), 1
                    )
        finally:
            await env.shutdown()
    asyncio.run(run())


def test_backup_restores_temporal_and_query_data(tmp_path):
    temporal_source = tmp_path / "runtime" / "temporal.db"
    temporal_source.parent.mkdir(parents=True)
    with sqlite3.connect(temporal_source) as conn:
        conn.execute("CREATE TABLE history (workflow_id TEXT PRIMARY KEY)")
        conn.execute("INSERT INTO history VALUES ('pes/commitment/T-B-001')")
    activities.project_event(activities.ProjectionEvent(
        event_id="backup-event",
        workflow_id=workflow_id("T-B-001"),
        version=1,
        state=state(state="Ready", version=1),
        state_from="Captured",
        action="ready",
    ))
    manifest = backup_runtime(
        tmp_path / "backup", temporal_source, database.DB_PATH
    )
    restored_temporal = tmp_path / "restore" / "temporal.db"
    restored_query = tmp_path / "restore" / "pes.db"
    restore_runtime(manifest, restored_temporal, restored_query)
    with sqlite3.connect(restored_temporal) as conn:
        assert conn.execute("SELECT workflow_id FROM history").fetchone()[0] == (
            "pes/commitment/T-B-001"
        )
    with sqlite3.connect(restored_query) as conn:
        assert conn.execute(
            "SELECT state FROM commitments WHERE id='T-B-001'"
        ).fetchone()[0] == "Ready"


def test_projection_activity_is_idempotent_and_rejects_stale_write():
    initial = state()
    event = activities.ProjectionEvent(
        event_id="event-1", workflow_id=workflow_id(initial.card_id),
        version=1, state=initial, state_from=None, action="start",
    )
    assert activities.project_event(event) == "applied"
    assert activities.project_event(event) == "duplicate"
    stale = activities.ProjectionEvent(
        event_id="event-2", workflow_id=workflow_id(initial.card_id),
        version=0, state=initial, state_from=None, action="stale",
    )
    assert activities.project_event(stale) == "stale"
    conn = get_db()
    assert conn.execute("SELECT COUNT(*) FROM commitments").fetchone()[0] == 1
    assert conn.execute("SELECT COUNT(*) FROM projection_events").fetchone()[0] == 2
    conn.close()


def test_path_b_cli_exposes_only_temporal_control_requests():
    parser = build_parser()
    start = parser.parse_args([
        "path-b", "start", "T-B-CLI", "--name", "CLI",
        "--current", "none", "--desired", "done", "--proof", "file",
        "--next-action", "work",
    ])
    assert start.path_b_action == "start"
    command_args = parser.parse_args([
        "path-b", "command", "T-B-CLI", "schedule",
        "--request-id", "request-1",
        "--data", '{"planned_date":"2026-08-05","planned_duration":60}',
    ])
    assert command_args.action == "schedule"
    assert not hasattr(command_args, "state")


@pytest.mark.skip(
    reason="Temporal time-skipping server does not redispatch sticky queues "
           "after in-process worker replacement; covered by native integration proof"
)
def test_signal_sent_without_worker_is_processed_after_worker_starts():
    async def run():
        env = await environment()
        try:
            with ThreadPoolExecutor(max_workers=4) as first_executor:
                async with Worker(
                    env.client, task_queue="test-offline",
                    workflows=[CommitmentWorkflow], activities=ACTIVITIES,
                    activity_executor=first_executor,
                ):
                    handle = await env.client.start_workflow(
                        CommitmentWorkflow.run, state(),
                        id=workflow_id("T-B-001"), task_queue="test-offline",
                    )
                    assert (await command(handle, "ready", "ready")).accepted
            await handle.signal(
                CommitmentWorkflow.command,
                Command("offline-update", "update", {
                    "next_physical_action": "processed after restart",
                }),
            )
            with ThreadPoolExecutor(max_workers=4) as second_executor:
                async with Worker(
                    env.client, task_queue="test-offline",
                    workflows=[CommitmentWorkflow], activities=ACTIVITIES,
                    activity_executor=second_executor,
                ):
                    projected = None
                    for _ in range(1000):
                        conn = get_db()
                        projected = conn.execute(
                            "SELECT next_physical_action,projection_version "
                            "FROM commitments WHERE id='T-B-001'"
                        ).fetchone()
                        conn.close()
                        if projected and projected["projection_version"] == 2:
                            break
                        await asyncio.sleep(0.01)
                    assert projected["next_physical_action"] == "processed after restart"
                    result = await handle.query(
                        CommitmentWorkflow.command_result, "offline-update"
                    )
                    assert result.accepted
        finally:
            await env.shutdown()
    asyncio.run(run())


def test_nine_question_gate_uses_workflow_and_dependency_data():
    async def run():
        env = await environment()
        try:
            with ThreadPoolExecutor(max_workers=4) as executor:
                async with Worker(
                    env.client, task_queue="test-questions",
                    workflows=[CommitmentWorkflow], activities=ACTIVITIES,
                    activity_executor=executor,
                ):
                    blocker = state("BLOCKER")
                    target = state("TARGET")
                    blocker_handle = await env.client.start_workflow(
                        CommitmentWorkflow.run, blocker,
                        id=workflow_id("BLOCKER"), task_queue="test-questions",
                    )
                    handle = await env.client.start_workflow(
                        CommitmentWorkflow.run, target,
                        id=workflow_id("TARGET"), task_queue="test-questions",
                    )
                    await blocker_handle.query(CommitmentWorkflow.card)
                    await handle.query(CommitmentWorkflow.card)
                    for _ in range(200):
                        conn = get_db()
                        projected_count = conn.execute(
                            "SELECT COUNT(*) FROM commitments "
                            "WHERE id IN ('BLOCKER','TARGET')"
                        ).fetchone()[0]
                        conn.close()
                        if projected_count == 2:
                            break
                        await asyncio.sleep(0.01)
                    assert projected_count == 2
                    conn = get_db()
                    conn.execute(
                        "INSERT INTO links(from_id,to_id,link_type) "
                        "VALUES ('BLOCKER','TARGET','requires')"
                    )
                    conn.commit(); conn.close()
                    answers = await nine_questions("TARGET", env.client)
                    assert set(answers) == {
                        "what_exists_now", "required_result",
                        "work_that_must_occur", "work_that_must_occur_first",
                        "when_work_will_occur", "what_is_active_now",
                        "required_result_made", "proof_location",
                        "what_must_change_next",
                    }
                    assert answers["work_that_must_occur_first"] == ["BLOCKER"]
                    assert answers["what_exists_now"] == "not complete"
        finally:
            await env.shutdown()
    asyncio.run(run())


def test_path_b_at_001_all_new_input_enters_one_inbox():
    inbox.handle(argparse.Namespace(inbox_action="add", text=["Path", "B", "input"]))
    conn = get_db()
    rows = conn.execute("SELECT raw_text,processed_at FROM inbox").fetchall()
    conn.close()
    assert len(rows) == 1 and rows[0]["raw_text"] == "Path B input"


def test_path_b_at_002_each_commitment_has_unique_workflow_id():
    async def run():
        env = await environment()
        try:
            with ThreadPoolExecutor(max_workers=4) as executor:
                async with Worker(
                    env.client, task_queue="test-at-002",
                    workflows=[CommitmentWorkflow], activities=ACTIVITIES,
                    activity_executor=executor,
                ):
                    await env.client.start_workflow(
                        CommitmentWorkflow.run, state(),
                        id=workflow_id("T-B-001"), task_queue="test-at-002",
                    )
                    with pytest.raises(Exception):
                        await env.client.start_workflow(
                            CommitmentWorkflow.run, state(),
                            id=workflow_id("T-B-001"), task_queue="test-at-002",
                        )
        finally:
            await env.shutdown()
    asyncio.run(run())


def test_path_b_at_003_ready_requires_four_front_fields():
    test_path_b_rejects_invalid_ready_and_deduplicates_signal()


def test_path_b_at_004_no_more_than_one_active():
    test_concurrent_activation_allows_only_one_workflow()


def test_path_b_at_005_scheduled_cards_count_against_capacity():
    test_concurrent_schedule_signals_cannot_oversubscribe_capacity()


def test_path_b_at_006_planning_stays_within_seventy_percent():
    test_concurrent_schedule_signals_cannot_oversubscribe_capacity()


def test_path_b_at_007_blocked_card_has_review_date():
    test_blocked_review_and_fallback_timers_fire_once()
    conn = get_db()
    row = conn.execute(
        "SELECT state,review_date FROM commitments WHERE id='T-B-001'"
    ).fetchone()
    conn.close()
    assert row["state"] == "Blocked" and row["review_date"]


def test_path_b_at_008_high_priority_or_risk_has_fallback():
    test_blocked_review_and_fallback_timers_fire_once()
    conn = get_db()
    row = conn.execute(
        "SELECT priority,fallback_action FROM commitments WHERE id='T-B-001'"
    ).fetchone()
    conn.close()
    assert row["priority"] >= 80 and row["fallback_action"]


def test_path_b_at_009_done_passed_verified_proof_gate():
    test_path_b_workflow_accepts_valid_flow_and_projects_proof()
    conn = get_db()
    row = conn.execute(
        "SELECT c.state,p.verified FROM commitments c "
        "JOIN proof_index p ON p.card_id=c.id WHERE c.id='T-B-001'"
    ).fetchone()
    conn.close()
    assert tuple(row) == ("Done", 1)


def test_path_b_at_010_each_review_makes_system_change():
    test_review_workflow_is_durable_and_idempotent()


def test_path_b_at_011_each_mapped_task_links_to_card():
    parent = state("PROJECT")
    task = state("TASK", parent_id="PROJECT")
    activities.project_event(activities.ProjectionEvent(
        "project", workflow_id("PROJECT"), 0, parent, None, "start"
    ))
    activities.project_event(activities.ProjectionEvent(
        "task", workflow_id("TASK"), 0, task, None, "start"
    ))
    conn = get_db()
    add_link(conn, "PROJECT", "TASK", "produces")
    conn.commit()
    cards, links = outcome_map(conn, "PROJECT")
    conn.close()
    assert {card["id"] for card in cards} == {"PROJECT", "TASK"}
    assert links[0]["to_id"] == "TASK"


def test_path_b_at_012_each_work_block_makes_log_entry():
    test_blocked_review_and_fallback_timers_fire_once()
    conn = get_db()
    row = conn.execute(
        "SELECT state_from,state_to,actual_end FROM log "
        "WHERE card_id='T-B-001' AND state_to='Blocked'"
    ).fetchone()
    conn.close()
    assert tuple(row) == ("Active", "Blocked", row["actual_end"])


def test_path_b_at_013_open_card_has_valid_state_and_place():
    test_projection_rebuild_restores_deleted_query_state_from_temporal()
    conn = get_db()
    row = conn.execute(
        "SELECT state,schedule_status FROM commitments WHERE id='T-B-001'"
    ).fetchone()
    conn.close()
    assert row["state"] in STATES
    assert row["schedule_status"] in {"scheduled", "unscheduled"}


def test_path_b_at_014_closed_card_stays_in_records():
    test_path_b_workflow_accepts_valid_flow_and_projects_proof()
    init_db()
    conn = get_db()
    assert conn.execute(
        "SELECT state FROM commitments WHERE id='T-B-001'"
    ).fetchone()[0] == "Done"
    conn.close()


def test_path_b_at_015_completed_result_has_findable_proof():
    test_path_b_workflow_accepts_valid_flow_and_projects_proof()
    conn = get_db()
    proof = conn.execute(
        "SELECT proof_location FROM proof_index WHERE card_id='T-B-001'"
    ).fetchone()[0]
    conn.close()
    assert proof == "C:/proof/path-b"
