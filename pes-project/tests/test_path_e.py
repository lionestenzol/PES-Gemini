import datetime as dt

import pytest

from pes import database
from pes.database import get_db, init_db
from pes.path_e import Engine, EngineError, HTTPClient, InProcessClient, start_server


@pytest.fixture
def engine(tmp_path, monkeypatch):
    path = tmp_path / "path-e" / "pes.db"
    monkeypatch.setattr(database, "DB_PATH", str(path))
    init_db()
    ticks = iter(f"id-{index}" for index in range(100))
    return Engine(clock=lambda: dt.datetime(2026, 8, 4, 12, tzinfo=dt.timezone.utc),
                  id_factory=lambda: next(ticks))


def card(card_id="E-001", **changes):
    value = {"id": card_id, "name": f"Card {card_id}",
             "current_state_desc": "not done", "desired_state_desc": "done",
             "proof_of_completion": "saved proof", "next_physical_action": "work"}
    value.update(changes); return value


def test_in_process_and_http_clients_share_one_engine_and_truth(engine):
    local = InProcessClient(engine)
    server, thread = start_server(engine)
    remote = HTTPClient(f"http://127.0.0.1:{server.server_port}")
    try:
        created = local.create(card())
        assert remote.get("E-001")["data"] == created["data"]
        remote.move("E-001", "Ready")
        assert local.get("E-001")["data"]["state"] == "Ready"
        assert remote.view("ready")["data"] == local.view("ready")["data"]
    finally:
        server.shutdown(); server.server_close(); thread.join(timeout=2)


def test_create_is_idempotent_per_actor_and_key(engine):
    first = engine.create(card(), actor="alice", request_id="request-1", idempotency_key="create-1")
    second = engine.create(card(), actor="alice", request_id="request-2", idempotency_key="create-1")
    assert second == first
    conn = get_db()
    assert conn.execute("SELECT COUNT(*) FROM commitments").fetchone()[0] == 1
    assert conn.execute("SELECT COUNT(*) FROM path_e_events").fetchone()[0] == 1
    conn.close()


def test_clients_receive_same_stable_guard_fault(engine):
    engine.create(card(current_state_desc=""))
    local_error = None
    try:
        engine.move("E-001", "Ready")
    except EngineError as exc:
        local_error = (exc.code, exc.message)
    server, thread = start_server(engine)
    try:
        with pytest.raises(EngineError) as remote:
            HTTPClient(f"http://127.0.0.1:{server.server_port}").move("E-001", "Ready")
        assert (remote.value.code, remote.value.message) == local_error
        assert local_error[0] == "PES_RULE_REJECTED"
    finally:
        server.shutdown(); server.server_close(); thread.join(timeout=2)


def test_stale_version_changes_no_data(engine):
    original = engine.create(card())["data"]
    engine.move("E-001", "Ready")
    with pytest.raises(EngineError, match="refresh") as error:
        engine.move("E-001", "Canceled", expected_updated_at=original["updated_at"])
    assert error.value.code == "STALE_VERSION"
    assert engine.get("E-001")["data"]["state"] == "Ready"


def test_unknown_input_and_missing_card_have_safe_contract_errors(engine):
    with pytest.raises(EngineError) as unknown:
        engine.create(card(secret_backend_field="no"))
    assert unknown.value.payload()["error"] == {
        "code": "UNKNOWN_FIELD", "message": "unknown field: secret_backend_field",
        "field": "secret_backend_field",
    }
    with pytest.raises(EngineError) as missing:
        engine.get("absent")
    assert missing.value.code == "NOT_FOUND" and missing.value.status == 404


def test_view_is_bounded_sorted_and_empty_is_not_a_fault(engine):
    assert engine.view("ready")["data"] == []
    for index in range(3):
        engine.create(card(f"E-{index}", priority=index))
    result = engine.view("inbox", limit=999)
    assert [item["priority"] for item in result["data"]] == [2, 1, 0]
    assert result["page"]["limit"] == 200


def test_history_is_append_only_for_public_commands(engine):
    engine.create(card(), actor="alice", request_id="r-create")
    engine.move("E-001", "Ready", actor="alice", request_id="r-move")
    history = engine.history("E-001")["data"]
    assert [(event["event_type"], event["old_state"], event["new_state"])
            for event in history] == [
        ("commitment.created", None, "Captured"),
        ("commitment.moved", "Captured", "Ready"),
    ]
    assert [event["request_id"] for event in history] == ["r-create", "r-move"]


def test_extended_contract_matches_through_both_clients(engine):
    local = InProcessClient(engine)
    server, thread = start_server(engine)
    remote = HTTPClient(f"http://127.0.0.1:{server.server_port}")
    try:
        local.create(card("E-A"))
        remote.create(card("E-B"))
        updated = remote.update("E-A", {"priority": 90})
        assert local.get("E-A")["data"] == updated["data"]
        capacity = local.set_capacity({
            "week_of": "2026-08-05", "total_hours": 40,
            "fixed_commitments": 12, "meals_travel_transitions": 6,
            "recovery_reserve": 6,
        })
        assert remote.get_capacity("2026-08-03")["data"] == capacity["data"]
        remote.add_link({"from_id": "E-A", "to_id": "E-B", "link_type": "blocks"})
        conn = get_db()
        assert tuple(conn.execute("SELECT from_id,to_id,link_type FROM links").fetchone()) == ("E-A", "E-B", "blocks")
        conn.close()
        local.remove_link("E-A", "E-B", "blocks")
        assert remote.health()["data"] == {
            "process": "healthy", "backend": "ready", "api_version": "v1"
        }
        assert {event["event_type"] for event in remote.log()["data"]} >= {
            "commitment.created", "commitment.updated", "capacity.set",
            "link.created", "link.removed",
        }
    finally:
        server.shutdown(); server.server_close(); thread.join(timeout=2)


def test_direct_state_patch_is_rejected_and_update_conflicts_are_safe(engine):
    created = engine.create(card())["data"]
    with pytest.raises(EngineError) as direct:
        engine.update("E-001", {"state": "Done"})
    assert direct.value.code == "STATE_MOVE_REQUIRED"
    engine.update("E-001", {"priority": 5}, expected_updated_at=created["updated_at"])
    with pytest.raises(EngineError) as stale:
        engine.update("E-001", {"priority": 10}, expected_updated_at=created["updated_at"])
    assert stale.value.code == "STALE_VERSION"
    assert engine.get("E-001")["data"]["priority"] == 5


def test_capacity_and_link_faults_change_no_data(engine):
    engine.create(card("E-A")); engine.create(card("E-B"))
    with pytest.raises(EngineError) as bad_capacity:
        engine.set_capacity({"week_of": "2026-08-03", "total_hours": 10,
                             "fixed_commitments": 8, "meals_travel_transitions": 4,
                             "recovery_reserve": 0})
    assert bad_capacity.value.code == "VALIDATION_ERROR"
    with pytest.raises(EngineError) as self_link:
        engine.add_link({"from_id": "E-A", "to_id": "E-A", "link_type": "blocks"})
    assert self_link.value.code == "PES_RULE_REJECTED"
    conn = get_db()
    assert conn.execute("SELECT COUNT(*) FROM capacity").fetchone()[0] == 0
    assert conn.execute("SELECT COUNT(*) FROM links").fetchone()[0] == 0
    conn.close()
