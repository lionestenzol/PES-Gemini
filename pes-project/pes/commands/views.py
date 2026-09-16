import datetime
from pes.database import get_db
from rich.console import Console

console = Console()


def _print_cards(rows):
    for order, row in enumerate(rows, 1):
        when = " ".join(v for v in (row["planned_date"], row["planned_start"]) if v)
        style = {
            "Ready": "green", "Active": "bold cyan", "Blocked": "yellow",
            "Canceled": "dim", "Done": "bold green", "Completed": "magenta",
        }.get(row["state"], "white")
        console.print(
            f"{order}. {row['id']}: {row['name']} [{row['state']}] {when} "
            f"({row['planned_duration'] or 0}m) -> {row['planned_result'] or row['next_physical_action'] or ''}",
            style=style,
        )


def handle_log(args):
    conn = get_db()
    query, params = "SELECT * FROM log WHERE 1=1", []
    if args.card:
        query += " AND card_id=?"; params.append(args.card)
    if args.date:
        query += " AND date(timestamp)=?"; params.append(args.date)
    query += " ORDER BY timestamp DESC"
    if args.limit:
        query += " LIMIT ?"; params.append(args.limit)
    for row in conn.execute(query, params):
        print(f"{row['timestamp']} | {row['card_id']} | {row['state_from']} -> {row['state_to']} | {row['note']}")
    conn.close()


def handle_day(args):
    day = args.date or datetime.date.today().isoformat()
    conn = get_db()
    rows = conn.execute(
        """SELECT * FROM commitments
           WHERE (planned_date=? AND state='Scheduled') OR state='Active'
           ORDER BY CASE WHEN planned_start IS NULL THEN 1 ELSE 0 END, planned_start, priority DESC""",
        (day,),
    ).fetchall()
    _print_cards(rows)
    fixed = conn.execute("SELECT * FROM fixed_events WHERE event_date=? ORDER BY start_time",(day,)).fetchall()
    for event in fixed:
        console.print(f"FIXED {event['start_time']}-{event['end_time']} {event['name']} [{event['resource']}]",style="dim")
    monday = datetime.date.fromisoformat(day) - datetime.timedelta(days=datetime.date.fromisoformat(day).weekday())
    cap = conn.execute("SELECT schedule_limit FROM capacity WHERE week_of=?",(monday.isoformat(),)).fetchone()
    if cap: print(f"Week schedule limit: {cap['schedule_limit']}h")
    conn.close()


def handle_week(args):
    given = datetime.date.fromisoformat(args.week) if args.week else datetime.date.today()
    monday = given - datetime.timedelta(days=given.weekday())
    sunday = monday + datetime.timedelta(days=6)
    conn = get_db()
    rows = conn.execute(
        """SELECT * FROM commitments WHERE state='Scheduled' AND planned_date BETWEEN ? AND ?
           ORDER BY planned_date, planned_start""",
        (monday.isoformat(), sunday.isoformat()),
    ).fetchall()
    cap = conn.execute("SELECT * FROM capacity WHERE week_of=?", (monday.isoformat(),)).fetchone()
    _print_cards(rows)
    planned = sum((r["planned_duration"] or 0) for r in rows) / 60
    print(f"Planned: {planned:.2f}h / limit: {cap['schedule_limit'] if cap else 'not set'}h")
    conn.close()


def handle_queue(args):
    conn = get_db()
    rows = conn.execute(
        "SELECT * FROM commitments WHERE state='Ready' ORDER BY priority DESC, created_at"
    ).fetchall()
    _print_cards(rows)
    conn.close()


def handle_named(args):
    state_map = {
        "active": ("state='Active'", ()),
        "verify": ("state='Completed'", ()),
        "blocked": ("state='Blocked'", ()),
        "records": ("state IN ('Done','Canceled')", ()),
        "proof": ("state IN ('Verified','Done')", ()),
    }
    where, params = state_map[args.view_name]
    conn = get_db()
    rows = conn.execute(f"SELECT * FROM commitments WHERE {where} ORDER BY review_date, created_at", params).fetchall()
    _print_cards(rows)
    conn.close()
