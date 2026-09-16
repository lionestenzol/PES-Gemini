import asyncio
import sys
from concurrent.futures import ThreadPoolExecutor

from temporalio.client import Client
from temporalio.worker import Worker

from pes.temporal import activities
from pes.temporal.settings import (
    temporal_address, temporal_namespace, temporal_task_queue,
)
from pes.temporal.workflow import CommitmentWorkflow
from pes.temporal.review_workflow import ReviewWorkflow
from pes.temporal.repeat_workflow import RepeatSeriesWorkflow


ACTIVITIES = [
    activities.project_event,
    activities.reserve_capacity,
    activities.release_capacity,
    activities.acquire_active,
    activities.release_active,
    activities.store_proof,
    activities.external_action,
    activities.run_review,
]


async def run_worker() -> None:
    try:
        client = await Client.connect(
            temporal_address(), namespace=temporal_namespace()
        )
    except Exception as exc:
        raise RuntimeError(
            f"cannot connect to Temporal at {temporal_address()} "
            f"in namespace {temporal_namespace()}: {exc}"
        ) from exc
    with ThreadPoolExecutor(max_workers=8) as executor:
        worker = Worker(
            client,
            task_queue=temporal_task_queue(),
            workflows=[CommitmentWorkflow, ReviewWorkflow, RepeatSeriesWorkflow],
            activities=ACTIVITIES,
            activity_executor=executor,
            identity="pes-worker-1.0.0",
        )
        print(
            f"PES worker 1.0.0 listening on {temporal_task_queue()} "
            f"in {temporal_namespace()}"
        )
        await worker.run()


def main() -> None:
    try:
        asyncio.run(run_worker())
    except KeyboardInterrupt:
        return
    except Exception as exc:
        print(f"Worker start failed: {exc}", file=sys.stderr)
        raise SystemExit(1)


if __name__ == "__main__":
    main()
