import argparse
from http.server import ThreadingHTTPServer

from pes.database import init_db
from pes.path_e import Engine
from pes.path_e.api import handler_for


def main(argv=None):
    parser = argparse.ArgumentParser(description="Run the PES Path E HTTP API")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8787)
    args = parser.parse_args(argv)
    init_db()
    engine = Engine()
    server = ThreadingHTTPServer((args.host, args.port), handler_for(engine))
    print(f"PES Path E API v1 listening on http://{args.host}:{server.server_port}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.shutdown(); server.server_close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
