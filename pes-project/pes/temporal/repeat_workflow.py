import dataclasses
import datetime

from temporalio import workflow
from temporalio.workflow import ParentClosePolicy

with workflow.unsafe.imports_passed_through():
    from pes.temporal import workflow_id
    from pes.temporal.models import RepeatSeries
    from pes.temporal.workflow import CommitmentWorkflow


@workflow.defn(name="pes.repeat-series")
class RepeatSeriesWorkflow:
    def __init__(self) -> None:
        self.series: RepeatSeries | None = None

    @workflow.run
    async def run(self, series: RepeatSeries) -> None:
        if series.interval_seconds <= 0:
            raise ValueError("repeat interval must be positive")
        rule = series.template.repeat_rule or ""
        if not all(part in rule for part in ("start=", "proof=", "review=")):
            raise ValueError("repeat rule requires start=, proof=, and review=")
        self.series = series
        if series.start_at:
            start_at = datetime.datetime.fromisoformat(series.start_at)
            if start_at.tzinfo is None:
                start_at = start_at.replace(tzinfo=datetime.timezone.utc)
            delay = (start_at - workflow.now()).total_seconds()
            if delay > 0:
                await workflow.sleep(delay)
        while True:
            cycle_id = f"{series.series_id}-R{series.next_cycle}"
            cycle = dataclasses.replace(
                series.template,
                card_id=cycle_id,
                name=f"{series.template.name} (cycle {series.next_cycle})",
                state="Captured",
                version=0,
                result=None,
                proof_location=None,
                actual_start=None,
                actual_end=None,
                last_event=None,
                review_events=[],
            )
            await workflow.start_child_workflow(
                CommitmentWorkflow.run,
                cycle,
                id=workflow_id(cycle_id),
                parent_close_policy=ParentClosePolicy.ABANDON,
            )
            series.cycle_ids.append(cycle_id)
            series.next_cycle += 1
            if len(series.cycle_ids) >= 50:
                workflow.continue_as_new(series)
            await workflow.sleep(series.interval_seconds)

    @workflow.query(name="series")
    def get_series(self) -> RepeatSeries:
        return self.series
