import datetime

def guard_ready(conn, card):
    required = ['current_state_desc', 'desired_state_desc', 'proof_of_completion', 'next_physical_action']
    for f in required:
        if not card[f] or not str(card[f]).strip():
            raise ValueError(f"Ready gate failed: {f} is empty")
    if card["priority"] >= 80 or card["risk_level"] == "High":
        if not card["fallback_action"] or not str(card["fallback_action"]).strip():
            raise ValueError("Ready gate failed: fallback_action is required for high-priority or high-risk work")

def guard_schedule(conn, card):
    if not card['proof_of_completion'] or not str(card['proof_of_completion']).strip():
        raise ValueError("proof_of_completion is empty")
    if not card['planned_date']:
        raise ValueError("planned_date not set")

    duration = card['planned_duration']
    if not isinstance(duration, int) or duration <= 0:
        raise ValueError("planned_duration must be a positive integer")

    planned_date = datetime.date.fromisoformat(card['planned_date'])
    week_monday = planned_date - datetime.timedelta(days=planned_date.weekday())
    cap = conn.execute("SELECT * FROM capacity WHERE week_of = ?", (week_monday.isoformat(),)).fetchone()
    if not cap:
        raise ValueError(f"Capacity not set for week {week_monday}. Use 'pes capacity set'")

    week_end = week_monday + datetime.timedelta(days=6)
    rows = conn.execute("""
        SELECT planned_duration FROM commitments
        WHERE schedule_status = 'scheduled'
          AND planned_date BETWEEN ? AND ?
    """, (week_monday.isoformat(), week_end.isoformat())).fetchall()
    total_minutes = sum(r['planned_duration'] for r in rows if r['planned_duration'] is not None)
    total_hours = (total_minutes + duration) / 60.0
    if total_hours > cap['schedule_limit']:
        raise ValueError(f"Weekly limit {cap['schedule_limit']}h exceeded ({total_hours:.1f}h)")

    _guard_dependencies(conn, card['id'])

def guard_active(conn, card):
    _guard_dependencies(conn, card['id'])
    active = conn.execute("SELECT id FROM commitments WHERE state = 'Active' AND id != ?", (card['id'],)).fetchone()
    if active:
        raise ValueError(f"Another card ({active['id']}) is already Active")

def guard_completed(kwargs):
    if not kwargs.get("result") or not str(kwargs["result"]).strip():
        raise ValueError("Completed gate failed: result is required")
    if not kwargs.get("actual_end"):
        raise ValueError("Completed gate failed: actual_end is required")

def guard_paused(kwargs):
    if not kwargs.get("actual_end"):
        raise ValueError("Paused gate failed: actual_end is required")
    if not kwargs.get("what_happened"):
        raise ValueError("Paused gate failed: what_happened is required")
    if not kwargs.get("next_physical_action"):
        raise ValueError("Paused gate failed: next_physical_action is required")

def _guard_dependencies(conn, card_id):
    blockers = conn.execute("""
        SELECT l.from_id, c.state FROM links l
        JOIN commitments c ON c.id = l.from_id
        WHERE l.to_id = ? AND l.link_type IN ('blocks', 'requires')
    """, (card_id,)).fetchall()
    unfinished = [b['from_id'] for b in blockers if b['state'] not in ('Verified', 'Done')]
    if unfinished:
        raise ValueError(f"Dependencies not met. Waiting on: {', '.join(unfinished)}")

def guard_no_dependent_regression(conn, card_id, new_state):
    if new_state in ('Verified', 'Done'):
        return
    dependents = conn.execute("""
        SELECT to_id, state FROM links
        JOIN commitments ON commitments.id = links.to_id
        WHERE links.from_id = ? AND links.link_type IN ('blocks', 'requires')
          AND commitments.state IN ('Scheduled', 'Active')
    """, (card_id,)).fetchall()
    if dependents:
        dep_ids = [d['to_id'] for d in dependents]
        raise ValueError(f"Cannot move {card_id} to {new_state}: cards {', '.join(dep_ids)} depend on it and are Scheduled/Active. Reschedule or cancel them first.")

def guard_block(conn, kwargs):
    if not kwargs.get('block_reason'):
        raise ValueError("block_reason required")
    if not kwargs.get('review_date'):
        raise ValueError("review_date required")
    if not kwargs.get('waiting_for'):
        raise ValueError("waiting_for required")
    card = kwargs.get("card")
    if card and (card["priority"] >= 80 or card["risk_level"] == "High"):
        if not kwargs.get("fallback_action"):
            raise ValueError("fallback_action required for high-priority or high-risk blocked work")

def guard_completion(conn, card):
    result = card["result"]
    proof_location = card["proof_location"]

    if not result or not str(result).strip():
        raise ValueError("Completion gate failed: result is missing")
    if not proof_location or not str(proof_location).strip():
        raise ValueError("Completion gate failed: proof_location is missing")

    gate_passed = (
        card["desired_result_made"]
        and card["proof_exists"]
        and card["proof_stored"]
        and not card["required_action_remains"]
    )
    if not gate_passed:
        raise ValueError("Completion gate failed: verify facts are not valid")
