from temporalio.client import Client

from pes.database import get_db
from pes.temporal.client import connect, query_card


async def nine_questions(
    card_id: str, client: Client | None = None,
) -> dict[str, object]:
    client = client or await connect()
    card = await query_card(card_id, client)
    conn = get_db()
    try:
        dependencies = [
            row["from_id"] for row in conn.execute(
                "SELECT from_id FROM links WHERE to_id=? "
                "AND link_type IN ('blocks','requires')",
                (card_id,),
            )
        ]
    finally:
        conn.close()
    return {
        "what_exists_now": card.current_state_desc,
        "required_result": card.desired_state_desc,
        "work_that_must_occur": card.next_physical_action,
        "work_that_must_occur_first": dependencies,
        "when_work_will_occur": {
            "date": card.planned_date,
            "start": card.planned_start,
            "duration": card.planned_duration,
        },
        "what_is_active_now": card.card_id if card.state == "Active" else None,
        "required_result_made": card.desired_result_made,
        "proof_location": card.proof_location,
        "what_must_change_next": (
            "verify proof" if card.state == "Completed"
            else card.next_physical_action
        ),
    }
