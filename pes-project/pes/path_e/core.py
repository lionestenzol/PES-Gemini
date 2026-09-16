"""Path E universal application engine and clients.

This module is the public boundary. Clients send commands and queries here;
existing PES state and guard laws remain owned by pes.engine.
"""
from __future__ import annotations

import datetime as dt
import json
import threading
import urllib.error
import urllib.request
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

from pes.database import get_db
from pes.engine.state_machine import move_card

PUBLIC_FIELDS = (
    "id", "level", "name", "parent_id", "current_state_desc",
    "desired_state_desc", "proof_of_completion", "next_physical_action",
    "state", "schedule_status", "planned_date", "planned_start", "planned_end",
    "planned_duration", "actual_start", "actual_end", "result",
    "proof_location", "block_reason", "waiting_for", "review_date",
    "fallback_action", "owner", "priority", "risk_level", "created_at",
    "updated_at",
)


class EngineError(Exception):
    def __init__(self, code: str, message: str, *, field=None, status=400):
        super().__init__(message)
        self.code, self.message, self.field, self.status = code, message, field, status

    def payload(self):
        error = {"code": self.code, "message": self.message}
        if self.field:
            error["field"] = self.field
        return {"ok": False, "error": error}


class SQLiteAdapter:
    """Replaceable persistence adapter; it owns SQL and connections, not rules."""

    def connect(self):
        return get_db()

    def initialize(self):
        conn = self.connect()
        conn.executescript("""
            CREATE TABLE IF NOT EXISTS path_e_commands (
                actor TEXT NOT NULL, idempotency_key TEXT NOT NULL,
                command_name TEXT NOT NULL, request_id TEXT NOT NULL,
                result_json TEXT NOT NULL,
                created_at TEXT NOT NULL DEFAULT (datetime('now')),
                PRIMARY KEY(actor, idempotency_key));
            CREATE TABLE IF NOT EXISTS path_e_events (
                event_id TEXT PRIMARY KEY, card_id TEXT, event_type TEXT NOT NULL,
                occurred_at TEXT NOT NULL, actor TEXT NOT NULL,
                request_id TEXT NOT NULL, old_state TEXT, new_state TEXT,
                payload_json TEXT NOT NULL);
        """)
        conn.commit(); conn.close()


class Engine:
    """Versioned in-process command/query interface shared by all clients."""

    api_version = "v1"

    def __init__(self, adapter=None, *, clock=None, id_factory=None):
        self.adapter = adapter or SQLiteAdapter()
        self.clock = clock or (lambda: dt.datetime.now(dt.timezone.utc))
        self.id_factory = id_factory or (lambda: str(uuid.uuid4()))
        self.adapter.initialize()

    @staticmethod
    def _public(row):
        return {field: row[field] for field in PUBLIC_FIELDS if field in row.keys()}

    def _stored(self, conn, actor, key):
        if not key:
            return None
        row = conn.execute(
            "SELECT result_json FROM path_e_commands WHERE actor=? AND idempotency_key=?",
            (actor, key),
        ).fetchone()
        return json.loads(row[0]) if row else None

    def _remember(self, conn, actor, key, name, request_id, result):
        if key:
            conn.execute(
                "INSERT INTO path_e_commands VALUES(?,?,?,?,?,datetime('now'))",
                (actor, key, name, request_id, json.dumps(result, sort_keys=True)),
            )

    def _event(self, conn, card_id, kind, actor, request_id, old=None, new=None):
        event_id = self.id_factory()
        conn.execute(
            "INSERT INTO path_e_events VALUES(?,?,?,?,?,?,?,?,?)",
            (event_id, card_id, kind, self.clock().isoformat(), actor, request_id,
             old, new, "{}"),
        )
        return event_id

    def create(self, data, *, actor="user", request_id=None, idempotency_key=None):
        request_id = request_id or self.id_factory()
        conn = self.adapter.connect()
        try:
            conn.execute("BEGIN IMMEDIATE")
            stored = self._stored(conn, actor, idempotency_key)
            if stored is not None:
                conn.rollback(); return stored
            for field in ("id", "name"):
                if not str(data.get(field, "")).strip():
                    raise EngineError("VALIDATION_ERROR", f"{field} is required", field=field)
            allowed = {"id", "name", "level", "parent_id", "current_state_desc",
                       "desired_state_desc", "proof_of_completion",
                       "next_physical_action", "owner", "priority", "risk_level",
                       "fallback_action"}
            unknown = set(data) - allowed
            if unknown:
                field = sorted(unknown)[0]
                raise EngineError("UNKNOWN_FIELD", f"unknown field: {field}", field=field)
            columns = list(data)
            conn.execute(
                f"INSERT INTO commitments ({','.join(columns)}) VALUES ({','.join('?' for _ in columns)})",
                list(data.values()),
            )
            row = conn.execute("SELECT * FROM commitments WHERE id=?", (data["id"],)).fetchone()
            event = self._event(conn, data["id"], "commitment.created", actor, request_id,
                                new="Captured")
            result = {"ok": True, "data": self._public(row), "event_id": event,
                      "request_id": request_id}
            self._remember(conn, actor, idempotency_key, "commitment.create", request_id, result)
            conn.commit(); return result
        except EngineError:
            conn.rollback(); raise
        except Exception as exc:
            conn.rollback()
            if "UNIQUE constraint failed" in str(exc):
                raise EngineError("CONFLICT", "commitment already exists", status=409) from None
            raise
        finally:
            conn.close()

    def get(self, card_id):
        conn = self.adapter.connect()
        try:
            row = conn.execute("SELECT * FROM commitments WHERE id=?", (card_id,)).fetchone()
            if not row:
                raise EngineError("NOT_FOUND", f"commitment {card_id} not found", status=404)
            return {"ok": True, "data": self._public(row)}
        finally:
            conn.close()

    def move(self, card_id, target, *, actor="user", request_id=None,
             idempotency_key=None, expected_updated_at=None, **facts):
        request_id = request_id or self.id_factory()
        conn = self.adapter.connect()
        try:
            conn.execute("BEGIN IMMEDIATE")
            stored = self._stored(conn, actor, idempotency_key)
            if stored is not None:
                conn.rollback(); return stored
            before = conn.execute(
                "SELECT state,updated_at FROM commitments WHERE id=?", (card_id,)
            ).fetchone()
            if not before:
                raise EngineError("NOT_FOUND", f"commitment {card_id} not found", status=404)
            if expected_updated_at is not None and before["updated_at"] != expected_updated_at:
                raise EngineError("STALE_VERSION", "commitment changed; refresh and retry", status=409)
            move_card(card_id, target, _conn=conn, **facts)
            event = self._event(conn, card_id, "commitment.moved", actor, request_id,
                                old=before["state"], new=target)
            row = conn.execute("SELECT * FROM commitments WHERE id=?", (card_id,)).fetchone()
            result = {"ok": True, "data": self._public(row), "event_id": event,
                      "request_id": request_id}
            self._remember(conn, actor, idempotency_key, "commitment.move", request_id, result)
            conn.commit(); return result
        except EngineError:
            conn.rollback(); raise
        except ValueError as exc:
            conn.rollback()
            raise EngineError("PES_RULE_REJECTED", str(exc), status=409) from None
        except Exception:
            conn.rollback(); raise
        finally:
            conn.close()

    def view(self, name, *, limit=100, offset=0):
        states = {"inbox": ("Captured",), "ready": ("Ready",),
                  "active": ("Active",), "verify": ("Completed",),
                  "blocked": ("Blocked",), "records": ("Done", "Canceled")}
        if name not in states:
            raise EngineError("UNKNOWN_VIEW", f"unknown view: {name}", status=404)
        limit, offset = max(1, min(int(limit), 200)), max(0, int(offset))
        marks = ",".join("?" for _ in states[name])
        conn = self.adapter.connect()
        try:
            rows = conn.execute(
                f"SELECT * FROM commitments WHERE state IN ({marks}) ORDER BY priority DESC,created_at,id LIMIT ? OFFSET ?",
                (*states[name], limit, offset),
            ).fetchall()
            return {"ok": True, "data": [self._public(row) for row in rows],
                    "page": {"limit": limit, "offset": offset}}
        finally:
            conn.close()

    def history(self, card_id):
        conn = self.adapter.connect()
        try:
            rows = conn.execute(
                "SELECT * FROM path_e_events WHERE card_id=? ORDER BY occurred_at,event_id",
                (card_id,),
            ).fetchall()
            return {"ok": True, "data": [dict(row) for row in rows]}
        finally:
            conn.close()


class InProcessClient:
    def __init__(self, engine): self.engine = engine
    def create(self, data, **meta): return self.engine.create(data, **meta)
    def get(self, card_id): return self.engine.get(card_id)
    def move(self, card_id, target, **meta): return self.engine.move(card_id, target, **meta)
    def view(self, name, **page): return self.engine.view(name, **page)


def handler_for(engine):
    class Handler(BaseHTTPRequestHandler):
        def _reply(self, status, payload):
            body = json.dumps(payload).encode()
            self.send_response(status)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers(); self.wfile.write(body)

        def _body(self):
            length = int(self.headers.get("Content-Length", "0"))
            if length > 1_000_000:
                raise EngineError("INPUT_TOO_LARGE", "request exceeds 1 MB", status=413)
            return json.loads(self.rfile.read(length) or b"{}")

        def _run(self, operation):
            try: self._reply(200, operation())
            except EngineError as exc: self._reply(exc.status, exc.payload())
            except (json.JSONDecodeError, ValueError):
                self._reply(400, EngineError("INVALID_JSON", "invalid request body").payload())

        def do_POST(self):
            parts = urlparse(self.path).path.strip("/").split("/")
            if parts == ["v1", "commitments"]:
                def create():
                    return engine.create(
                        self._body(), actor=self.headers.get("X-PES-Actor", "user"),
                        request_id=self.headers.get("X-Request-ID"),
                        idempotency_key=self.headers.get("Idempotency-Key"))
                return self._run(create)
            if len(parts) == 4 and parts[:2] == ["v1", "commitments"] and parts[3] == "move":
                def move_request():
                    body = self._body(); target = body.pop("target")
                    return engine.move(
                        parts[2], target, actor=self.headers.get("X-PES-Actor", "user"),
                        request_id=self.headers.get("X-Request-ID"),
                        idempotency_key=self.headers.get("Idempotency-Key"), **body)
                return self._run(move_request)
            self._reply(404, EngineError("NOT_FOUND", "route not found", status=404).payload())

        def do_GET(self):
            parsed = urlparse(self.path); parts = parsed.path.strip("/").split("/")
            query = parse_qs(parsed.query)
            if len(parts) == 3 and parts[:2] == ["v1", "commitments"]:
                return self._run(lambda: engine.get(parts[2]))
            if len(parts) == 3 and parts[:2] == ["v1", "views"]:
                return self._run(lambda: engine.view(
                    parts[2], limit=query.get("limit", [100])[0],
                    offset=query.get("offset", [0])[0]))
            self._reply(404, EngineError("NOT_FOUND", "route not found", status=404).payload())

        def log_message(self, *_): pass
    return Handler


def start_server(engine, host="127.0.0.1", port=0):
    server = ThreadingHTTPServer((host, port), handler_for(engine))
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    return server, thread


class HTTPClient:
    def __init__(self, base_url): self.base_url = base_url.rstrip("/")

    def _call(self, method, path, body=None, headers=None):
        data = None if body is None else json.dumps(body).encode()
        request = urllib.request.Request(
            self.base_url + path, data=data, method=method,
            headers={"Content-Type": "application/json", **(headers or {})})
        try:
            with urllib.request.urlopen(request) as response: return json.load(response)
        except urllib.error.HTTPError as exc:
            payload = json.load(exc); error = payload["error"]
            raise EngineError(error["code"], error["message"],
                              field=error.get("field"), status=exc.code) from None

    def create(self, data, **headers):
        return self._call("POST", "/v1/commitments", data, headers)

    def get(self, card_id):
        return self._call("GET", f"/v1/commitments/{card_id}")

    def move(self, card_id, target, **facts):
        return self._call("POST", f"/v1/commitments/{card_id}/move",
                          {"target": target, **facts})

    def view(self, name):
        return self._call("GET", f"/v1/views/{name}")
