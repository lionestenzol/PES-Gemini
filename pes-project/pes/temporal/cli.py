import argparse
import asyncio
import json

from pes.temporal.client import (
    ensure_review_schedules, health, query_card, send_command, start_commitment,
)
from pes.temporal.models import CommitmentState
from pes.temporal.rebuild import rebuild_commitment_projections
from pes.temporal.backup import backup_runtime
from pes.temporal.evidence import nine_questions


def add_parser(subparsers) -> None:
    parser = subparsers.add_parser(
        "path-b", help="control durable commitments through Temporal"
    )
    actions = parser.add_subparsers(dest="path_b_action", required=True)
    start = actions.add_parser("start", help="start one durable commitment Workflow")
    start.add_argument("id")
    start.add_argument("--name", required=True)
    start.add_argument("--current", required=True)
    start.add_argument("--desired", required=True)
    start.add_argument("--proof", required=True)
    start.add_argument("--next-action", required=True)
    start.add_argument("--level", default="Task", choices=["Project", "Milestone", "Task"])
    start.add_argument("--parent")
    start.add_argument("--owner", default="user")
    start.add_argument("--priority", type=int, default=0)
    start.add_argument("--risk", default="Low", choices=["Low", "Medium", "High"])
    start.add_argument("--fallback")
    start.add_argument("--repeat-rule")

    command = actions.add_parser("command", help="send a guarded durable command")
    command.add_argument("id")
    command.add_argument("action", choices=[
        "define", "update", "ready", "schedule", "unschedule", "activate",
        "complete", "pause", "block", "unblock", "verify", "done",
        "cancel", "external",
    ])
    command.add_argument("--request-id")
    command.add_argument(
        "--data", default="{}",
        help="JSON object containing command fields",
    )

    show = actions.add_parser("show", help="query authoritative Workflow state")
    show.add_argument("id")
    actions.add_parser("health", help="check the Temporal frontend")
    actions.add_parser("install-schedules", help="install durable review schedules")
    actions.add_parser("rebuild", help="rebuild commitment projections from Temporal")
    backup = actions.add_parser("backup", help="back up Temporal and query databases")
    backup.add_argument("--output", required=True)
    questions = actions.add_parser("questions", help="answer the nine PES questions")
    questions.add_argument("id")


async def _run(args) -> None:
    if args.path_b_action == "start":
        state = CommitmentState(
            card_id=args.id,
            name=args.name,
            level=args.level,
            parent_id=args.parent,
            current_state_desc=args.current,
            desired_state_desc=args.desired,
            proof_of_completion=args.proof,
            next_physical_action=args.next_action,
            owner=args.owner,
            priority=args.priority,
            risk_level=args.risk,
            fallback_action=args.fallback,
            repeat_rule=args.repeat_rule,
        )
        handle = await start_commitment(state)
        print(f"accepted workflow start: {handle.id}")
        return
    if args.path_b_action == "command":
        data = json.loads(args.data)
        if not isinstance(data, dict):
            raise ValueError("--data must be a JSON object")
        result = await send_command(
            args.id, args.action, data, request_id=args.request_id
        )
        if not result.accepted:
            raise ValueError(result.reason)
        print(
            f"accepted request {result.request_id}: "
            f"{result.state} version {result.version}"
        )
        return
    if args.path_b_action == "show":
        print(json.dumps((await query_card(args.id)).as_dict(), indent=2))
        return
    if args.path_b_action == "health":
        await health()
        print("Temporal health: SERVING")
        return
    if args.path_b_action == "install-schedules":
        for result in await ensure_review_schedules():
            print(result)
        return
    if args.path_b_action == "rebuild":
        results = await rebuild_commitment_projections()
        for card_id, result in results.items():
            print(f"{card_id}: {result}")
        return
    if args.path_b_action == "backup":
        print(backup_runtime(args.output))
        return
    if args.path_b_action == "questions":
        print(json.dumps(await nine_questions(args.id), indent=2))


def handle(args) -> None:
    asyncio.run(_run(args))
