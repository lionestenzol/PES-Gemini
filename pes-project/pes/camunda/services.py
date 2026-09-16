"""Idempotent PES business services called by Camunda job workers.

Camunda owns process flow. These services own transactional PES business data
and never choose a BPMN path; they return facts consumed by BPMN/DMN.
"""

import datetime
import json
from typing import Any, Callable

from pes.database import get_db, init_db
from pes.engine.constraint_engine import guard_ready


VALID_STATES = {
    "Captured", "Ready", "Scheduled", "Active", "Completed",
    "Verified", "Done", "Paused", "Blocked", "Canceled",
}

WORK_ROLES = {"worker", "admin"}


def register_user(user_id: str, role: str) -> None:
    if not user_id.strip():
        raise ValueError("user_id is required")
    if role not in {"worker", "operator", "model-author", "admin"}:
        raise ValueError("invalid PES role")
    init_db()
    conn = get_db()
    try:
        conn.execute(
            "INSERT INTO pes_users(user_id,role,active) VALUES (?,?,1) "
            "ON CONFLICT(user_id) DO UPDATE SET role=excluded.role,active=1",
            (user_id, role),
        )
        conn.commit()
    finally:
        conn.close()


def authorize_user(user_id: str | None, allowed_roles: set[str] = WORK_ROLES) -> tuple[bool, str]:
    if not user_id:
        return False, "the Camunda task must have an assignee"
    init_db()
    conn = get_db()
    try:
        user = conn.execute(
            "SELECT role,active FROM pes_users WHERE user_id=?", (user_id,)
        ).fetchone()
    finally:
        conn.close()
    if not user or not user["active"]:
        return False, f"user {user_id} is not an active PES user"
    if user["role"] not in allowed_roles:
        return False, f"role {user['role']} cannot complete PES work tasks"
    return True, "authorized"


def audit_user_task(job_key: str, process_key: str, data: dict[str, Any]) -> dict[str, Any]:
    card_id = str(data.get("card_id") or "")
    actor_id = str(data.get("actor_id") or "")
    element_id = str(data.get("element_id") or "")
    if not card_id or not actor_id or not element_id:
        raise ValueError("card_id, authoritative actor_id, and element_id are required")
    allowed, reason = authorize_user(actor_id)
    if not allowed:
        raise PermissionError(reason)
    def operation(conn):
        completed_at = datetime.datetime.now(datetime.UTC).isoformat()
        payload = {
            "element_id": element_id,
            "listener_event_type": data.get("listener_event_type", "completing"),
            "completed_at": completed_at,
        }
        conn.execute(
            "INSERT OR IGNORE INTO camunda_audit(event_key,card_id,process_instance_key,"
            "event_type,actor_id,payload) VALUES (?,?,?,?,?,?)",
            (f"human:{job_key}", card_id, str(process_key), "human-task-completion",
             actor_id, json.dumps(payload, sort_keys=True)),
        )
        return {"task_audited": True, "actor_id": actor_id, "task_completed_at": completed_at}
    return _idempotent(job_key, "pes-audit-user-task", card_id, process_key, operation)


def create_repeat_cycle(job_key: str, process_key: str, data: dict[str, Any]) -> dict[str, Any]:
    series_id = str(data.get("series_id") or "").strip()
    if not series_id:
        raise ValueError("series_id is required")
    required = ("name", "current_state_desc", "desired_state_desc",
                "proof_of_completion", "next_physical_action", "owner",
                "repeat_interval", "repeat_review_rule")
    missing = [name for name in required if not str(data.get(name, "")).strip()]
    if missing:
        raise ValueError(f"missing repeat fields: {', '.join(missing)}")
    def operation(conn):
        prior = conn.execute(
            "SELECT COALESCE(MAX(cycle_no),0) FROM camunda_repeat_cycles WHERE series_id=?",
            (series_id,),
        ).fetchone()[0]
        cycle_no = prior + 1
        card_id = f"{series_id}-C{cycle_no:04d}"
        conn.execute(
            "INSERT INTO camunda_repeat_cycles(series_id,cycle_no,card_id,source_job_key) "
            "VALUES (?,?,?,?)", (series_id, cycle_no, card_id, str(job_key)),
        )
        return {
            "card_id": card_id, "cycle_no": cycle_no, "series_id": series_id,
            "name": f"{data['name']} (cycle {cycle_no})",
            "level": data.get("level", "Task"), "parent_id": data.get("parent_id"),
            "current_state_desc": data["current_state_desc"],
            "desired_state_desc": data["desired_state_desc"],
            "proof_of_completion": data["proof_of_completion"],
            "next_physical_action": data["next_physical_action"],
            "owner": data["owner"], "priority": int(data.get("priority", 0)),
            "risk_level": data.get("risk_level", "Low"),
            "fallback_action": data.get("fallback_action"),
            "repeat_rule": data["repeat_interval"], "pes_state": "Captured",
            "projection_version": 0, "process_version": 1,
        }
    return _idempotent(job_key, "pes-create-repeat-cycle", None, process_key, operation)


def record_review(job_key: str, process_key: str, data: dict[str, Any]) -> dict[str, Any]:
    review_type = str(data.get("review_type") or "")
    if review_type not in {"end-of-day", "weekly"}:
        raise ValueError("review_type must be end-of-day or weekly")
    actor_id = str(data.get("actor_id") or "")
    allowed, reason = authorize_user(actor_id)
    if not allowed:
        raise PermissionError(reason)
    review_change = str(data.get("review_change") or "").strip()
    if not review_change:
        raise ValueError("review must record at least one valid system change")
    if review_type == "end-of-day":
        for field in ("tomorrow_mode", "must_happen"):
            if not str(data.get(field) or "").strip():
                raise ValueError(f"end-of-day review requires {field}")
    else:
        steps = ("collect", "clarify", "verify", "update", "remove", "select", "schedule")
        if any(data.get(step) is not True for step in steps):
            raise ValueError("weekly review requires all seven review steps")
        if float(data.get("next_week_capacity", 0)) < 0:
            raise ValueError("next_week_capacity cannot be negative")
    def operation(conn):
        run_key = f"camunda:{process_key}:{job_key}"
        summary = json.dumps({
            "change": review_change,
            "actor_id": actor_id,
            "planned_actual_checked": bool(data.get("planned_actual_checked")),
            "proof_checked": bool(data.get("proof_checked")),
            "blocked_dates_checked": bool(data.get("blocked_dates_checked")),
            "next_week_capacity": data.get("next_week_capacity"),
        }, sort_keys=True)
        conn.execute(
            "INSERT INTO review_runs(review_type,summary,changes_made,tomorrow_mode,"
            "must_happen,run_key) VALUES (?,?,?,?,?,?)",
            (review_type, summary, 1, data.get("tomorrow_mode"),
             data.get("must_happen"), run_key),
        )
        return {"review_recorded": True, "review_type": review_type,
                "review_run_key": run_key, "changes_made": 1}
    return _idempotent(job_key, "pes-record-review", None, process_key, operation)


def completion_gate(data: dict[str, Any]) -> dict[str, Any]:
    names = (
        "desired_result_made", "proof_exists", "proof_stored",
        "required_action_remains",
    )
    if any(name not in data for name in names):
        return {"completion_passed": False, "completion_reason": "missing decision input"}
    if any(type(data[name]) is not bool for name in names):
        return {"completion_passed": False, "completion_reason": "decision inputs must be boolean"}
    passed = (
        data["desired_result_made"] and data["proof_exists"]
        and data["proof_stored"] and not data["required_action_remains"]
    )
    return {
        "completion_passed": passed,
        "completion_reason": "verified" if passed else "completion evidence is incomplete",
    }


def _idempotent(job_key: str, job_type: str, card_id: str | None,
                process_key: str | None, operation: Callable) -> dict[str, Any]:
    init_db()
    conn = get_db()
    try:
        conn.execute("BEGIN IMMEDIATE")
        existing = conn.execute(
            "SELECT result FROM camunda_job_results WHERE job_key=?", (str(job_key),)
        ).fetchone()
        if existing:
            conn.rollback()
            return json.loads(existing["result"])
        result = operation(conn)
        encoded = json.dumps(result, sort_keys=True)
        conn.execute(
            "INSERT INTO camunda_job_results"
            "(job_key,job_type,card_id,process_instance_key,result) VALUES (?,?,?,?,?)",
            (str(job_key), job_type, card_id, str(process_key) if process_key else None, encoded),
        )
        conn.execute(
            "INSERT INTO camunda_audit"
            "(event_key,card_id,process_instance_key,event_type,payload) VALUES (?,?,?,?,?)",
            (f"job:{job_key}", card_id, str(process_key) if process_key else None,
             job_type, encoded),
        )
        conn.commit()
        return result
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def check_ready(job_key: str, process_key: str, data: dict[str, Any]) -> dict[str, Any]:
    card_id = str(data["card_id"])
    def operation(conn):
        card = conn.execute("SELECT * FROM commitments WHERE id=?", (card_id,)).fetchone()
        if not card:
            return {"ready_passed": False, "ready_reason": f"card {card_id} not found"}
        try:
            guard_ready(conn, card)
            if card["block_reason"]:
                raise ValueError("Ready gate failed: card has an open block")
            return {"ready_passed": True, "ready_reason": "ready"}
        except ValueError as exc:
            return {"ready_passed": False, "ready_reason": str(exc)}
    return _idempotent(job_key, "pes-ready-check", card_id, process_key, operation)


def reserve_schedule(job_key: str, process_key: str, data: dict[str, Any]) -> dict[str, Any]:
    card_id = str(data["card_id"])
    def operation(conn):
        planned_date = datetime.date.fromisoformat(str(data["planned_date"]))
        duration = int(data["planned_duration"])
        if duration <= 0:
            return {"schedule_passed": False, "schedule_reason": "planned_duration must be positive"}
        monday = planned_date - datetime.timedelta(days=planned_date.weekday())
        sunday = monday + datetime.timedelta(days=6)
        capacity = conn.execute(
            "SELECT schedule_limit FROM capacity WHERE week_of=?", (monday.isoformat(),)
        ).fetchone()
        if not capacity:
            return {"schedule_passed": False, "schedule_reason": f"capacity not set for week {monday}"}
        blockers = conn.execute(
            "SELECT l.from_id,c.state FROM links l JOIN commitments c ON c.id=l.from_id "
            "WHERE l.to_id=? AND l.link_type IN ('blocks','requires')", (card_id,),
        ).fetchall()
        waiting = [row["from_id"] for row in blockers if row["state"] not in ("Verified", "Done")]
        if waiting:
            return {"schedule_passed": False, "schedule_reason": f"dependencies not met: {', '.join(waiting)}"}
        used = conn.execute(
            "SELECT COALESCE(SUM(planned_duration),0) FROM schedule_reservations "
            "WHERE card_id<>? AND planned_date BETWEEN ? AND ?",
            (card_id, monday.isoformat(), sunday.isoformat()),
        ).fetchone()[0]
        if (used + duration) / 60 > capacity["schedule_limit"]:
            return {"schedule_passed": False, "schedule_reason": f"weekly limit {capacity['schedule_limit']}h exceeded"}
        conn.execute(
            "INSERT INTO schedule_reservations(card_id,planned_date,planned_duration,workflow_id) "
            "VALUES (?,?,?,?) ON CONFLICT(card_id) DO UPDATE SET "
            "planned_date=excluded.planned_date,planned_duration=excluded.planned_duration,"
            "workflow_id=excluded.workflow_id,reserved_at=datetime('now')",
            (card_id, planned_date.isoformat(), duration, f"camunda/{process_key}"),
        )
        return {"schedule_passed": True, "schedule_reason": "capacity and dependencies passed"}
    return _idempotent(job_key, "pes-schedule-check", card_id, process_key, operation)


def acquire_active(job_key: str, process_key: str, data: dict[str, Any]) -> dict[str, Any]:
    card_id = str(data["card_id"])
    def operation(conn):
        blockers = conn.execute(
            "SELECT l.from_id,c.state FROM links l JOIN commitments c ON c.id=l.from_id "
            "WHERE l.to_id=? AND l.link_type IN ('blocks','requires')", (card_id,),
        ).fetchall()
        waiting = [row["from_id"] for row in blockers if row["state"] not in ("Verified", "Done")]
        if waiting:
            return {"active_passed": False, "active_reason": f"dependencies not met: {', '.join(waiting)}"}
        holder = conn.execute("SELECT card_id FROM active_lock WHERE scope='system'").fetchone()
        if holder and holder["card_id"] != card_id:
            return {"active_passed": False, "active_reason": f"another card ({holder['card_id']}) is already Active"}
        conn.execute(
            "INSERT INTO active_lock(scope,card_id,acquired_at) VALUES ('system',?,?) "
            "ON CONFLICT(scope) DO UPDATE SET card_id=excluded.card_id,acquired_at=excluded.acquired_at",
            (card_id, datetime.datetime.now(datetime.UTC).isoformat()),
        )
        return {"active_passed": True, "active_reason": "active lock acquired",
                "actual_start": datetime.datetime.now(datetime.UTC).isoformat()}
    return _idempotent(job_key, "pes-acquire-active", card_id, process_key, operation)


def release_active(job_key: str, process_key: str, data: dict[str, Any]) -> dict[str, Any]:
    card_id = str(data["card_id"])
    def operation(conn):
        conn.execute("DELETE FROM active_lock WHERE scope='system' AND card_id=?", (card_id,))
        conn.execute("DELETE FROM schedule_reservations WHERE card_id=?", (card_id,))
        return {"active_released": True, "actual_end": datetime.datetime.now(datetime.UTC).isoformat()}
    return _idempotent(job_key, "pes-release-active", card_id, process_key, operation)


def project_state(job_key: str, process_key: str, data: dict[str, Any]) -> dict[str, Any]:
    card_id = str(data["card_id"])
    state = str(data["pes_state"])
    if state not in VALID_STATES:
        raise ValueError(f"invalid PES state: {state}")
    version = int(data.get("projection_version", 0))
    process_version = int(data.get("process_version", 1))
    actor_id = data.get("actor_id")
    def operation(conn):
        current = conn.execute("SELECT * FROM commitments WHERE id=?", (card_id,)).fetchone()
        if not current:
            # Captured deliberately permits an incomplete raw item. The Ready
            # worker, not projection, owns the four-field definition gate.
            required = ("name", "owner")
            missing = [name for name in required if not str(data.get(name, "")).strip()]
            if missing:
                raise ValueError(f"missing commitment fields: {', '.join(missing)}")
            conn.execute(
                "INSERT INTO commitments(id,name,level,parent_id,current_state_desc,"
                "desired_state_desc,proof_of_completion,next_physical_action,state,owner,"
                "priority,risk_level,workflow_id,projection_version) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
                (card_id, data["name"], data.get("level", "Task"), data.get("parent_id"),
                 data.get("current_state_desc", ""), data.get("desired_state_desc", ""),
                 data.get("proof_of_completion", ""), data.get("next_physical_action", ""), state,
                 data["owner"], int(data.get("priority", 0)), data.get("risk_level", "Low"),
                 f"camunda/{process_key}", version),
            )
            old_state = None
        elif current["projection_version"] >= version:
            return {"projection_status": "stale", "pes_state": current["state"]}
        else:
            old_state = current["state"]
            fields = {
                "state": state, "projection_version": version,
            }
            optional_fields = (
                "result", "proof_location", "what_happened",
                "block_reason", "waiting_for", "review_date", "fallback_action",
                "actual_start", "actual_end", "planned_date", "planned_start",
                "planned_end", "planned_duration", "desired_result_made",
                "proof_exists", "proof_stored", "required_action_remains",
            )
            fields.update({key: data[key] for key in optional_fields if key in data})
            schedule_status = current["schedule_status"]
            if state == "Scheduled":
                schedule_status = "scheduled"
            elif state in ("Ready", "Completed", "Verified", "Done", "Canceled"):
                schedule_status = "unscheduled"
            fields["schedule_status"] = schedule_status
            conn.execute(
                "UPDATE commitments SET " + ",".join(f"{key}=?" for key in fields) + ",updated_at=datetime('now') WHERE id=?",
                list(fields.values()) + [card_id],
            )
        conn.execute(
            "INSERT INTO camunda_instances(card_id,process_instance_key,process_definition_id,"
            "process_version,state,projection_version) VALUES (?,?,?,?,?,?) ON CONFLICT(card_id) "
            "DO UPDATE SET process_instance_key=excluded.process_instance_key,state=excluded.state,"
            "projection_version=excluded.projection_version,updated_at=datetime('now')",
            (card_id, str(process_key), "pes-commitment", process_version, state, version),
        )
        if old_state != state:
            conn.execute("INSERT INTO log(card_id,state_from,state_to,note) VALUES (?,?,?,?)",
                         (card_id, old_state, state, f"Camunda process {process_key}"))
        if state in ("Verified", "Done") and data.get("result") and data.get("proof_location"):
            conn.execute(
                "INSERT INTO proof_index(card_id,result,proof_location,verified,verified_at) VALUES (?,?,?,?,?) "
                "ON CONFLICT(card_id) DO UPDATE SET result=excluded.result,proof_location=excluded.proof_location,"
                "verified=1,verified_at=excluded.verified_at",
                (card_id, data["result"], data["proof_location"], 1,
                 datetime.datetime.now(datetime.UTC).isoformat()),
            )
        conn.execute(
            "INSERT OR IGNORE INTO camunda_audit(event_key,card_id,process_instance_key,event_type,"
            "actor_id,model_version,payload) VALUES (?,?,?,?,?,?,?)",
            (f"state:{process_key}:{version}", card_id, str(process_key), "state-move",
             actor_id, process_version, json.dumps({"from": old_state, "to": state})),
        )
        return {"projection_status": "applied", "pes_state": state}
    return _idempotent(job_key, "pes-project-state", card_id, process_key, operation)


def store_proof(job_key: str, process_key: str, data: dict[str, Any]) -> dict[str, Any]:
    card_id = str(data["card_id"])
    decision = completion_gate(data)
    if not decision["completion_passed"]:
        return decision
    if not str(data.get("result", "")).strip() or not str(data.get("proof_location", "")).strip():
        return {"completion_passed": False, "completion_reason": "result and proof_location are required"}
    def operation(conn):
        verified_at = datetime.datetime.now(datetime.UTC).isoformat()
        conn.execute(
            "UPDATE commitments SET result=?,proof_location=?,desired_result_made=1,"
            "proof_exists=1,proof_stored=1,required_action_remains=0,updated_at=datetime('now') "
            "WHERE id=?",
            (data["result"], data["proof_location"], card_id),
        )
        conn.execute(
            "INSERT INTO proof_index(card_id,result,proof_location,verified,verified_at) VALUES (?,?,?,?,?) "
            "ON CONFLICT(card_id) DO UPDATE SET result=excluded.result,proof_location=excluded.proof_location,"
            "verified=1,verified_at=excluded.verified_at",
            (card_id, data["result"], data["proof_location"], 1, verified_at),
        )
        return {**decision, "decision_time": verified_at}
    return _idempotent(job_key, "pes-store-proof", card_id, process_key, operation)
