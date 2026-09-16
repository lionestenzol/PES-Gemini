import asyncio
import copy
import datetime
from dataclasses import replace

from temporalio import workflow
from temporalio.common import RetryPolicy

with workflow.unsafe.imports_passed_through():
    from pes.temporal import activities
    from pes.temporal.models import (
        Command, CommandResult, CommitmentState, ProjectionEvent,
        VALID_TRANSITIONS, WorkflowOutput,
    )


ACTIVITY_TIMEOUT = datetime.timedelta(seconds=20)
RETRY_POLICY = RetryPolicy(
    initial_interval=datetime.timedelta(seconds=1),
    backoff_coefficient=2,
    maximum_interval=datetime.timedelta(seconds=10),
    maximum_attempts=5,
)
TERMINAL = {"Done", "Canceled"}


@workflow.defn(name="pes.commitment")
class CommitmentWorkflow:
    def __init__(self) -> None:
        self.state: CommitmentState | None = None
        self._commands: list[Command] = []
        self._results: dict[str, CommandResult] = {}
        self._pending_ids: set[str] = set()
        self._timer_generation = 0

    @workflow.run
    async def run(self, initial: CommitmentState) -> WorkflowOutput:
        if initial.state != "Captured":
            raise ValueError("a new commitment workflow must start Captured")
        self.state = initial
        await self._project("workflow-start", None, "start")
        while self.state.state not in TERMINAL:
            timeout = self._review_timeout()
            try:
                await workflow.wait_condition(lambda: bool(self._commands), timeout=timeout)
            except asyncio.TimeoutError:
                await self._review_timer_fired()
                continue
            command = self._commands.pop(0)
            self._pending_ids.discard(command.request_id)
            await self._handle(command)
        return WorkflowOutput(
            final_state=self.state.state,
            result=self.state.result,
            proof_location=self.state.proof_location,
            version=self.state.version,
        )

    @workflow.signal(name="command")
    def command(self, command: Command) -> None:
        if command.request_id in self._results or command.request_id in self._pending_ids:
            return
        self._pending_ids.add(command.request_id)
        self._commands.append(command)

    @workflow.query(name="card")
    def card(self) -> CommitmentState:
        return self.state

    @workflow.query(name="current_state")
    def current_state(self) -> str:
        return self.state.state

    @workflow.query(name="plan")
    def plan(self) -> dict:
        return {
            "planned_date": self.state.planned_date,
            "planned_start": self.state.planned_start,
            "planned_end": self.state.planned_end,
            "planned_duration": self.state.planned_duration,
            "schedule_status": self.state.schedule_status,
        }

    @workflow.query(name="execution")
    def execution(self) -> dict:
        return {
            "actual_start": self.state.actual_start,
            "actual_end": self.state.actual_end,
            "result": self.state.result,
            "what_happened": self.state.what_happened,
        }

    @workflow.query(name="block")
    def block(self) -> dict:
        return {
            "block_reason": self.state.block_reason,
            "waiting_for": self.state.waiting_for,
            "review_date": self.state.review_date,
            "fallback_action": self.state.fallback_action,
        }

    @workflow.query(name="proof")
    def proof(self) -> dict:
        return {
            "proof_of_completion": self.state.proof_of_completion,
            "proof_location": self.state.proof_location,
            "desired_result_made": self.state.desired_result_made,
            "proof_exists": self.state.proof_exists,
            "proof_stored": self.state.proof_stored,
            "required_action_remains": self.state.required_action_remains,
        }

    @workflow.query(name="next_action")
    def next_action(self) -> str:
        return self.state.next_physical_action

    @workflow.query(name="command_result")
    def command_result(self, request_id: str) -> CommandResult | None:
        return self._results.get(request_id)

    async def _handle(self, command: Command) -> None:
        old_state = self.state.state
        snapshot = copy.deepcopy(self.state)
        try:
            await self._apply(command)
            self.state.version += 1
            self.state.last_event = command.request_id
            await self._project(command.request_id, old_state, command.action)
            self._results[command.request_id] = CommandResult(
                command.request_id, True, self.state.state, version=self.state.version
            )
        except Exception as exc:
            self.state = snapshot
            self._results[command.request_id] = CommandResult(
                command.request_id, False, self.state.state, reason=str(exc),
                version=self.state.version,
            )

    async def _apply(self, command: Command) -> None:
        action = command.action
        data = command.data
        if action in {"define", "update"}:
            allowed = {
                "name", "level", "parent_id", "current_state_desc",
                "desired_state_desc", "proof_of_completion",
                "next_physical_action", "repeat_rule", "owner", "priority",
                "risk_level", "fallback_action", "review_date",
                "fallback_at",
            }
            if "review_date" in data and data["review_date"]:
                datetime.date.fromisoformat(data["review_date"])
            if "fallback_at" in data and data["fallback_at"]:
                datetime.datetime.fromisoformat(data["fallback_at"])
            timer_changed = self.state.state == "Blocked" and bool(
                {"review_date", "fallback_at"} & data.keys()
            )
            for key, value in data.items():
                if key not in allowed:
                    raise ValueError(f"field cannot be updated: {key}")
                setattr(self.state, key, value)
            if timer_changed:
                self._timer_generation += 1
            return
        if action == "schedule":
            self._require_move("Scheduled")
            self.state.planned_date = self._required(data, "planned_date")
            self.state.planned_duration = int(self._required(data, "planned_duration"))
            if self.state.planned_duration <= 0:
                raise ValueError("planned_duration must be positive")
            self.state.planned_start = data.get("planned_start")
            self.state.planned_end = data.get("planned_end")
            if not self.state.proof_of_completion.strip():
                raise ValueError("Schedule gate failed: proof rule is required")
            await self._activity(activities.reserve_capacity, self.state)
            self.state.state = "Scheduled"
            self.state.schedule_status = "scheduled"
            return
        if action == "unschedule":
            self._require_move("Ready")
            await self._activity(activities.release_capacity, self.state.card_id)
            self.state.state = "Ready"
            self.state.schedule_status = "unscheduled"
            self.state.planned_date = self.state.planned_start = self.state.planned_end = None
            self.state.planned_duration = None
            return
        if action == "activate":
            self._require_move("Active")
            await self._activity(activities.acquire_active, self.state.card_id)
            self.state.actual_start = workflow.now().isoformat()
            self.state.state = "Active"
            return
        if action == "complete":
            self._require_move("Completed")
            self.state.result = self._required(data, "result")
            self.state.proof_location = self._required(data, "proof_location")
            self.state.what_happened = data.get("what_happened") or self.state.result
            self.state.actual_end = workflow.now().isoformat()
            await self._activity(activities.release_active, self.state.card_id)
            await self._activity(activities.release_capacity, self.state.card_id)
            self.state.state = "Completed"
            self.state.schedule_status = "unscheduled"
            return
        if action == "pause":
            self._require_move("Paused")
            self.state.what_happened = self._required(data, "what_happened")
            self.state.next_physical_action = self._required(data, "next_physical_action")
            self.state.actual_end = workflow.now().isoformat()
            await self._activity(activities.release_active, self.state.card_id)
            self.state.state = "Paused"
            return
        if action == "block":
            self._require_move("Blocked")
            self.state.block_reason = self._required(data, "block_reason")
            self.state.waiting_for = self._required(data, "waiting_for")
            self.state.review_date = self._required(data, "review_date")
            datetime.date.fromisoformat(self.state.review_date)
            fallback = data.get("fallback_action") or self.state.fallback_action
            if (self.state.priority >= 80 or self.state.risk_level == "High") and not fallback:
                raise ValueError("fallback_action required for high-priority or high-risk blocked work")
            self.state.fallback_action = fallback
            self.state.fallback_at = data.get("fallback_at") or self.state.fallback_at
            if self.state.fallback_at:
                datetime.datetime.fromisoformat(self.state.fallback_at)
            self.state.actual_end = workflow.now().isoformat()
            await self._activity(activities.release_active, self.state.card_id)
            self.state.state = "Blocked"
            self._timer_generation += 1
            return
        if action == "unblock":
            self._require_move("Ready")
            self._ready_guard()
            self.state.state = "Ready"
            self.state.schedule_status = "unscheduled"
            self.state.block_reason = self.state.waiting_for = self.state.review_date = None
            self.state.fallback_at = None
            self._timer_generation += 1
            return
        if action == "verify":
            self._require_move("Verified")
            for key in ("desired_result_made", "proof_exists", "proof_stored",
                        "required_action_remains"):
                if key in data:
                    setattr(self.state, key, bool(data[key]))
            if not (
                self.state.result and self.state.proof_location
                and self.state.desired_result_made and self.state.proof_exists
                and self.state.proof_stored and not self.state.required_action_remains
            ):
                raise ValueError("Verify gate requires result, proof, yes, yes, yes, and no")
            await self._activity(activities.store_proof, self.state)
            self.state.state = "Verified"
            return
        if action == "done":
            self._require_move("Done")
            self.state.state = "Done"
            return
        if action == "cancel":
            self._require_move("Canceled")
            if self.state.state == "Active":
                await self._activity(activities.release_active, self.state.card_id)
            await self._activity(activities.release_capacity, self.state.card_id)
            self.state.state = "Canceled"
            self.state.schedule_status = "unscheduled"
            return
        if action == "ready":
            self._require_move("Ready")
            self._ready_guard()
            self.state.state = "Ready"
            return
        if action == "external":
            key = self._required(data, "action_key")
            self.state.what_happened = await self._activity(activities.external_action, key)
            return
        raise ValueError(f"unknown command: {action}")

    def _ready_guard(self) -> None:
        for field in (
            "current_state_desc", "desired_state_desc",
            "proof_of_completion", "next_physical_action",
        ):
            if not str(getattr(self.state, field) or "").strip():
                raise ValueError(f"Ready gate failed: {field} is empty")
        if (self.state.priority >= 80 or self.state.risk_level == "High") and not self.state.fallback_action:
            raise ValueError("Ready gate failed: fallback_action is required")

    def _require_move(self, target: str) -> None:
        if target not in VALID_TRANSITIONS[self.state.state]:
            raise ValueError(f"invalid transition {self.state.state} -> {target}")

    @staticmethod
    def _required(data: dict, key: str):
        value = data.get(key)
        if value is None or (isinstance(value, str) and not value.strip()):
            raise ValueError(f"{key} is required")
        return value

    async def _activity(self, fn, arg):
        return await workflow.execute_activity(
            fn, arg, start_to_close_timeout=ACTIVITY_TIMEOUT,
            retry_policy=RETRY_POLICY,
        )

    async def _project(self, event_id: str, old_state: str | None, action: str) -> None:
        durable_event_id = f"{workflow.info().workflow_id}:{event_id}"
        await self._activity(
            activities.project_event,
            ProjectionEvent(
                event_id=durable_event_id,
                workflow_id=workflow.info().workflow_id,
                version=self.state.version,
                state=replace(self.state),
                state_from=old_state,
                action=action,
            ),
        )

    def _review_timeout(self) -> float | None:
        if self.state.state != "Blocked":
            return None
        timers = []
        review_marker = f"blocked-review:{self._timer_generation}:{self.state.review_date}"
        if self.state.review_date and review_marker not in self.state.review_events:
            review_day = datetime.date.fromisoformat(self.state.review_date)
            timers.append(datetime.datetime.combine(
                review_day, datetime.time.min, tzinfo=datetime.timezone.utc
            ))
        fallback_marker = f"fallback:{self._timer_generation}:{self.state.fallback_at}"
        if (
            self.state.fallback_action and self.state.fallback_at
            and fallback_marker not in self.state.review_events
        ):
            fallback_at = datetime.datetime.fromisoformat(self.state.fallback_at)
            if fallback_at.tzinfo is None:
                fallback_at = fallback_at.replace(tzinfo=datetime.timezone.utc)
            timers.append(fallback_at)
        if not timers:
            return None
        return max(0.0, (min(timers) - workflow.now()).total_seconds())

    async def _review_timer_fired(self) -> None:
        now = workflow.now()
        events = []
        review_marker = f"blocked-review:{self._timer_generation}:{self.state.review_date}"
        if self.state.review_date and review_marker not in self.state.review_events:
            review_day = datetime.date.fromisoformat(self.state.review_date)
            review_at = datetime.datetime.combine(
                review_day, datetime.time.min, tzinfo=datetime.timezone.utc
            )
            if review_at <= now:
                events.append((review_marker, "blocked-review"))
        fallback_marker = f"fallback:{self._timer_generation}:{self.state.fallback_at}"
        if (
            self.state.fallback_action and self.state.fallback_at
            and fallback_marker not in self.state.review_events
        ):
            fallback_at = datetime.datetime.fromisoformat(self.state.fallback_at)
            if fallback_at.tzinfo is None:
                fallback_at = fallback_at.replace(tzinfo=datetime.timezone.utc)
            if fallback_at <= now:
                self.state.what_happened = await self._activity(
                    activities.external_action,
                    f"{self.state.card_id}:fallback:{self._timer_generation}",
                )
                events.append((fallback_marker, "fallback"))
        for marker, action in events:
            self.state.review_events.append(marker)
            self.state.version += 1
            self.state.last_event = marker
            await self._project(marker, self.state.state, action)
