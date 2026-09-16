import datetime
from pes.database import get_db
from pes.engine.state_machine import move_card


def schedule_card(card_id, date, start=None, duration=None):
    datetime.date.fromisoformat(date)
    minutes = int(duration) if duration is not None else None
    if minutes is not None and minutes <= 0:
        raise ValueError("duration must be positive")
    conn = get_db()
    card = conn.execute("SELECT * FROM commitments WHERE id=?", (card_id,)).fetchone()
    if not card:
        conn.close()
        raise ValueError(f"Card {card_id} not found")
    if card["state"] != "Ready":
        conn.close()
        raise ValueError("only Ready cards can be scheduled")
    minutes = minutes or card["planned_duration"]
    if not minutes:
        conn.close()
        raise ValueError("duration is required")
    conn.execute(
        "UPDATE commitments SET planned_date=?, planned_start=?, planned_duration=?, updated_at=? WHERE id=?",
        (date, start, minutes, datetime.datetime.now().isoformat(), card_id),
    )
    conn.commit()
    conn.close()
    try:
        move_card(card_id, "Scheduled")
    except Exception:
        conn = get_db()
        conn.execute(
            "UPDATE commitments SET planned_date=?, planned_start=?, planned_duration=? WHERE id=?",
            (card["planned_date"], card["planned_start"], card["planned_duration"], card_id),
        )
        conn.commit()
        conn.close()
        raise


def unschedule_card(card_id):
    conn = get_db()
    card = conn.execute("SELECT state FROM commitments WHERE id=?", (card_id,)).fetchone()
    conn.close()
    if not card:
        raise ValueError(f"Card {card_id} not found")
    if card["state"] != "Scheduled":
        raise ValueError("only Scheduled cards can be unscheduled")
    move_card(card_id, "Ready")
    conn = get_db()
    conn.execute(
        "UPDATE commitments SET planned_date=NULL, planned_start=NULL, planned_end=NULL, planned_duration=NULL WHERE id=?",
        (card_id,),
    )
    conn.commit()
    conn.close()


def handle(args):
    if args.schedule_action == "set":
        schedule_card(args.id, args.date, args.start, args.duration)
        print(f"Scheduled {args.id} for {args.date}.")
    elif args.schedule_action == "remove":
        unschedule_card(args.id)
        print(f"Unscheduled {args.id}.")
