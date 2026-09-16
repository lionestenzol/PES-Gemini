from pes.database import get_db


def handle(args):
    conn = get_db()
    try:
        if args.proof_action == "list":
            rows = conn.execute("SELECT * FROM proof_index ORDER BY verified_at DESC").fetchall()
        else:
            rows = conn.execute("SELECT * FROM proof_index WHERE card_id=?", (args.card_id,)).fetchall()
        if not rows:
            print("No proof found.")
        for row in rows:
            print(f"{row['card_id']}: {row['result']} | {row['proof_location']} | verified {row['verified_at']}")
    finally:
        conn.close()
