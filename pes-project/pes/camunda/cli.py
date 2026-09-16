import json

from pes.camunda import client
from pes.camunda.services import register_user
from pes.database import get_db


def add_parser(subparsers) -> None:
    parser = subparsers.add_parser("path-c", help="control team work through Camunda 8")
    actions = parser.add_subparsers(dest="path_c_action", required=True)
    actions.add_parser("health", help="check the Camunda Orchestration Cluster")
    actions.add_parser("deploy", help="deploy BPMN, DMN, and linked forms")
    start = actions.add_parser("start", help="start one PES commitment process")
    start.add_argument("id")
    start.add_argument("--name", required=True)
    start.add_argument("--current", required=True)
    start.add_argument("--desired", required=True)
    start.add_argument("--proof", required=True)
    start.add_argument("--next-action", required=True)
    start.add_argument("--owner", required=True)
    start.add_argument("--level", default="Task", choices=["Project", "Milestone", "Task"])
    start.add_argument("--parent")
    start.add_argument("--priority", type=int, default=0)
    start.add_argument("--risk", default="Low", choices=["Low", "Medium", "High"])
    start.add_argument("--fallback")
    actions.add_parser("resources", help="list deployable source resources")
    user = actions.add_parser("user", help="register a PES user and separated role")
    user.add_argument("user_id")
    user.add_argument("--role", required=True,
                      choices=["worker", "operator", "model-author", "admin"])
    actions.add_parser("users", help="list registered PES users")


def handle(args) -> None:
    if args.path_c_action == "health":
        print(client.health())
    elif args.path_c_action == "deploy":
        print(json.dumps(client.deploy(), indent=2))
    elif args.path_c_action == "resources":
        for path in client.resource_files():
            print(path)
    elif args.path_c_action == "user":
        register_user(args.user_id, args.role)
        print(f"registered {args.user_id} as {args.role}")
    elif args.path_c_action == "users":
        conn = get_db()
        try:
            for row in conn.execute("SELECT user_id,role,active FROM pes_users ORDER BY user_id"):
                print(f"{row['user_id']}: {row['role']} active={bool(row['active'])}")
        finally:
            conn.close()
    elif args.path_c_action == "start":
        variables = {
            "card_id": args.id, "name": args.name, "level": args.level,
            "parent_id": args.parent, "current_state_desc": args.current,
            "desired_state_desc": args.desired, "proof_of_completion": args.proof,
            "next_physical_action": args.next_action, "owner": args.owner,
            "priority": args.priority, "risk_level": args.risk,
            "fallback_action": args.fallback, "pes_state": "Captured",
            "projection_version": 0, "process_version": 1,
        }
        if (args.priority >= 80 or args.risk == "High") and not args.fallback:
            raise ValueError("fallback is required for high-priority or high-risk work")
        print(f"started process instance {client.start(variables)}")
