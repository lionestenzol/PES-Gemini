import json

from pes.database import get_db
from .service import import_plan, reject_plan, show_run, solve_week, stop_solve


def add_parser(subparsers):
    parser=subparsers.add_parser("path-d", help="optimize week plans with OR-Tools")
    actions=parser.add_subparsers(dest="path_d_action", required=True)
    q=actions.add_parser("solve"); q.add_argument("--week", required=True); q.add_argument("--time-limit",type=float,default=10); q.add_argument("--seed",type=int,default=1); q.add_argument("--what-if"); q.add_argument("--run-id"); q.add_argument("--cards",help="comma-separated card IDs to plan")
    q=actions.add_parser("show"); q.add_argument("run_id")
    q=actions.add_parser("import"); q.add_argument("run_id")
    q=actions.add_parser("reject"); q.add_argument("run_id")
    q=actions.add_parser("stop"); q.add_argument("run_id")
    actions.add_parser("runs")
    q=actions.add_parser("fixed-add"); q.add_argument("id"); q.add_argument("--name",required=True); q.add_argument("--date",required=True); q.add_argument("--start",required=True); q.add_argument("--end",required=True); q.add_argument("--resource",required=True)
    q=actions.add_parser("fixed-remove"); q.add_argument("id")
    actions.add_parser("health")


def handle(args):
    action=args.path_d_action
    if action == "solve":
        what_if=json.loads(args.what_if) if args.what_if else None
        card_ids=[item.strip() for item in args.cards.split(",") if item.strip()] if args.cards else None
        print(json.dumps(solve_week(args.week,time_limit=args.time_limit,seed=args.seed,what_if=what_if,run_id=args.run_id,card_ids=card_ids),indent=2))
    elif action == "show": print(json.dumps(show_run(args.run_id),indent=2))
    elif action == "import": print(f"Imported {import_plan(args.run_id)} work block(s).")
    elif action == "reject": reject_plan(args.run_id); print("Proposal rejected; PES plan unchanged.")
    elif action == "stop": stop_solve(args.run_id); print(f"Stop requested for {args.run_id}.")
    elif action == "runs":
        conn=get_db()
        try:
            for row in conn.execute("SELECT run_id,week_of,status,hard_score,soft_score,imported_at,rejected_at FROM solver_runs ORDER BY created_at DESC"):
                print(f"{row['run_id']} | {row['week_of']} | {row['status']} | {row['hard_score']}/{row['soft_score']} | imported={row['imported_at']} rejected={row['rejected_at']}")
        finally: conn.close()
    elif action == "fixed-add":
        conn=get_db()
        try:
            conn.execute("INSERT INTO fixed_events(id,name,event_date,start_time,end_time,resource) VALUES (?,?,?,?,?,?)",(args.id,args.name,args.date,args.start,args.end,args.resource)); conn.commit()
        finally: conn.close()
        print(f"Fixed event {args.id} added.")
    elif action == "fixed-remove":
        conn=get_db()
        try: conn.execute("DELETE FROM fixed_events WHERE id=?",(args.id,)); conn.commit()
        finally: conn.close()
        print(f"Fixed event {args.id} removed.")
    elif action == "health":
        import ortools
        print(f"Path D healthy: OR-Tools {ortools.__version__}")
