import datetime
from pes.database import get_db


def _next_card_id(conn):
    n = conn.execute("SELECT COUNT(*) FROM commitments").fetchone()[0] + 1
    while conn.execute("SELECT 1 FROM commitments WHERE id=?", (f"T-{n:03d}",)).fetchone():
        n += 1
    return f"T-{n:03d}"


def handle(args):
    conn = get_db()
    try:
        if args.inbox_action == "add":
            text = " ".join(args.text).strip()
            if not text:
                raise ValueError("inbox text is required")
            conn.execute("INSERT INTO inbox (raw_text) VALUES (?)", (text,))
            conn.commit()
            print(f"Inbox item added: {text}")
        elif args.inbox_action == "list":
            items = conn.execute(
                "SELECT * FROM inbox WHERE processed_at IS NULL ORDER BY id"
            ).fetchall()
            for item in items:
                print(f"{item['id']}: {item['raw_text']} [{item['mark']}]")
        elif args.inbox_action == "process":
            item = conn.execute("SELECT * FROM inbox WHERE id=?", (args.id,)).fetchone()
            if not item:
                raise ValueError(f"Inbox item {args.id} not found")
            if item["processed_at"]:
                raise ValueError("Inbox item already processed")
            action = args.action
            card_id = None
            if action in {"do", "define", "map", "review"}:
                card_id = args.card_id or _next_card_id(conn)
                conn.execute(
                    """INSERT INTO commitments
                       (id, name, state, created_at, updated_at, level,
                        current_state_desc, desired_state_desc, proof_of_completion,
                        next_physical_action)
                       VALUES (?, ?, 'Captured', ?, ?, ?, ?, ?, ?, ?)""",
                    (
                        card_id, args.name or item["raw_text"][:80],
                        datetime.datetime.now().isoformat(), datetime.datetime.now().isoformat(),
                        args.level or "Task", args.current or "", args.desired or "",
                        args.proof or "", args.next_action or "",
                    ),
                )
            mark = {"delete": "x", "store": "s", "do": "d", "define": "c", "map": "m", "review": "r"}[action]
            conn.execute(
                "UPDATE inbox SET mark=?, processed_at=?, process_action=?, card_id=? WHERE id=?",
                (mark, datetime.datetime.now().isoformat(), action, card_id, args.id),
            )
            conn.commit()
            print(f"Inbox item {args.id} processed as {action}" + (f" -> {card_id}" if card_id else ""))
    finally:
        conn.close()
