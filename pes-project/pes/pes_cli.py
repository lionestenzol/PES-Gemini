import argparse
from rich.console import Console
from pes.database import init_db
from pes.commands import inbox, card, schedule, execute, verify, map_cmd, review, views, capacity_cmd, proof, repeat, protocol
from pes.temporal import cli as temporal_cli
from pes.camunda import cli as camunda_cli
from pes.path_d import cli as path_d_cli


def build_parser():
    parser = argparse.ArgumentParser(prog="pes", description="PES commitment control system")
    sub = parser.add_subparsers(dest="command", required=True)
    temporal_cli.add_parser(sub)
    camunda_cli.add_parser(sub)
    path_d_cli.add_parser(sub)
    sub.add_parser("init", help="initialize the SQLite database")
    p = sub.add_parser("protocol", help="track two-week operational evidence")
    s = p.add_subparsers(dest="protocol_action", required=True)
    q = s.add_parser("start"); q.add_argument("--path", required=True, choices=["A","B","C","D","E"]); q.add_argument("--date")
    q = s.add_parser("record"); q.add_argument("run_id", type=int); q.add_argument("--type", required=True)
    q.add_argument("--evidence", required=True); q.add_argument("--outcome", default="observed", choices=["pass","fail","observed"])
    q.add_argument("--friction"); q.add_argument("--date")
    q = s.add_parser("status"); q.add_argument("run_id", type=int)
    q = s.add_parser("complete"); q.add_argument("run_id", type=int)

    p = sub.add_parser("inbox", help="capture and process raw input")
    s = p.add_subparsers(dest="inbox_action", required=True)
    q = s.add_parser("add", help="add raw input"); q.add_argument("text", nargs="+")
    s.add_parser("list", help="list unprocessed input")
    q = s.add_parser("process", help="process one inbox item")
    q.add_argument("id", type=int); q.add_argument("--action", required=True, choices=["delete","do","define","map","store","review"])
    q.add_argument("--card-id"); q.add_argument("--name"); q.add_argument("--level", choices=["Project","Milestone","Task"])
    q.add_argument("--current"); q.add_argument("--desired"); q.add_argument("--proof"); q.add_argument("--next-action")

    p = sub.add_parser("card", help="define, inspect, update, and move commitments")
    s = p.add_subparsers(dest="card_action", required=True)
    q = s.add_parser("define", help="create or define a card"); q.add_argument("id"); q.add_argument("--name")
    q.add_argument("--current"); q.add_argument("--desired"); q.add_argument("--proof"); q.add_argument("--action", "--next-action", dest="next_action")
    q.add_argument("--level", choices=["Project","Milestone","Task"]); q.add_argument("--parent")
    q = s.add_parser("show"); q.add_argument("id")
    q = s.add_parser("move"); q.add_argument("id"); q.add_argument("--to", required=True, choices=["ready","scheduled","active","completed","verified","done","paused","blocked","canceled"])
    for flag in ("result","proof-location","note","reason","waiting","review","fallback","resume-action"):
        q.add_argument("--" + flag)
    q = s.add_parser("list"); q.add_argument("--state"); q.add_argument("--parent")
    q = s.add_parser("update"); q.add_argument("id"); q.add_argument("--field", required=True); q.add_argument("--value", required=True)
    q = s.add_parser("schedule", help="schedule a Ready card"); q.add_argument("id"); q.add_argument("--date", required=True); q.add_argument("--start"); q.add_argument("--duration", type=int); q.set_defaults(schedule_action="set")
    q = s.add_parser("unschedule", help="return a Scheduled card to Ready"); q.add_argument("id"); q.set_defaults(schedule_action="remove")

    p = sub.add_parser("capacity", help="set or show weekly capacity")
    s = p.add_subparsers(dest="capacity_action", required=True)
    q = s.add_parser("set"); q.add_argument("--week", required=True); q.add_argument("--total", type=float, required=True)
    q.add_argument("--fixed", type=float, default=0); q.add_argument("--meals", type=float, default=0); q.add_argument("--recovery", type=float, default=0)
    q = s.add_parser("show"); q.add_argument("--week")

    for name in ("start", "done"):
        q = sub.add_parser(name); q.add_argument("id")
    q = sub.add_parser("stop"); q.add_argument("id"); q.add_argument("--result", required=True); q.add_argument("--proof-location"); q.add_argument("--note")
    q = sub.add_parser("pause"); q.add_argument("id"); q.add_argument("--reason", required=True); q.add_argument("--resume-action", required=True)
    q = sub.add_parser("block"); q.add_argument("id"); q.add_argument("--reason", required=True); q.add_argument("--waiting", required=True); q.add_argument("--review", required=True); q.add_argument("--fallback")
    q = sub.add_parser("verify"); q.add_argument("id")

    p = sub.add_parser("proof"); s = p.add_subparsers(dest="proof_action", required=True)
    s.add_parser("list"); q = s.add_parser("show"); q.add_argument("card_id")
    p = sub.add_parser("link"); s = p.add_subparsers(dest="map_action", required=True)
    for action in ("add", "remove"):
        q = s.add_parser(action); q.add_argument("from_id"); q.add_argument("--to", required=True); q.add_argument("--type", required=True, choices=["blocks","helps","produces","requires","excludes"])
    p = sub.add_parser("map"); s = p.add_subparsers(dest="map_action", required=True); q = s.add_parser("show"); q.add_argument("outcome_id")

    q = sub.add_parser("day"); q.add_argument("--date")
    q = sub.add_parser("week"); q.add_argument("--week")
    sub.add_parser("queue")
    p = sub.add_parser("view"); s = p.add_subparsers(dest="view_name", required=True)
    for name in ("active","verify","blocked","proof","records"): s.add_parser(name)
    q = sub.add_parser("log"); q.add_argument("--card"); q.add_argument("--date"); q.add_argument("--limit", type=int)
    p = sub.add_parser("review"); s = p.add_subparsers(dest="review_action", required=True)
    q = s.add_parser("end-of-day"); q.add_argument("--mode", choices=sorted(review.MODES)); q.add_argument("--must-happen", required=True)
    s.add_parser("weekly")
    q = sub.add_parser("repeat"); q.add_argument("id")
    q = sub.add_parser("calendar"); q.add_argument("--output", required=True); q.add_argument("--week")
    sub.add_parser("tui")
    sub.add_parser("config")
    return parser


def main(argv=None):
    args = build_parser().parse_args(argv)
    init_db()
    try:
        console = Console()
        if args.command == "path-b": temporal_cli.handle(args)
        elif args.command == "path-c": camunda_cli.handle(args)
        elif args.command == "path-d": path_d_cli.handle(args)
        elif args.command == "protocol": protocol.handle(args)
        elif args.command == "init": console.print("Database initialized.", style="bold green")
        elif args.command == "inbox": inbox.handle(args)
        elif args.command == "card" and args.card_action in ("schedule","unschedule"): schedule.handle(args)
        elif args.command == "card": card.handle(args)
        elif args.command == "capacity": capacity_cmd.handle(args)
        elif args.command == "start": execute.handle_start(args)
        elif args.command == "stop": execute.handle_stop(args)
        elif args.command == "pause": execute.handle_pause(args)
        elif args.command == "block": execute.handle_block(args)
        elif args.command == "verify": verify.handle(args)
        elif args.command == "done": verify.handle_done(args)
        elif args.command == "proof": proof.handle(args)
        elif args.command in ("link","map"): map_cmd.handle(args)
        elif args.command == "day": views.handle_day(args)
        elif args.command == "week": views.handle_week(args)
        elif args.command == "queue": views.handle_queue(args)
        elif args.command == "view": views.handle_named(args)
        elif args.command == "log": views.handle_log(args)
        elif args.command == "review": review.handle(args)
        elif args.command == "repeat": repeat.handle(args)
        elif args.command == "calendar":
            from pes.calendar_export import export_calendar
            print(f"Exported {export_calendar(args.output, args.week)} event(s) to {args.output}.")
        elif args.command == "tui":
            from pes.tui import main as tui_main
            tui_main()
        elif args.command == "config":
            from pes.config import load_config
            cfg = load_config()
            for key, value in cfg.items(): print(f"{key}: {value}")
        return 0
    except Exception as exc:
        Console(stderr=True).print(f"Error: {exc}", style="bold red")
        return 1
