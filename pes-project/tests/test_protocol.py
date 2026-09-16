import datetime

import pytest

from pes import database
from pes.commands import protocol
from pes.database import get_db, init_db


@pytest.fixture(autouse=True)
def isolated_db(tmp_path, monkeypatch):
    path = tmp_path / "protocol" / "pes.db"
    monkeypatch.setattr(database, "DB_PATH", str(path))
    init_db()


def test_protocol_start_is_idempotent_and_spans_fourteen_days():
    run_id = protocol.start("B", "2026-08-02")
    assert protocol.start("B", "2026-08-02") == run_id
    result = protocol.status(run_id)
    assert result["started_on"] == "2026-08-02"
    assert result["ends_on"] == "2026-08-15"
    assert not result["ready_to_complete"]


def test_protocol_rejects_unknown_evidence_and_early_completion():
    run_id = protocol.start("A", datetime.date.today().isoformat())
    with pytest.raises(ValueError, match="unknown event type"):
        protocol.record(run_id, "invented", "not a checklist event")
    with pytest.raises(ValueError, match="not complete"):
        protocol.complete(run_id)


@pytest.mark.parametrize("path", ["A", "B"])
def test_protocol_completes_only_after_elapsed_gate_and_all_evidence(path):
    started = datetime.date.today() - datetime.timedelta(days=13)
    run_id = protocol.start(path, started.isoformat())
    for event_type, required in protocol.REQUIREMENTS[path].items():
        for index in range(required):
            protocol.record(
                run_id, event_type,
                f"{event_type} evidence {index + 1}",
                outcome="pass",
            )
    result = protocol.status(run_id)
    assert result["elapsed_gate_passed"]
    assert result["missing"] == {}
    assert result["ready_to_complete"]
    protocol.complete(run_id)
    assert protocol.status(run_id)["status"] == "complete"


def test_failed_event_does_not_satisfy_requirement_and_friction_is_retained():
    run_id = protocol.start("B", "2026-08-02")
    protocol.record(
        run_id, "activity_retry", "retry exhausted",
        outcome="fail", friction="external endpoint unavailable",
    )
    result = protocol.status(run_id)
    assert result["event_counts"].get("activity_retry", 0) == 0
    conn = get_db()
    event = conn.execute(
        "SELECT outcome,friction FROM protocol_events WHERE run_id=?", (run_id,)
    ).fetchone()
    conn.close()
    assert tuple(event) == ("fail", "external endpoint unavailable")


def test_path_e_protocol_tracks_two_week_multi_client_evidence():
    run_id = protocol.start("E", "2026-08-02")
    result = protocol.status(run_id)
    assert result["path"] == "E"
    assert result["missing"]["real_commitment"] == 20
    protocol.record(run_id, "client_a_to_b", "E-A changed through local client and read through HTTP", outcome="pass")
    assert protocol.status(run_id)["event_counts"]["client_a_to_b"] == 1
