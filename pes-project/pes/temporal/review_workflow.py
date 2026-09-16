import datetime
from dataclasses import replace

from temporalio import workflow
from temporalio.common import RetryPolicy

with workflow.unsafe.imports_passed_through():
    from pes.temporal import activities
    from pes.temporal.models import ReviewRequest, ReviewResult


@workflow.defn(name="pes.review")
class ReviewWorkflow:
    @workflow.run
    async def run(self, request: ReviewRequest) -> ReviewResult:
        durable_request = replace(
            request,
            run_key=request.run_key or workflow.info().run_id,
        )
        return await workflow.execute_activity(
            activities.run_review,
            durable_request,
            start_to_close_timeout=datetime.timedelta(seconds=30),
            retry_policy=RetryPolicy(maximum_attempts=5),
        )
