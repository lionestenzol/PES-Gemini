from dataclasses import asdict, dataclass, field
from typing import Any


STATES = (
    "Captured", "Ready", "Scheduled", "Active", "Completed",
    "Verified", "Done", "Paused", "Blocked", "Canceled",
)

VALID_TRANSITIONS = {
    "Captured": ("Ready", "Canceled"),
    "Ready": ("Scheduled", "Captured", "Canceled"),
    "Scheduled": ("Active", "Ready", "Canceled"),
    "Active": ("Completed", "Paused", "Blocked", "Canceled"),
    "Completed": ("Verified", "Active", "Ready", "Canceled"),
    "Verified": ("Done", "Completed", "Canceled"),
    "Paused": ("Active", "Canceled"),
    "Blocked": ("Ready", "Canceled"),
    "Done": (),
    "Canceled": (),
}


@dataclass
class CommitmentState:
    card_id: str
    name: str
    level: str = "Task"
    parent_id: str | None = None
    current_state_desc: str = ""
    desired_state_desc: str = ""
    proof_of_completion: str = ""
    next_physical_action: str = ""
    state: str = "Captured"
    schedule_status: str = "unscheduled"
    planned_date: str | None = None
    planned_start: str | None = None
    planned_end: str | None = None
    planned_duration: int | None = None
    actual_start: str | None = None
    actual_end: str | None = None
    result: str | None = None
    proof_location: str | None = None
    what_happened: str | None = None
    block_reason: str | None = None
    waiting_for: str | None = None
    review_date: str | None = None
    fallback_action: str | None = None
    fallback_at: str | None = None
    repeat_rule: str | None = None
    owner: str = "user"
    priority: int = 0
    risk_level: str = "Low"
    desired_result_made: bool = False
    proof_exists: bool = False
    proof_stored: bool = False
    required_action_remains: bool = True
    version: int = 0
    last_event: str | None = None
    review_events: list[str] = field(default_factory=list)

    def as_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass
class Command:
    request_id: str
    action: str
    data: dict[str, Any] = field(default_factory=dict)


@dataclass
class CommandResult:
    request_id: str
    accepted: bool
    state: str
    reason: str = ""
    version: int = 0


@dataclass
class ProjectionEvent:
    event_id: str
    workflow_id: str
    version: int
    state: CommitmentState
    state_from: str | None
    action: str
    accepted: bool = True
    reason: str = ""


@dataclass
class WorkflowOutput:
    final_state: str
    result: str | None
    proof_location: str | None
    version: int


@dataclass
class ReviewRequest:
    review_type: str
    mode: str | None = None
    must_happen: str | None = None
    run_key: str | None = None


@dataclass
class ReviewResult:
    review_type: str
    run_key: str
    summary: str
    changes_made: int


@dataclass
class RepeatSeries:
    series_id: str
    template: CommitmentState
    interval_seconds: int
    start_at: str | None = None
    next_cycle: int = 1
    cycle_ids: list[str] = field(default_factory=list)
