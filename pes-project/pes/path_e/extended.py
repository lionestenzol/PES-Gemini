"""Extended Path E commands and queries built on the public core engine."""
import datetime as dt
import json

from pes.config import load_config
from pes.engine.graph_engine import add_link as graph_add_link, remove_link as graph_remove_link
from pes.engine.time_engine import compute_capacity
from pes.path_e.core import Engine as CoreEngine, EngineError, InProcessClient as CoreInProcessClient


class Engine(CoreEngine):
    UPDATE_FIELDS = {
        "name", "level", "parent_id", "current_state_desc", "desired_state_desc",
        "proof_of_completion", "next_physical_action", "planned_date",
        "planned_start", "planned_end", "planned_duration", "actual_start",
        "actual_end", "result", "proof_location", "block_reason", "waiting_for",
        "review_date", "fallback_action", "owner", "priority", "risk_level",
        "desired_result_made", "proof_exists", "proof_stored",
        "required_action_remains",
    }

    def update(self, card_id, changes, *, actor="user", request_id=None,
               expected_updated_at=None):
        request_id = request_id or self.id_factory()
        if "state" in changes:
            raise EngineError("STATE_MOVE_REQUIRED", "state must use the move command", field="state")
        unknown = set(changes) - self.UPDATE_FIELDS
        if unknown:
            field = sorted(unknown)[0]
            raise EngineError("UNKNOWN_FIELD", f"unknown field: {field}", field=field)
        if not changes:
            raise EngineError("VALIDATION_ERROR", "at least one field is required")
        conn = self.adapter.connect()
        try:
            conn.execute("BEGIN IMMEDIATE")
            before = conn.execute("SELECT * FROM commitments WHERE id=?", (card_id,)).fetchone()
            if not before:
                raise EngineError("NOT_FOUND", f"commitment {card_id} not found", status=404)
            if expected_updated_at is not None and before["updated_at"] != expected_updated_at:
                raise EngineError("STALE_VERSION", "commitment changed; refresh and retry", status=409)
            timestamp = self.clock().isoformat()
            assignments = ",".join(f"{field}=?" for field in changes)
            conn.execute(f"UPDATE commitments SET {assignments},updated_at=? WHERE id=?",
                         (*changes.values(), timestamp, card_id))
            event = self._event(conn, card_id, "commitment.updated", actor, request_id)
            row = conn.execute("SELECT * FROM commitments WHERE id=?", (card_id,)).fetchone()
            conn.commit()
            return {"ok": True, "data": self._public(row), "event_id": event,
                    "request_id": request_id}
        except EngineError:
            conn.rollback(); raise
        except Exception:
            conn.rollback(); raise
        finally:
            conn.close()

    def set_capacity(self, data, *, actor="user", request_id=None):
        request_id = request_id or self.id_factory()
        required = ("week_of", "total_hours", "fixed_commitments",
                    "meals_travel_transitions", "recovery_reserve")
        for field in required:
            if field not in data:
                raise EngineError("VALIDATION_ERROR", f"{field} is required", field=field)
        try:
            date = dt.date.fromisoformat(data["week_of"])
            monday = date - dt.timedelta(days=date.weekday())
            values = [float(data[field]) for field in required[1:]]
            available, limit = compute_capacity(*values, load_config()["work_time_unit"])
        except (ValueError, TypeError) as exc:
            raise EngineError("VALIDATION_ERROR", str(exc)) from None
        conn = self.adapter.connect()
        try:
            conn.execute("BEGIN IMMEDIATE")
            conn.execute(
                """INSERT INTO capacity(week_of,total_hours,fixed_commitments,
                   meals_travel_transitions,recovery_reserve,available_capacity,schedule_limit)
                   VALUES(?,?,?,?,?,?,?) ON CONFLICT(week_of) DO UPDATE SET
                   total_hours=excluded.total_hours,fixed_commitments=excluded.fixed_commitments,
                   meals_travel_transitions=excluded.meals_travel_transitions,
                   recovery_reserve=excluded.recovery_reserve,
                   available_capacity=excluded.available_capacity,
                   schedule_limit=excluded.schedule_limit""",
                (monday.isoformat(), *values, available, limit))
            event = self._event(conn, None, "capacity.set", actor, request_id)
            row = conn.execute("SELECT * FROM capacity WHERE week_of=?", (monday.isoformat(),)).fetchone()
            conn.commit()
            return {"ok": True, "data": dict(row), "event_id": event,
                    "request_id": request_id}
        except Exception:
            conn.rollback(); raise
        finally:
            conn.close()

    def get_capacity(self, week_of):
        try:
            date = dt.date.fromisoformat(week_of)
        except ValueError as exc:
            raise EngineError("VALIDATION_ERROR", str(exc), field="week_of") from None
        monday = date - dt.timedelta(days=date.weekday())
        conn = self.adapter.connect()
        try:
            row = conn.execute("SELECT * FROM capacity WHERE week_of=?", (monday.isoformat(),)).fetchone()
            if not row:
                raise EngineError("NOT_FOUND", "capacity not set for this week", status=404)
            return {"ok": True, "data": dict(row)}
        finally:
            conn.close()

    def add_link(self, data, *, actor="user", request_id=None):
        request_id = request_id or self.id_factory()
        conn = self.adapter.connect()
        try:
            conn.execute("BEGIN IMMEDIATE")
            graph_add_link(conn, data.get("from_id"), data.get("to_id"), data.get("link_type"))
            event = self._event(conn, data.get("to_id"), "link.created", actor, request_id)
            conn.commit()
            return {"ok": True, "data": dict(data), "event_id": event,
                    "request_id": request_id}
        except ValueError as exc:
            conn.rollback(); raise EngineError("PES_RULE_REJECTED", str(exc), status=409) from None
        except Exception as exc:
            conn.rollback()
            if "UNIQUE constraint failed" in str(exc):
                raise EngineError("CONFLICT", "link already exists", status=409) from None
            raise
        finally:
            conn.close()

    def remove_link(self, from_id, to_id, link_type, *, actor="user", request_id=None):
        request_id = request_id or self.id_factory()
        conn = self.adapter.connect()
        try:
            conn.execute("BEGIN IMMEDIATE")
            graph_remove_link(conn, from_id, to_id, link_type)
            event = self._event(conn, to_id, "link.removed", actor, request_id)
            conn.commit()
            return {"ok": True, "data": {"from_id": from_id, "to_id": to_id,
                    "link_type": link_type}, "event_id": event, "request_id": request_id}
        except ValueError as exc:
            conn.rollback(); raise EngineError("NOT_FOUND", str(exc), status=404) from None
        finally:
            conn.close()

    def log(self, *, card_id=None, limit=100, offset=0):
        limit, offset = max(1, min(int(limit), 200)), max(0, int(offset))
        conn = self.adapter.connect()
        try:
            if card_id:
                rows = conn.execute("SELECT * FROM path_e_events WHERE card_id=? ORDER BY occurred_at DESC,event_id LIMIT ? OFFSET ?", (card_id, limit, offset)).fetchall()
            else:
                rows = conn.execute("SELECT * FROM path_e_events ORDER BY occurred_at DESC,event_id LIMIT ? OFFSET ?", (limit, offset)).fetchall()
            return {"ok": True, "data": [dict(row) for row in rows],
                    "page": {"limit": limit, "offset": offset}}
        finally:
            conn.close()

    def proof(self, card_id=None, *, limit=100):
        limit = max(1, min(int(limit), 200))
        conn = self.adapter.connect()
        try:
            if card_id:
                rows = conn.execute("SELECT * FROM proof_index WHERE card_id=?", (card_id,)).fetchall()
            else:
                rows = conn.execute("SELECT * FROM proof_index ORDER BY verified_at DESC LIMIT ?", (limit,)).fetchall()
            return {"ok": True, "data": [dict(row) for row in rows]}
        finally:
            conn.close()

    def health(self):
        conn = self.adapter.connect()
        try:
            conn.execute("SELECT 1").fetchone()
            return {"ok": True, "data": {"process": "healthy", "backend": "ready",
                    "api_version": self.api_version}}
        finally:
            conn.close()

class InProcessClient(CoreInProcessClient):
    def update(self, card_id, changes, **meta): return self.engine.update(card_id, changes, **meta)
    def set_capacity(self, data, **meta): return self.engine.set_capacity(data, **meta)
    def get_capacity(self, week): return self.engine.get_capacity(week)
    def add_link(self, data, **meta): return self.engine.add_link(data, **meta)
    def remove_link(self, from_id, to_id, link_type, **meta):
        return self.engine.remove_link(from_id, to_id, link_type, **meta)
    def log(self, **page): return self.engine.log(**page)
    def history(self, card_id): return self.engine.history(card_id)
    def proof(self, card_id=None, **page): return self.engine.proof(card_id, **page)
    def health(self): return self.engine.health()
