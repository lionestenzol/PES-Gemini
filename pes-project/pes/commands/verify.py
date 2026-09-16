from pes.database import get_db
from pes.engine.state_machine import move_card
import datetime

def handle(args):
    conn = get_db()
    card = conn.execute("SELECT * FROM commitments WHERE id = ?", (args.id,)).fetchone()
    if not card:
        print("Card not found.")
        conn.close()
        return

    if card['state'] != 'Completed':
        print("Card must be in Completed state to verify.")
        conn.close()
        return

    print("Completion Gate Questions (answer yes/no):")
    ans1 = input("1. Was the desired result made? ")
    ans2 = input("2. Does the required proof exist? ")
    ans3 = input("3. Was the proof stored in the stated location? ")
    ans4 = input("4. Does another required action remain? ")

    desired_made = 1 if ans1.strip().lower() == 'yes' else 0
    proof_exist = 1 if ans2.strip().lower() == 'yes' else 0
    proof_stored = 1 if ans3.strip().lower() == 'yes' else 0
    action_remains = 1 if ans4.strip().lower() == 'yes' else 0

    conn.execute("""
        UPDATE commitments SET
            desired_result_made = ?,
            proof_exists = ?,
            proof_stored = ?,
            required_action_remains = ?,
            updated_at = ?
        WHERE id = ?
    """, (desired_made, proof_exist, proof_stored, action_remains,
          datetime.datetime.now().isoformat(), args.id))
    conn.commit()
    conn.close()

    if desired_made and proof_exist and proof_stored and not action_remains:
        try:
            move_card(args.id, 'Verified')
            print(f"Card {args.id} Verified.")
        except Exception as e:
            print(f"Error: {e}")
    else:
        print("Verification failed: all first three must be 'yes' and the last must be 'no'.")

def handle_done(args):
    try:
        move_card(args.id, 'Done')
        print(f"Card {args.id} Done.")
    except Exception as e:
        print(f"Error: {e}")
