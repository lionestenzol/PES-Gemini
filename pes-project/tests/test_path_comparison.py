import pytest

from pes import database
from pes.database import get_db, init_db
from pes.engine.state_machine import VALID_TRANSITIONS as PATH_A_TRANSITIONS
from pes.temporal.models import VALID_TRANSITIONS as PATH_B_TRANSITIONS
from tests import test_path_a as path_a
from tests import test_path_b as path_b


@pytest.fixture(autouse=True)
def isolated_comparison_db(tmp_path, monkeypatch):
    db_path = tmp_path / "comparison" / "pes.db"
    monkeypatch.setattr(database, "DB_PATH", str(db_path))
    init_db()


def reset_control_store():
    conn = get_db()
    conn.execute("PRAGMA foreign_keys=OFF")
    for table in (
        "links", "log", "proof_index", "projection_events",
        "schedule_reservations", "active_lock", "review_runs",
        "commitments", "capacity", "inbox",
    ):
        conn.execute(f"DELETE FROM {table}")
    conn.commit()
    conn.close()


PAIRS = [
    ("AT-001", path_a.test_at_001_all_new_input_enters_one_inbox,
     path_b.test_path_b_at_001_all_new_input_enters_one_inbox),
    ("AT-002", path_a.test_at_002_controlled_commitment_has_one_unique_card_id,
     path_b.test_path_b_at_002_each_commitment_has_unique_workflow_id),
    ("AT-003", path_a.test_at_003_ready_requires_all_four_front_fields,
     path_b.test_path_b_at_003_ready_requires_four_front_fields),
    ("AT-004", path_a.test_at_004_only_one_card_can_be_active,
     path_b.test_path_b_at_004_no_more_than_one_active),
    ("AT-005", path_a.test_at_005_scheduled_cards_count_against_week_capacity,
     path_b.test_path_b_at_005_scheduled_cards_count_against_capacity),
    ("AT-006", path_a.test_at_006_planned_work_cannot_exceed_seventy_percent_limit,
     path_b.test_path_b_at_006_planning_stays_within_seventy_percent),
    ("AT-007", path_a.test_at_007_blocked_card_requires_review_date,
     path_b.test_path_b_at_007_blocked_card_has_review_date),
    ("AT-008", path_a.test_at_008_high_priority_or_risk_requires_fallback,
     path_b.test_path_b_at_008_high_priority_or_risk_has_fallback),
    ("AT-009", path_a.test_at_009_done_requires_verified_checked_proof,
     path_b.test_path_b_at_009_done_passed_verified_proof_gate),
    ("AT-010", path_a.test_at_010_each_review_records_a_system_change,
     path_b.test_path_b_at_010_each_review_makes_system_change),
    ("AT-011", path_a.test_at_011_each_mapped_task_links_to_a_card,
     path_b.test_path_b_at_011_each_mapped_task_links_to_card),
    ("AT-012", path_a.test_at_012_each_work_block_makes_a_log_entry,
     path_b.test_path_b_at_012_each_work_block_makes_log_entry),
    ("AT-013", path_a.test_at_013_each_open_card_has_a_valid_state_and_place,
     path_b.test_path_b_at_013_open_card_has_valid_state_and_place),
    ("AT-014", path_a.test_at_014_closed_card_stays_in_records_after_reopen,
     path_b.test_path_b_at_014_closed_card_stays_in_records),
    ("AT-015", path_a.test_at_015_completed_result_has_findable_proof_location,
     path_b.test_path_b_at_015_completed_result_has_findable_proof),
]


@pytest.mark.parametrize("gate,path_a_test,path_b_test", PAIRS, ids=[p[0] for p in PAIRS])
def test_path_a_path_b_acceptance_parity(gate, path_a_test, path_b_test):
    path_a_test()
    reset_control_store()
    path_b_test()


def test_path_a_path_b_transition_laws_are_identical():
    normalized_a = {
        state: frozenset(targets) for state, targets in PATH_A_TRANSITIONS.items()
    }
    normalized_b = {
        state: frozenset(targets) for state, targets in PATH_B_TRANSITIONS.items()
    }
    assert normalized_a == normalized_b
