"""Path E v1 HTTP routes for the extended engine."""
import json
import threading
from http.server import ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

from pes.path_e.core import EngineError, HTTPClient as CoreHTTPClient, handler_for as core_handler_for


def handler_for(engine):
    Base = core_handler_for(engine)

    class Handler(Base):
        def _meta(self):
            return {"actor": self.headers.get("X-PES-Actor", "user"),
                    "request_id": self.headers.get("X-Request-ID")}

        def do_PATCH(self):
            parts = urlparse(self.path).path.strip("/").split("/")
            if len(parts) == 3 and parts[:2] == ["v1", "commitments"]:
                def update():
                    body = self._body()
                    expected = body.pop("expected_updated_at", None)
                    return engine.update(parts[2], body, expected_updated_at=expected, **self._meta())
                return self._run(update)
            self._reply(404, EngineError("NOT_FOUND", "route not found", status=404).payload())

        def do_POST(self):
            parts = urlparse(self.path).path.strip("/").split("/")
            if parts == ["v1", "capacity"]:
                return self._run(lambda: engine.set_capacity(self._body(), **self._meta()))
            if parts == ["v1", "links"]:
                return self._run(lambda: engine.add_link(self._body(), **self._meta()))
            return super().do_POST()

        def do_DELETE(self):
            parsed = urlparse(self.path); parts = parsed.path.strip("/").split("/")
            if parts == ["v1", "links"]:
                query = parse_qs(parsed.query)
                def remove():
                    try:
                        return engine.remove_link(query["from_id"][0], query["to_id"][0],
                                                  query["link_type"][0], **self._meta())
                    except (KeyError, IndexError):
                        raise EngineError("VALIDATION_ERROR", "from_id, to_id, and link_type are required") from None
                return self._run(remove)
            self._reply(404, EngineError("NOT_FOUND", "route not found", status=404).payload())

        def do_GET(self):
            parsed = urlparse(self.path); parts = parsed.path.strip("/").split("/")
            query = parse_qs(parsed.query)
            if parts == ["v1", "health"]:
                return self._run(engine.health)
            if len(parts) == 3 and parts[:2] == ["v1", "capacity"]:
                return self._run(lambda: engine.get_capacity(parts[2]))
            if parts == ["v1", "log"]:
                return self._run(lambda: engine.log(
                    card_id=query.get("card_id", [None])[0],
                    limit=query.get("limit", [100])[0], offset=query.get("offset", [0])[0]))
            if len(parts) == 4 and parts[:2] == ["v1", "commitments"] and parts[3] == "history":
                return self._run(lambda: engine.history(parts[2]))
            if parts == ["v1", "proof"]:
                return self._run(lambda: engine.proof(query.get("card_id", [None])[0],
                                                       limit=query.get("limit", [100])[0]))
            return super().do_GET()
    return Handler


def start_server(engine, host="127.0.0.1", port=0):
    server = ThreadingHTTPServer((host, port), handler_for(engine))
    thread = threading.Thread(target=server.serve_forever, daemon=True); thread.start()
    return server, thread


class HTTPClient(CoreHTTPClient):
    def update(self, card_id, changes):
        return self._call("PATCH", f"/v1/commitments/{card_id}", changes)
    def set_capacity(self, data): return self._call("POST", "/v1/capacity", data)
    def get_capacity(self, week): return self._call("GET", f"/v1/capacity/{week}")
    def add_link(self, data): return self._call("POST", "/v1/links", data)
    def remove_link(self, from_id, to_id, link_type):
        return self._call("DELETE", f"/v1/links?from_id={from_id}&to_id={to_id}&link_type={link_type}")
    def log(self): return self._call("GET", "/v1/log")
    def history(self, card_id): return self._call("GET", f"/v1/commitments/{card_id}/history")
    def proof(self, card_id=None):
        suffix = "" if card_id is None else f"?card_id={card_id}"
        return self._call("GET", "/v1/proof" + suffix)
    def health(self): return self._call("GET", "/v1/health")
