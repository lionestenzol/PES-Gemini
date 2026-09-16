from pes.database import get_db
from pes.engine.state_machine import move_card
import datetime
import re

FIELD_MAP = {
    "name": "name",
    "current": "current_state_desc",
    "desired": "desired_state_desc",
    "proof": "proof_of_completion",
    "next_action": "next_physical_action",
    "level": "level",
    "parent": "parent_id",
}

ALLOWED_UPDATE_FIELDS = {
    "planned_date", "planned_start", "planned_duration", "priority", "risk_level",
    "current_state_desc", "desired_state_desc", "proof_of_completion", "next_physical_action",
    "parent_id", "name", "planned_end", "repeat_rule", "owner", "fallback_action"
    , "deadline", "earliest_start", "latest_end", "time_fixed", "pinned", "planned_result"
}

def handle(args):
    if args.card_action == "define":
        _define(args)
    elif args.card_action == "show":
        _show(args)
    elif args.card_action == "move":
        _move(args)
    elif args.card_action == "list":
        _list(args)
    elif args.card_action == "update":
        _update(args)

def _define(args):
    conn = get_db()
    existing = conn.execute("SELECT id FROM commitments WHERE id=?", (args.id,)).fetchone()
    if not existing:
        if not args.name:
            raise ValueError("--name is required for a new card")
        if args.parent:
            parent = conn.execute("SELECT level FROM commitments WHERE id=?", (args.parent,)).fetchone()
            if not parent:
                raise ValueError(f"Parent {args.parent} not found")
            if parent["level"] == "Task":
                raise ValueError("a Task cannot be a parent")
        conn.execute("""
            INSERT INTO commitments (id, name, state, created_at, updated_at, level, parent_id,
                current_state_desc, desired_state_desc, proof_of_completion, next_physical_action)
            VALUES (?, ?, 'Captured', ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            args.id, args.name,
            datetime.datetime.now().isoformat(), datetime.datetime.now().isoformat(),
            args.level or 'Task', args.parent,
            args.current or '', args.desired or '', args.proof or '', args.next_action or ''
        ))
        conn.execute(
            "INSERT INTO inbox (raw_text, mark, processed_at, process_action, card_id) VALUES (?, 'c', ?, 'define', ?)",
            (args.name, datetime.datetime.now().isoformat(), args.id),
        )
        conn.commit()
        print(f"Card {args.id} created in Captured state.")
    else:
        fields = {}
        if hasattr(args, 'name') and args.name:
            fields['name'] = args.name
        for attr in ['current', 'desired', 'proof', 'next_action', 'level', 'parent']:
            val = getattr(args, attr, None)
            if val is not None:
                col = FIELD_MAP.get(attr)
                if col:
                    fields[col] = val
        if fields:
            set_clause = ", ".join(f"{k} = ?" for k in fields)
            values = list(fields.values()) + [datetime.datetime.now().isoformat(), args.id]
            conn.execute(f"UPDATE commitments SET {set_clause}, updated_at = ? WHERE id = ?", values)
            conn.commit()
            print(f"Card {args.id} updated.")
        else:
            print("No changes.")
    conn.close()

def _update(args):
    if not args.field or args.value is None:
        raise ValueError("--field and --value required")
    if args.field not in ALLOWED_UPDATE_FIELDS:
        raise ValueError(f"Cannot update field {args.field}")
    value = _validate_and_transform(args.field, args.value)
    conn = get_db()
    existing = conn.execute("SELECT state FROM commitments WHERE id=?", (args.id,)).fetchone()
    if not existing:
        conn.close()
        raise ValueError(f"Card {args.id} not found")
    if existing["state"] == "Scheduled" and args.field in {
        "planned_date", "planned_start", "planned_end", "planned_duration"
    }:
        conn.close()
        raise ValueError("unschedule the card before changing planned time")
    res = conn.execute(f"UPDATE commitments SET {args.field} = ?, updated_at = ? WHERE id = ?",
                       (value, datetime.datetime.now().isoformat(), args.id))
    if res.rowcount == 0:
        raise ValueError(f"Card {args.id} not found")
    conn.commit()
    print(f"Updated {args.field} on {args.id}.")
    conn.close()

def _validate_and_transform(field, raw_value):
    if field == 'planned_date':
        try:
            datetime.date.fromisoformat(raw_value)
        except ValueError:
            raise ValueError(f"Invalid date: {raw_value}. Use YYYY-MM-DD.")
        return raw_value
    elif field == 'planned_duration':
        try:
            val = int(raw_value)
        except ValueError:
            raise ValueError("planned_duration must be an integer")
        if val <= 0:
            raise ValueError("planned_duration must be positive")
        return val
    elif field == 'priority':
        try:
            val = int(raw_value)
        except ValueError:
            raise ValueError("priority must be an integer")
        if val < 0 or val > 100:
            raise ValueError("priority must be 0-100")
        return val
    elif field in {'deadline', 'earliest_start', 'latest_end'}:
        try:
            datetime.datetime.fromisoformat(raw_value)
        except ValueError:
            raise ValueError(f"Invalid datetime: {raw_value}. Use YYYY-MM-DDTHH:MM.")
        return raw_value
    elif field in {'time_fixed', 'pinned'}:
        value = raw_value.strip().lower()
        if value not in {'true', 'false', '1', '0', 'yes', 'no'}:
            raise ValueError(f"{field} must be true or false")
        return 1 if value in {'true', '1', 'yes'} else 0
    elif field == 'risk_level':
        if raw_value not in ('Low', 'Medium', 'High'):
            raise ValueError("risk_level must be Low, Medium, or High")
        return raw_value
    elif field in ('current_state_desc', 'desired_state_desc', 'proof_of_completion', 'next_physical_action', 'parent_id', 'name', 'repeat_rule', 'owner', 'fallback_action'):
        if not raw_value.strip():
            raise ValueError(f"{field} cannot be empty")
        if field == "repeat_rule":
            required = ("start=", "proof=", "review=")
            if not all(part in raw_value for part in required):
                raise ValueError("repeat_rule requires start=, proof=, and review=")
        return raw_value
    return raw_value

def _show(args):
    conn = get_db()
    card = conn.execute("SELECT * FROM commitments WHERE id=?", (args.id,)).fetchone()
    if card:
        for k in card.keys():
            print(f"{k}: {card[k]}")
    else:
        print("Not found.")
    conn.close()

def _move(args):
    kwargs = _build_move_kwargs(args)
    now = datetime.datetime.now().isoformat()
    target = args.to.lower()
    if target == "active":
        kwargs.setdefault("actual_start", now)
    elif target in {"completed", "paused", "blocked"}:
        kwargs.setdefault("actual_end", now)
        if target in {"completed", "paused"}:
            kwargs.setdefault(
                "what_happened",
                kwargs.get("result") or kwargs.get("note") or getattr(args, "reason", None),
            )
    try:
        move_card(args.id, args.to.capitalize(), **kwargs)
        print(f"Card {args.id} moved to {args.to.capitalize()}.")
    except Exception as e:
        print(f"Error: {e}")

def _list(args):
    conn = get_db()
    query = "SELECT id, name, state, next_physical_action FROM commitments WHERE 1=1"
    params = []
    if args.state:
        query += " AND state = ?"
        params.append(args.state.capitalize())
    if args.parent:
        query += " AND parent_id = ?"
        params.append(args.parent)
    rows = conn.execute(query, params).fetchall()
    for r in rows:
        print(f"{r['id']}: {r['name']} [{r['state']}] -> {r['next_physical_action']}")
    conn.close()

def _build_move_kwargs(args):
    kwargs = {}
    if hasattr(args, 'result') and args.result:
        kwargs['result'] = args.result
    if hasattr(args, 'proof_location') and args.proof_location:
        kwargs['proof_location'] = args.proof_location
    if hasattr(args, 'note') and args.note:
        kwargs['note'] = args.note
        kwargs['what_happened'] = args.note
    if hasattr(args, 'reason') and args.reason:
        if args.to == 'blocked':
            kwargs['block_reason'] = args.reason
        else:
            kwargs['note'] = args.reason
    if hasattr(args, 'waiting') and args.waiting:
        kwargs['waiting_for'] = args.waiting
    if hasattr(args, 'review') and args.review:
        kwargs['review_date'] = args.review
    if hasattr(args, 'fallback') and args.fallback:
        kwargs['fallback_action'] = args.fallback
    if hasattr(args, 'resume_action') and args.resume_action:
        kwargs['next_physical_action'] = args.resume_action
    return kwargs
