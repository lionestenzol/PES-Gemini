import pytest
import os
import tempfile
import datetime
from pes.database import init_db, get_db
from pes.engine.state_machine import move_card
from pes.engine.time_engine import compute_capacity

@pytest.fixture(autouse=True)
def setup_db(monkeypatch):
    tmp = tempfile.NamedTemporaryFile(delete=False)
    db_path = tmp.name
    tmp.close()
    monkeypatch.setattr("pes.database.DB_PATH", db_path)
    monkeypatch.setattr("pes.database.get_db_path", lambda: db_path)
    init_db()
    yield
    os.unlink(db_path)

def set_capacity(conn, week, total=40, fixed=12, meals=6, recovery=6):
    avail, limit = compute_capacity(total, fixed, meals, recovery)
    conn.execute(
        "INSERT OR REPLACE INTO capacity (week_of, total_hours, fixed_commitments, "
        "meals_travel_transitions, recovery_reserve, available_capacity, schedule_limit) "
        "VALUES (?,?,?,?,?,?,?)",
        (week, total, fixed, meals, recovery, avail, limit)
    )
    conn.commit()

def _add_card(conn, card_id, **kwargs):
    defaults = {
        "name": f"Card {card_id}",
        "state": "Captured",
        "level": "Task",
        "current_state_desc": "not started",
        "desired_state_desc": "done",
        "proof_of_completion": "proof",
        "next_physical_action": "act",
        "planned_date": None,
        "planned_duration": 60,
        "schedule_status": "unscheduled",
        "result": None,
        "proof_location": None,
        "desired_result_made": 0,
        "proof_exists": 0,
        "proof_stored": 0,
        "required_action_remains": 1,
    }
    defaults.update(kwargs)

    conn.execute(
        """
        INSERT INTO commitments (
            id, name, state, level, current_state_desc, desired_state_desc,
            proof_of_completion, next_physical_action, planned_date, planned_duration,
            schedule_status, result, proof_location,
            desired_result_made, proof_exists, proof_stored, required_action_remains,
            created_at, updated_at
        ) VALUES (
            ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
            ?, ?, ?, ?, ?, ?,
            datetime('now'), datetime('now')
        )
        """,
        (
            card_id,
            defaults["name"],
            defaults["state"],
            defaults["level"],
            defaults["current_state_desc"],
            defaults["desired_state_desc"],
            defaults["proof_of_completion"],
            defaults["next_physical_action"],
            defaults["planned_date"],
            defaults["planned_duration"],
            defaults["schedule_status"],
            defaults["result"],
            defaults["proof_location"],
            defaults["desired_result_made"],
            defaults["proof_exists"],
            defaults["proof_stored"],
            defaults["required_action_remains"],
        ),
    )
    conn.commit()

# Test 1: missing required field blocks Ready
def test_ready_requires_current_state():
    conn = get_db()
    _add_card(conn, "T-001", current_state_desc="", desired_state_desc="desired", proof_of_completion="proof", next_physical_action="act")
    with pytest.raises(ValueError, match="Ready gate"):
        move_card("T-001", "Ready")
    conn.close()

# Test 2: open dependency blocks Scheduled
def test_schedule_blocked_by_dependency():
    conn = get_db()
    set_capacity(conn, "2026-08-03")
    _add_card(conn, "A", state="Captured")
    _add_card(conn, "B", state="Ready", planned_date="2026-08-05", planned_duration=60)
    conn.execute("INSERT INTO links (from_id, to_id, link_type) VALUES ('A', 'B', 'blocks')")
    conn.commit()
    with pytest.raises(ValueError, match="Dependencies not met"):
        move_card("B", "Scheduled")
    conn.close()

# Test 3: open dependency blocks Active
def test_active_blocked_by_dependency():
    conn = get_db()
    set_capacity(conn, "2026-08-03")
    _add_card(conn, "A", state="Captured")
    _add_card(conn, "B", state="Scheduled", planned_date="2026-08-05", planned_duration=60, schedule_status="scheduled")
    conn.execute("INSERT INTO links (from_id, to_id, link_type) VALUES ('A', 'B', 'blocks')")
    conn.commit()
    with pytest.raises(ValueError, match="Dependencies not met"):
        move_card("B", "Active")
    conn.close()

# Test 4: only one Active card allowed
def test_single_active():
    conn = get_db()
    set_capacity(conn, "2026-08-03")
    _add_card(conn, "X", state="Scheduled", planned_date="2026-08-05", planned_duration=60, schedule_status="scheduled")
    _add_card(conn, "Y", state="Scheduled", planned_date="2026-08-05", planned_duration=60, schedule_status="scheduled")
    move_card("X", "Active", actual_start=datetime.datetime.now().isoformat())
    with pytest.raises(ValueError, match="Another card"):
        move_card("Y", "Active")
    conn.close()

# Test 5: capacity limit enforced via schedule_status
def test_capacity_limit():
    conn = get_db()
    set_capacity(conn, "2026-08-03", total=40, fixed=12, meals=6, recovery=6)
    _add_card(conn, "C1", state="Scheduled", planned_date="2026-08-05", planned_duration=600, schedule_status="scheduled")
    _add_card(conn, "C2", state="Ready", planned_date="2026-08-05", planned_duration=120)
    with pytest.raises(ValueError, match="Weekly limit"):
        move_card("C2", "Scheduled")
    conn.close()

# Test 6: Completed without proper verify facts cannot become Verified
def test_verify_gate_must_pass():
    conn = get_db()
    _add_card(conn, "T", state="Completed", result="done", proof_location="/proof",
              desired_result_made=0, proof_exists=0, proof_stored=0, required_action_remains=1)
    with pytest.raises(ValueError, match="Completion gate"):
        move_card("T", "Verified")
    conn.execute("UPDATE commitments SET desired_result_made=1, proof_exists=1, proof_stored=1, required_action_remains=0 WHERE id='T'")
    conn.commit()
    move_card("T", "Verified")  # should now succeed
    conn.close()

# Test 7: one proof row per Verified card
def test_proof_index_unique():
    conn = get_db()
    _add_card(conn, "P", state="Completed", result="done", proof_location="/proof",
              desired_result_made=1, proof_exists=1, proof_stored=1, required_action_remains=0)
    move_card("P", "Verified")
    move_card("P", "Completed", note="rework")
    conn.execute("UPDATE commitments SET desired_result_made=1, proof_exists=1, proof_stored=1, required_action_remains=0 WHERE id='P'")
    conn.commit()
    move_card("P", "Verified")
    proof_count = conn.execute("SELECT COUNT(*) as cnt FROM proof_index WHERE card_id='P'").fetchone()['cnt']
    assert proof_count == 1
    conn.close()

# Test 8: every move creates exactly one log entry
def test_log_entry_count():
    conn = get_db()
    set_capacity(conn, "2026-08-03")
    _add_card(conn, "L", state="Ready", planned_date="2026-08-05", planned_duration=60)
    log_before = conn.execute("SELECT COUNT(*) as cnt FROM log").fetchone()['cnt']
    move_card("L", "Scheduled")
    log_after = conn.execute("SELECT COUNT(*) as cnt FROM log").fetchone()['cnt']
    assert log_after - log_before == 1
    conn.close()

# Test 9: a failed guard changes no data
def test_failed_guard_changes_no_data():
    conn = get_db()
    _add_card(conn, "A1", state="Ready", planned_date=None, planned_duration=60)
    before = dict(conn.execute("SELECT * FROM commitments WHERE id = ?", ("A1",)).fetchone())
    log_before = conn.execute("SELECT COUNT(*) as cnt FROM log").fetchone()['cnt']
    with pytest.raises(ValueError, match="planned_date not set"):
        move_card("A1", "Scheduled")
    after = dict(conn.execute("SELECT * FROM commitments WHERE id = ?", ("A1",)).fetchone())
    log_after = conn.execute("SELECT COUNT(*) as cnt FROM log").fetchone()['cnt']
    assert after == before
    assert log_after == log_before
    conn.close()

# Test 10: regression from Verified blocked if dependents active
def test_verified_regression_blocked():
    conn = get_db()
    _add_card(conn, "V", state="Verified", desired_result_made=1, proof_exists=1, proof_stored=1, required_action_remains=0)
    _add_card(conn, "D", state="Scheduled", planned_date="2026-08-05", planned_duration=60, schedule_status="scheduled")
    conn.execute("INSERT INTO links (from_id, to_id, link_type) VALUES ('V', 'D', 'blocks')")
    conn.commit()
    with pytest.raises(ValueError, match="depend on it"):
        move_card("V", "Canceled")
    conn.close()

# Test 11: init creates database folder
def test_init_creates_database_folder(tmp_path, monkeypatch):
    db_path = tmp_path / "new-folder" / "pes.db"
    monkeypatch.setattr("pes.database.DB_PATH", str(db_path))
    init_db()
    assert db_path.exists()
