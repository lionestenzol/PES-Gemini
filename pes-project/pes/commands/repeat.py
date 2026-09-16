import datetime
import re
from pes.database import get_db
from pes.engine.graph_engine import add_link


def materialize(card_id):
    conn = get_db()
    try:
        card = conn.execute("SELECT * FROM commitments WHERE id=?", (card_id,)).fetchone()
        if not card or card["state"] not in ("Verified", "Done"):
            raise ValueError("repeat source must be Verified or Done")
        if not card["repeat_rule"]:
            raise ValueError("repeat_rule is not set")
        base = re.sub(r"-R\d+$", "", card_id)
        count = conn.execute("SELECT COUNT(*) FROM commitments WHERE id LIKE ?", (base + "-R%",)).fetchone()[0]
        new_id = f"{base}-R{count + 1}"
        now = datetime.datetime.now().isoformat()
        conn.execute(
            """INSERT INTO commitments
               (id, level, name, parent_id, current_state_desc, desired_state_desc,
                proof_of_completion, next_physical_action, state, repeat_rule, owner,
                priority, risk_level, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Captured', ?, ?, ?, ?, ?, ?)""",
            (new_id, card["level"], card["name"], card["parent_id"], card["current_state_desc"],
             card["desired_state_desc"], card["proof_of_completion"], card["next_physical_action"],
             card["repeat_rule"], card["owner"], card["priority"], card["risk_level"], now, now),
        )
        add_link(conn, card_id, new_id, "helps")
        conn.commit()
        return new_id
    finally:
        conn.close()


def handle(args):
    new_id = materialize(args.id)
    print(f"Created repeat card {new_id}.")
