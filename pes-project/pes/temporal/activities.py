import datetime
import hashlib
import json
import sqlite3
from dataclasses import asdict
from pathlib import Path

from temporalio import activity
from temporalio.exceptions import ApplicationError

from pes import database
from pes.temporal.models import (
    CommitmentState, ProjectionEvent, ReviewRequest, ReviewResult,
)


def _connection() -> sqlite3.Connection:
    database.init_db()
    return database.get_db()


@activity.defn
def project_event(event: ProjectionEvent) -> str:
    conn = _connection()
    try:
        conn.execute("BEGIN IMMEDIATE")
        if conn.execute(
            "SELECT 1 FROM projection_events WHERE event_id=?", (event.event_id,)
        ).fetchone():
            conn.rollback()
            return "duplicate"
        current = conn.execute(
            "SELECT projection_version FROM commitments WHERE id=?",
            (event.state.card_id,),
        ).fetchone()
        version_recorded = conn.execute(
            "SELECT 1 FROM projection_events WHERE workflow_id=? AND version=?",
            (event.workflow_id, event.version),
        ).fetchone()
        if current and current["projection_version"] >= event.version:
            if not version_recorded:
                conn.execute(
                    "INSERT INTO projection_events(event_id,workflow_id,card_id,version,action,accepted,payload) "
                    "VALUES (?,?,?,?,?,?,?)",
                    (event.event_id, event.workflow_id, event.state.card_id, event.version,
                     event.action, int(event.accepted), json.dumps(asdict(event.state))),
                )
            conn.commit()
            return "stale"
        values = asdict(event.state)
        values["workflow_id"] = event.workflow_id
        values["projection_version"] = event.version
        values.pop("version")
        values.pop("last_event")
        values.pop("review_events")
        columns = [
            "id", "name", "level", "parent_id", "current_state_desc",
            "desired_state_desc", "proof_of_completion", "next_physical_action",
            "state", "schedule_status", "planned_date", "planned_start", "planned_end",
            "planned_duration", "actual_start", "actual_end", "result", "proof_location",
            "what_happened", "block_reason", "waiting_for", "review_date",
            "fallback_action", "fallback_at", "repeat_rule", "owner", "priority", "risk_level",
            "desired_result_made", "proof_exists", "proof_stored",
            "required_action_remains", "workflow_id", "projection_version",
        ]
        row = [values["card_id"] if c == "id" else values.get(c) for c in columns]
        updates = ",".join(f"{c}=excluded.{c}" for c in columns if c != "id")
        conn.execute(
            f"INSERT INTO commitments ({','.join(columns)}) VALUES ({','.join('?' for _ in columns)}) "
            f"ON CONFLICT(id) DO UPDATE SET {updates} WHERE excluded.projection_version > commitments.projection_version",
            row,
        )
        if not version_recorded:
            conn.execute(
                "INSERT INTO projection_events(event_id,workflow_id,card_id,version,action,accepted,payload) "
                "VALUES (?,?,?,?,?,?,?)",
                (event.event_id, event.workflow_id, event.state.card_id, event.version,
                 event.action, int(event.accepted), json.dumps(asdict(event.state))),
            )
        if event.state_from != event.state.state:
            conn.execute(
                "INSERT INTO log(card_id,state_from,state_to,note,actual_start,actual_end) VALUES (?,?,?,?,?,?)",
                (event.state.card_id, event.state_from, event.state.state, event.action,
                 event.state.actual_start, event.state.actual_end),
            )
        if (
            event.state.state in {"Verified", "Done"}
            and event.state.result and event.state.proof_location
        ):
            conn.execute(
                "INSERT INTO proof_index(card_id,result,proof_location,verified,verified_at) "
                "VALUES (?,?,?,?,?) ON CONFLICT(card_id) DO UPDATE SET "
                "result=excluded.result,proof_location=excluded.proof_location,"
                "verified=1,verified_at=excluded.verified_at",
                (event.state.card_id, event.state.result,
                 event.state.proof_location, 1,
                 datetime.datetime.now(datetime.UTC).isoformat()),
            )
        conn.commit()
        return "applied"
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


@activity.defn
def reserve_capacity(state: CommitmentState) -> str:
    if not state.planned_date or not state.planned_duration:
        raise ApplicationError(
            "planned date and positive duration are required", non_retryable=True
        )
    planned_date = datetime.date.fromisoformat(state.planned_date)
    monday = planned_date - datetime.timedelta(days=planned_date.weekday())
    sunday = monday + datetime.timedelta(days=6)
    conn = _connection()
    try:
        conn.execute("BEGIN IMMEDIATE")
        cap = conn.execute(
            "SELECT schedule_limit FROM capacity WHERE week_of=?", (monday.isoformat(),)
        ).fetchone()
        if not cap:
            raise ApplicationError(
                f"capacity not set for week {monday.isoformat()}", non_retryable=True
            )
        used = conn.execute(
            "SELECT COALESCE(SUM(planned_duration),0) FROM schedule_reservations "
            "WHERE card_id<>? AND planned_date BETWEEN ? AND ?",
            (state.card_id, monday.isoformat(), sunday.isoformat()),
        ).fetchone()[0]
        if (used + state.planned_duration) / 60 > cap["schedule_limit"]:
            raise ApplicationError(
                f"weekly limit {cap['schedule_limit']}h exceeded", non_retryable=True
            )
        blockers = conn.execute(
            "SELECT l.from_id,c.state FROM links l JOIN commitments c ON c.id=l.from_id "
            "WHERE l.to_id=? AND l.link_type IN ('blocks','requires')",
            (state.card_id,),
        ).fetchall()
        unfinished = [r["from_id"] for r in blockers if r["state"] not in ("Verified", "Done")]
        if unfinished:
            raise ApplicationError(
                f"dependencies not met: {', '.join(unfinished)}", non_retryable=True
            )
        conn.execute(
            "INSERT INTO schedule_reservations(card_id,planned_date,planned_duration,workflow_id) "
            "VALUES (?,?,?,?) ON CONFLICT(card_id) DO UPDATE SET "
            "planned_date=excluded.planned_date,planned_duration=excluded.planned_duration,"
            "workflow_id=excluded.workflow_id,reserved_at=datetime('now')",
            (state.card_id, state.planned_date, state.planned_duration,
             f"pes/commitment/{state.card_id}"),
        )
        conn.commit()
        return "reserved"
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


@activity.defn
def release_capacity(card_id: str) -> str:
    conn = _connection()
    try:
        conn.execute("DELETE FROM schedule_reservations WHERE card_id=?", (card_id,))
        conn.commit()
        return card_id
    finally:
        conn.close()


@activity.defn
def acquire_active(card_id: str) -> str:
    conn = _connection()
    try:
        conn.execute("BEGIN IMMEDIATE")
        holder = conn.execute("SELECT card_id FROM active_lock WHERE scope='system'").fetchone()
        if holder and holder["card_id"] != card_id:
            raise ApplicationError(
                f"another card ({holder['card_id']}) is already Active",
                non_retryable=True,
            )
        conn.execute(
            "INSERT INTO active_lock(scope,card_id,acquired_at) VALUES ('system',?,?) "
            "ON CONFLICT(scope) DO UPDATE SET card_id=excluded.card_id,acquired_at=excluded.acquired_at",
            (card_id, datetime.datetime.now(datetime.UTC).isoformat()),
        )
        conn.commit()
        return card_id
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


@activity.defn
def release_active(card_id: str) -> str:
    conn = _connection()
    try:
        conn.execute("DELETE FROM active_lock WHERE scope='system' AND card_id=?", (card_id,))
        conn.commit()
        return card_id
    finally:
        conn.close()


@activity.defn
def store_proof(state: CommitmentState) -> str:
    if not state.result or not state.proof_location:
        raise ApplicationError(
            "result and proof_location are required", non_retryable=True
        )
    conn = _connection()
    try:
        conn.execute(
            "INSERT INTO proof_index(card_id,result,proof_location,verified,verified_at) "
            "VALUES (?,?,?,?,?) ON CONFLICT(card_id) DO UPDATE SET "
            "result=excluded.result,proof_location=excluded.proof_location,"
            "verified=excluded.verified,verified_at=excluded.verified_at",
            (state.card_id, state.result, state.proof_location, 1,
             datetime.datetime.now(datetime.UTC).isoformat()),
        )
        conn.commit()
        return state.proof_location
    finally:
        conn.close()


@activity.defn
def external_action(action_key: str) -> str:
    safe_key = hashlib.sha256(action_key.encode("utf-8")).hexdigest()
    marker = Path(database.DB_PATH).parent / "effects" / f"{safe_key}.json"
    marker.parent.mkdir(parents=True, exist_ok=True)
    if marker.exists():
        return marker.read_text(encoding="utf-8")
    result = json.dumps({"action_key": action_key, "status": "completed"})
    marker.write_text(result, encoding="utf-8")
    return result


@activity.defn
def run_review(request: ReviewRequest) -> ReviewResult:
    if request.review_type not in {"end-of-day", "weekly"}:
        raise ApplicationError("unknown review type", non_retryable=True)
    if not request.run_key:
        raise ApplicationError("run_key is required", non_retryable=True)
    conn = _connection()
    try:
        existing = conn.execute(
            "SELECT summary,changes_made FROM review_runs WHERE run_key=?",
            (request.run_key,),
        ).fetchone()
        if existing:
            return ReviewResult(
                request.review_type, request.run_key,
                existing["summary"], existing["changes_made"],
            )
        counts = {
            row["state"]: row["count"]
            for row in conn.execute(
                "SELECT state,COUNT(*) count FROM commitments GROUP BY state"
            )
        }
        if request.review_type == "end-of-day":
            summary_data = {
                "active": counts.get("Active", 0),
                "scheduled": counts.get("Scheduled", 0),
                "completed_to_verify": counts.get("Completed", 0),
                "blocked": counts.get("Blocked", 0),
                "time_facts": [dict(row) for row in conn.execute(
                    "SELECT id,planned_duration,actual_start,actual_end "
                    "FROM commitments WHERE state NOT IN ('Captured','Ready')"
                )],
            }
        else:
            summary_data = {
                "collect": {
                    "inbox": conn.execute(
                        "SELECT COUNT(*) FROM inbox WHERE processed_at IS NULL"
                    ).fetchone()[0],
                    "states": counts,
                },
                "clarify": counts.get("Captured", 0),
                "verify": counts.get("Completed", 0),
                "update": counts.get("Blocked", 0),
                "remove": counts.get("Done", 0) + counts.get("Canceled", 0),
                "select": counts.get("Ready", 0),
                "schedule": {"buffer_percent": 30},
            }
        summary = json.dumps(summary_data)
        conn.execute(
            "INSERT INTO review_runs"
            "(review_type,summary,changes_made,tomorrow_mode,must_happen,run_key) "
            "VALUES (?,?,?,?,?,?)",
            (request.review_type, summary, 1, request.mode,
             request.must_happen, request.run_key),
        )
        conn.commit()
        return ReviewResult(request.review_type, request.run_key, summary, 1)
    finally:
        conn.close()
