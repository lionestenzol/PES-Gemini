import uuid

from temporalio.client import Client

from pes.temporal import activities, workflow_id
from pes.temporal.client import connect
from pes.temporal.models import ProjectionEvent
from pes.temporal.workflow import CommitmentWorkflow


async def rebuild_commitment_projections(
    client: Client | None = None,
    card_ids: list[str] | None = None,
) -> dict[str, str]:
    client = client or await connect()
    results: dict[str, str] = {}
    executions = []
    if card_ids:
        executions = [
            (workflow_id(card_id), None) for card_id in card_ids
        ]
    else:
        async for execution in client.list_workflows(
            'WorkflowType="pes.commitment"'
        ):
            executions.append((execution.id, execution.run_id))
    for execution_id, run_id in executions:
        try:
            state = await client.get_workflow_handle(
                execution_id, run_id=run_id
            ).query(CommitmentWorkflow.card)
            result = activities.project_event(ProjectionEvent(
                event_id=f"{execution_id}:rebuild:{state.version}:{uuid.uuid4()}",
                workflow_id=execution_id,
                version=state.version,
                state=state,
                state_from=state.state,
                action="projection-rebuild",
            ))
            results[state.card_id] = result
        except Exception as exc:
            results[execution_id] = f"error:{exc}"
    return results
