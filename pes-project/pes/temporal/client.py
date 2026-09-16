import asyncio
import datetime
import uuid

from temporalio.client import (
    Client, Schedule, ScheduleActionStartWorkflow, ScheduleAlreadyRunningError,
    ScheduleIntervalSpec, ScheduleSpec,
)

from pes.temporal import workflow_id
from pes.temporal.models import Command, CommandResult, CommitmentState
from pes.temporal.settings import (
    temporal_address, temporal_namespace, temporal_task_queue,
)
from pes.temporal.workflow import CommitmentWorkflow
from pes.temporal.review_workflow import ReviewWorkflow
from pes.temporal.models import ReviewRequest


async def connect() -> Client:
    return await Client.connect(
        temporal_address(), namespace=temporal_namespace()
    )


async def start_commitment(state: CommitmentState, client: Client | None = None):
    client = client or await connect()
    return await client.start_workflow(
        CommitmentWorkflow.run,
        state,
        id=workflow_id(state.card_id),
        task_queue=temporal_task_queue(),
    )


async def send_command(
    card_id: str,
    action: str,
    data: dict | None = None,
    request_id: str | None = None,
    client: Client | None = None,
    wait_seconds: float = 20,
) -> CommandResult:
    client = client or await connect()
    handle = client.get_workflow_handle(workflow_id(card_id))
    command = Command(request_id or str(uuid.uuid4()), action, data or {})
    await handle.signal(CommitmentWorkflow.command, command)
    deadline = asyncio.get_running_loop().time() + wait_seconds
    while asyncio.get_running_loop().time() < deadline:
        result = await handle.query(CommitmentWorkflow.command_result, command.request_id)
        if result:
            return result
        await asyncio.sleep(0.1)
    raise TimeoutError(f"command {command.request_id} was not processed in {wait_seconds}s")


async def query_card(card_id: str, client: Client | None = None) -> CommitmentState:
    client = client or await connect()
    return await client.get_workflow_handle(workflow_id(card_id)).query(
        CommitmentWorkflow.card
    )


async def health(client: Client | None = None) -> bool:
    client = client or await connect()
    return await client.service_client.check_health()


async def ensure_review_schedules(client: Client | None = None) -> list[str]:
    client = client or await connect()
    definitions = (
        ("pes-review-end-of-day", datetime.timedelta(days=1),
         ReviewRequest("end-of-day", mode="Full",
                       must_happen="Review the Ready queue")),
        ("pes-review-weekly", datetime.timedelta(days=7),
         ReviewRequest("weekly")),
    )
    results = []
    for schedule_id, interval, request in definitions:
        try:
            await client.create_schedule(
                schedule_id,
                Schedule(
                    action=ScheduleActionStartWorkflow(
                        ReviewWorkflow.run,
                        request,
                        id=schedule_id,
                        task_queue=temporal_task_queue(),
                    ),
                    spec=ScheduleSpec(
                        intervals=[ScheduleIntervalSpec(every=interval)]
                    ),
                ),
            )
            results.append(f"created:{schedule_id}")
        except ScheduleAlreadyRunningError:
            results.append(f"exists:{schedule_id}")
    return results
