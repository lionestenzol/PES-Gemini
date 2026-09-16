import datetime
from collections import Counter

from pes.database import get_db


REQUIREMENTS = {
    "A": {
        "inbox": 1, "scheduled_fields": 1, "capacity": 1, "day_view": 10,
        "single_active": 1, "actual_time": 1, "eod_review": 10, "proof": 1,
        "dependencies": 3, "blocked": 1, "review_date": 1, "fallback": 1,
        "weekly_review": 2, "overschedule": 1, "counts": 1, "friction": 1,
    },
    "B": {
        "real_commitment": 1, "inbox": 1, "define": 1, "capacity": 1,
        "dependencies": 3, "blocked_timer": 1, "activity_retry": 1,
        "worker_restart": 1, "offline_signal": 1,
        "offline_signal_processed": 1, "eod_review": 10,
        "weekly_review": 2, "overschedule": 1, "proof": 1, "friction": 1,
    },
    "C": {
        "real_team_work": 1, "test_users": 2, "inbox": 1, "ownership": 1,
        "define": 1, "capacity": 1, "dependencies": 3, "paused": 1,
        "blocked_timer": 1, "fallback": 1, "dmn_pass": 1, "dmn_fail": 4,
        "eod_review": 10, "weekly_review": 2, "overschedule": 1,
        "second_active": 1, "proof": 1, "operate_trace": 1, "friction": 1,
        "worker_restart": 1, "system_restart": 1, "incident_repair": 1,
        "backup_restore": 1, "access_allowed": 1, "access_denied": 1,
    },
    "D": {
        "real_commitment": 1, "ready_competition": 1, "capacity": 2,
        "dependencies": 3, "fixed_events": 2, "priority_levels": 2,
        "hard_deadline": 1, "unscheduled": 1, "proposal_review": 1,
        "valid_import": 1, "rejected_proposal": 1, "no_solution": 1,
        "replan": 1, "what_if": 2, "single_active": 1, "proof": 1,
        "solve_score": 1, "friction": 1,
    },    "E": {
        "real_commitment": 20, "full_lifecycle": 10, "client_a_to_b": 1,
        "dependency": 3, "blocked": 1, "fallback": 1, "capacity_week": 2,
        "capacity_rejection": 1, "single_active_rejection": 1,
        "verified_proof": 10, "eod_review": 5, "weekly_review": 2,
        "stale_conflict": 1, "idempotent_retry": 1, "service_restart": 1,
        "backup_restore": 1, "full_history": 1, "friction": 1,
    },
}


def start(path: str, started_on: str | None = None) -> int:
    path = path.upper()
    if path not in REQUIREMENTS:
        raise ValueError("path must be A, B, C, D, or E")
    start_date = datetime.date.fromisoformat(
        started_on or datetime.date.today().isoformat()
    )
    end_date = start_date + datetime.timedelta(days=13)
    conn = get_db()
    try:
        active = conn.execute(
            "SELECT id FROM protocol_runs WHERE path=? AND status='active'", (path,)
        ).fetchone()
        if active:
            return active["id"]
        cursor = conn.execute(
            "INSERT INTO protocol_runs(path,started_on,ends_on) VALUES (?,?,?)",
            (path, start_date.isoformat(), end_date.isoformat()),
        )
        conn.commit()
        return cursor.lastrowid
    finally:
        conn.close()


def record(
    run_id: int, event_type: str, evidence: str,
    outcome: str = "observed", friction: str | None = None,
    event_date: str | None = None,
) -> int:
    if outcome not in {"pass", "fail", "observed"}:
        raise ValueError("outcome must be pass, fail, or observed")
    conn = get_db()
    try:
        run = conn.execute(
            "SELECT path,status FROM protocol_runs WHERE id=?", (run_id,)
        ).fetchone()
        if not run:
            raise ValueError(f"protocol run {run_id} not found")
        if run["status"] != "active":
            raise ValueError("protocol run is not active")
        if event_type not in REQUIREMENTS[run["path"]]:
            raise ValueError(
                f"unknown event type for Path {run['path']}: {event_type}"
            )
        event_day = datetime.date.fromisoformat(
            event_date or datetime.date.today().isoformat()
        )
        cursor = conn.execute(
            "INSERT INTO protocol_events"
            "(run_id,event_date,event_type,outcome,evidence,friction) "
            "VALUES (?,?,?,?,?,?)",
            (run_id, event_day.isoformat(), event_type, outcome, evidence, friction),
        )
        conn.commit()
        return cursor.lastrowid
    finally:
        conn.close()


def status(run_id: int) -> dict:
    conn = get_db()
    try:
        run = conn.execute(
            "SELECT * FROM protocol_runs WHERE id=?", (run_id,)
        ).fetchone()
        if not run:
            raise ValueError(f"protocol run {run_id} not found")
        events = conn.execute(
            "SELECT event_type,outcome FROM protocol_events WHERE run_id=?",
            (run_id,),
        ).fetchall()
    finally:
        conn.close()
    passing = Counter(
        event["event_type"] for event in events
        if event["outcome"] in {"pass", "observed"}
    )
    requirements = REQUIREMENTS[run["path"]]
    missing = {
        event_type: required - passing[event_type]
        for event_type, required in requirements.items()
        if passing[event_type] < required
    }
    today = datetime.date.today()
    ends_on = datetime.date.fromisoformat(run["ends_on"])
    return {
        "id": run["id"], "path": run["path"], "status": run["status"],
        "started_on": run["started_on"], "ends_on": run["ends_on"],
        "days_elapsed": max(
            0, (today - datetime.date.fromisoformat(run["started_on"])).days + 1
        ),
        "elapsed_gate_passed": today >= ends_on,
        "event_counts": dict(passing),
        "missing": missing,
        "ready_to_complete": today >= ends_on and not missing,
    }


def complete(run_id: int) -> None:
    result = status(run_id)
    if not result["ready_to_complete"]:
        raise ValueError(
            f"protocol is not complete; elapsed={result['elapsed_gate_passed']} "
            f"missing={result['missing']}"
        )
    conn = get_db()
    conn.execute(
        "UPDATE protocol_runs SET status='complete',completed_at=datetime('now') "
        "WHERE id=?",
        (run_id,),
    )
    conn.commit()
    conn.close()


def handle(args) -> None:
    if args.protocol_action == "start":
        print(f"Protocol run {start(args.path, args.date)} started.")
    elif args.protocol_action == "record":
        event_id = record(
            args.run_id, args.type, args.evidence, args.outcome,
            args.friction, args.date,
        )
        print(f"Protocol event {event_id} recorded.")
    elif args.protocol_action == "status":
        result = status(args.run_id)
        for key, value in result.items():
            print(f"{key}: {value}")
    elif args.protocol_action == "complete":
        complete(args.run_id)
        print(f"Protocol run {args.run_id} completed.")
