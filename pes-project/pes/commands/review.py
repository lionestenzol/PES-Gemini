import json
from pes.config import load_config
from pes.database import get_db


MODES = {"Full", "Reduced", "Recovery", "Admin", "Field", "Review"}


def end_of_day(mode, must_happen):
    if mode not in MODES:
        raise ValueError(f"mode must be one of {sorted(MODES)}")
    conn = get_db()
    try:
        summary = json.dumps({
            "active": conn.execute("SELECT COUNT(*) FROM commitments WHERE state='Active'").fetchone()[0],
            "scheduled": conn.execute("SELECT COUNT(*) FROM commitments WHERE state='Scheduled'").fetchone()[0],
            "completed_to_verify": conn.execute("SELECT COUNT(*) FROM commitments WHERE state='Completed'").fetchone()[0],
            "blocked_missing_review": conn.execute("SELECT COUNT(*) FROM commitments WHERE state='Blocked' AND review_date IS NULL").fetchone()[0],
            "time_facts": [dict(r) for r in conn.execute(
                "SELECT id,planned_duration,actual_start,actual_end FROM commitments WHERE state NOT IN ('Captured','Ready')"
            )],
        })
        conn.execute(
            """INSERT INTO review_runs
               (review_type, summary, changes_made, tomorrow_mode, must_happen)
               VALUES ('end-of-day', ?, 1, ?, ?)""",
            (summary, mode, must_happen),
        )
        conn.commit()
        return summary
    finally:
        conn.close()


def weekly():
    conn = get_db()
    try:
        counts = {
            row["state"]: row["count"]
            for row in conn.execute("SELECT state, COUNT(*) count FROM commitments GROUP BY state")
        }
        inbox = conn.execute("SELECT COUNT(*) FROM inbox WHERE processed_at IS NULL").fetchone()[0]
        capacity = conn.execute("SELECT COUNT(*) FROM capacity").fetchone()[0]
        summary = json.dumps({
            "collect": {"inbox": inbox, "states": counts},
            "clarify": {"undefined": conn.execute(
                "SELECT COUNT(*) FROM commitments WHERE state='Captured'"
            ).fetchone()[0]},
            "verify": {"completed": counts.get("Completed", 0)},
            "update": {"blocked": counts.get("Blocked", 0)},
            "remove": {"closed": counts.get("Done", 0) + counts.get("Canceled", 0)},
            "select": {"ready": counts.get("Ready", 0)},
            "schedule": {"capacity_weeks": capacity, "buffer_percent": 30},
        })
        conn.execute(
            "INSERT INTO review_runs (review_type, summary, changes_made) VALUES ('weekly', ?, 1)",
            (summary,),
        )
        conn.commit()
        return summary
    finally:
        conn.close()


def handle(args):
    if args.review_action == "end-of-day":
        mode = args.mode or load_config()["default_day_mode"]
        print(end_of_day(mode, args.must_happen))
    elif args.review_action == "weekly":
        print(weekly())
