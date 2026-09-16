from pes.database import get_db
from pes.engine.time_engine import compute_capacity
from pes.config import load_config
import datetime

def handle(args):
    if args.capacity_action == "set":
        total = float(args.total)
        fixed = float(args.fixed)
        meals = float(args.meals)
        recovery = float(args.recovery)
        avail, limit = compute_capacity(
            total, fixed, meals, recovery, load_config()["work_time_unit"]
        )
        given_date = datetime.date.fromisoformat(args.week)
        week_monday = given_date - datetime.timedelta(days=given_date.weekday())
        conn = get_db()
        conn.execute("""
            INSERT OR REPLACE INTO capacity (week_of, total_hours, fixed_commitments,
                meals_travel_transitions, recovery_reserve, available_capacity, schedule_limit)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        """, (week_monday.isoformat(), total, fixed, meals, recovery, avail, limit))
        conn.commit()
        print(f"Week {week_monday}: available = {avail}h, schedule limit = {limit}h")
        conn.close()
    elif args.capacity_action == "show":
        conn = get_db()
        if args.week:
            given_date = datetime.date.fromisoformat(args.week)
            week_monday = given_date - datetime.timedelta(days=given_date.weekday())
            row = conn.execute("SELECT * FROM capacity WHERE week_of = ?", (week_monday.isoformat(),)).fetchone()
            if row:
                print(dict(row))
            else:
                print("No capacity set for this week.")
        else:
            rows = conn.execute("SELECT * FROM capacity ORDER BY week_of").fetchall()
            for r in rows:
                print(dict(r))
        conn.close()
