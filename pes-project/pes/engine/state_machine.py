from pes.database import get_db
from pes.engine.constraint_engine import (
    guard_ready, guard_schedule, guard_active,
    guard_no_dependent_regression, guard_block, guard_completion,
    guard_completed, guard_paused
)
import datetime

VALID_TRANSITIONS = {
    'Captured': ['Ready', 'Canceled'],
    'Ready': ['Scheduled', 'Canceled', 'Captured'],
    'Scheduled': ['Active', 'Ready', 'Canceled'],
    'Active': ['Completed', 'Paused', 'Blocked', 'Canceled'],
    'Completed': ['Verified', 'Active', 'Ready', 'Canceled'],
    'Verified': ['Done', 'Canceled', 'Completed'],
    'Done': [],
    'Paused': ['Active', 'Canceled'],
    'Blocked': ['Ready', 'Canceled'],
    'Canceled': [],
}

def move_card(card_id, target_state, _conn=None, **kwargs):
    conn = _conn or get_db()
    owns_connection = _conn is None
    try:
        if owns_connection:
            conn.execute("BEGIN IMMEDIATE")
        card = conn.execute("SELECT * FROM commitments WHERE id = ?", (card_id,)).fetchone()
        if not card:
            raise ValueError(f"Card {card_id} not found")

        current_state = card['state']
        if target_state not in VALID_TRANSITIONS.get(current_state, []):
            raise ValueError(f"Invalid transition {current_state} -> {target_state}")

        # Regression guard: moving away from a dependency‑satisfying state
        if current_state in ('Verified', 'Done') and target_state not in ('Verified', 'Done'):
            guard_no_dependent_regression(conn, card_id, target_state)

        # Entry guards
        if target_state == 'Ready':
            guard_ready(conn, card)
        elif target_state == 'Scheduled':
            guard_schedule(conn, card)
        elif target_state == 'Active':
            guard_active(conn, card)
            if not kwargs.get("actual_start"):
                raise ValueError("Active gate failed: actual_start is required")
        elif target_state == 'Completed' and current_state == 'Active':
            guard_completed(kwargs)
        elif target_state == 'Paused':
            guard_paused(kwargs)
        elif target_state == 'Verified':
            guard_completion(conn, card)
        elif target_state == 'Blocked':
            kwargs["card"] = card
            guard_block(conn, kwargs)

        # Manage schedule_status
        new_schedule_status = card['schedule_status']
        if target_state == 'Scheduled':
            new_schedule_status = 'scheduled'
        elif target_state in ('Active', 'Paused', 'Blocked'):
            pass  # keep existing schedule status
        elif target_state in ('Completed', 'Verified', 'Done'):
            new_schedule_status = 'unscheduled'
        elif target_state in ('Ready', 'Canceled'):
            new_schedule_status = 'unscheduled'

        # Prepare update fields
        update_fields = {
            "state": target_state,
            "updated_at": datetime.datetime.now().isoformat(),
            "schedule_status": new_schedule_status,
        }
        allowed = [
            "actual_start", "actual_end", "result", "proof_location", "what_happened",
            "next_physical_action", "block_reason", "waiting_for", "review_date",
            "fallback_action", "planned_date", "planned_start", "planned_end", "planned_duration",
            "current_state_desc", "desired_state_desc", "proof_of_completion"
        ]
        for key in allowed:
            if key in kwargs and kwargs[key] is not None:
                update_fields[key] = kwargs[key]

        set_clause = ", ".join(f"{k} = ?" for k in update_fields)
        values = list(update_fields.values()) + [card_id]
        conn.execute(f"UPDATE commitments SET {set_clause} WHERE id = ?", values)

        # Log transition
        conn.execute(
            "INSERT INTO log (card_id, state_from, state_to, note, actual_start, actual_end) VALUES (?, ?, ?, ?, ?, ?)",
            (card_id, current_state, target_state, kwargs.get("note"), kwargs.get("actual_start"), kwargs.get("actual_end"))
        )

        # Upsert proof index when Verified
        if target_state == 'Verified':
            result_text = update_fields.get('result') or card['result']
            proof_loc = update_fields.get('proof_location') or card['proof_location']
            now = datetime.datetime.now().isoformat()
            conn.execute(
                "INSERT INTO proof_index (card_id, result, proof_location, verified, verified_at) "
                "VALUES (?, ?, ?, 1, ?) ON CONFLICT(card_id) DO UPDATE SET result=excluded.result, "
                "proof_location=excluded.proof_location, verified=1, verified_at=excluded.verified_at",
                (card_id, result_text, proof_loc, now)
            )

        if owns_connection:
            conn.commit()
        return card_id
    except Exception:
        if owns_connection:
            conn.rollback()
        raise
    finally:
        if owns_connection:
            conn.close()
