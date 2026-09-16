"""Deployment and instance commands for Camunda 8 SaaS."""

from pathlib import Path

from pes.camunda import PROCESS_ID


RESOURCE_DIR = Path(__file__).with_name("resources")


def resource_files() -> list[Path]:
    return [
        RESOURCE_DIR / "pes-completion-gate.dmn",
        *(sorted((RESOURCE_DIR / "forms").glob("*.form"))),
        RESOURCE_DIR / "pes-review.bpmn",
        RESOURCE_DIR / "pes-repeat-series.bpmn",
        RESOURCE_DIR / "pes-commitment.bpmn",
    ]


def _sdk():
    try:
        from camunda_orchestration_sdk import CamundaClient
    except ImportError as exc:
        raise RuntimeError("install Path C support with: python -m pip install -e .[path-c]") from exc
    return CamundaClient


def deploy() -> dict:
    client_type = _sdk()
    with client_type() as client:
        result = client.deploy_resources_from_files(resource_files())
        return {
            "deployment_key": str(result.deployment_key),
            "processes": [
                {"id": item.process_definition_id,
                 "version": item.process_definition_version,
                 "key": str(item.process_definition_key)}
                for item in result.processes
            ],
            "decisions": [
                {"id": item.decision_definition_id,
                 "version": item.version,
                 "key": str(item.decision_definition_key)}
                for item in result.decisions
            ],
        }


def health() -> str:
    client_type = _sdk()
    with client_type() as client:
        topology = client.get_topology()
        return str(topology)


def start(variables: dict) -> str:
    from camunda_orchestration_sdk import (
        BusinessId, CamundaClient, ProcessCreationById,
        ProcessDefinitionId, ProcessInstanceCreationInstructionByIdVariables,
    )
    with CamundaClient() as client:
        result = client.create_process_instance(
            data=ProcessCreationById(
                process_definition_id=ProcessDefinitionId(PROCESS_ID),
                variables=ProcessInstanceCreationInstructionByIdVariables.from_dict(variables),
                business_id=BusinessId(str(variables["card_id"])),
            )
        )
        return str(result.process_instance_key)
