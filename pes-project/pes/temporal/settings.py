import os

from pes.temporal import NAMESPACE, TASK_QUEUE


def temporal_address() -> str:
    return os.environ.get("PES_TEMPORAL_ADDRESS", "localhost:7233")


def temporal_namespace() -> str:
    return os.environ.get("PES_TEMPORAL_NAMESPACE", NAMESPACE)


def temporal_task_queue() -> str:
    return os.environ.get("PES_TEMPORAL_TASK_QUEUE", TASK_QUEUE)
