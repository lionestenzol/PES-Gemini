"""Official Camunda 8.9 Python SDK workers for Path C."""

import asyncio

from pes.camunda import services


def _identity(context):
    return str(context.job_key), str(context.process_instance_key), context.variables.to_dict()


def ready_handler(context):
    return services.check_ready(*_identity(context))


def schedule_handler(context):
    return services.reserve_schedule(*_identity(context))


def acquire_handler(context):
    return services.acquire_active(*_identity(context))


def release_handler(context):
    return services.release_active(*_identity(context))


def project_handler(context):
    return services.project_state(*_identity(context))


def proof_handler(context):
    return services.store_proof(*_identity(context))


def audit_task_handler(context):
    from camunda_orchestration_sdk import JobCompletionRequest, JobResultUserTask
    assignee = context.user_task.assignee if context.user_task else None
    allowed, reason = services.authorize_user(assignee)
    if not allowed:
        return JobCompletionRequest(
            result=JobResultUserTask(
                type_="userTask", denied=True, denied_reason=reason,
            )
        )
    data = context.variables.to_dict()
    data.update({
        "actor_id": assignee,
        "element_id": str(context.element_id),
        "listener_event_type": str(context.listener_event_type),
    })
    services.audit_user_task(
        str(context.job_key), str(context.process_instance_key), data,
    )
    # Camunda 8.9 rejects variables on task-listener job completion. The
    # authoritative assignee is persisted above in PES's audit record.
    return JobCompletionRequest(
        result=JobResultUserTask(type_="userTask", denied=False),
    )


def repeat_cycle_handler(context):
    return services.create_repeat_cycle(*_identity(context))


def review_handler(context):
    return services.record_review(*_identity(context))


async def run() -> None:
    try:
        from camunda_orchestration_sdk import CamundaAsyncClient, WorkerConfig
    except ImportError as exc:
        raise RuntimeError("install Path C support with: python -m pip install -e .[path-c]") from exc
    handlers = {
        "pes-ready-check": ready_handler,
        "pes-schedule-check": schedule_handler,
        "pes-acquire-active": acquire_handler,
        "pes-release-active": release_handler,
        "pes-project-state": project_handler,
        "pes-store-proof": proof_handler,
        "pes-audit-user-task": audit_task_handler,
        "pes-create-repeat-cycle": repeat_cycle_handler,
        "pes-record-review": review_handler,
    }
    async with CamundaAsyncClient() as client:
        for job_type, handler in handlers.items():
            client.create_job_worker(
                config=WorkerConfig(
                    job_type=job_type,
                    job_timeout_milliseconds=30_000,
                    max_concurrent_jobs=16,
                    worker_name="pes-path-c-worker",
                ),
                callback=handler,
                execution_strategy="thread",
            )
        print("PES Path C worker listening for: " + ", ".join(handlers))
        await client.run_workers()


def main() -> None:
    asyncio.run(run())


if __name__ == "__main__":
    main()
