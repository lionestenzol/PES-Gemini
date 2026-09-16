"""Temporal-backed Path B runtime for PES."""

NAMESPACE = "pes"
TASK_QUEUE = "pes-commitments"
WORKFLOW_ID_PREFIX = "pes/commitment/"


def workflow_id(card_id: str) -> str:
    return f"{WORKFLOW_ID_PREFIX}{card_id}"
