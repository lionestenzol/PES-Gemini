from pes.engine.state_machine import move_card
import datetime

def handle_start(args):
    try:
        move_card(args.id, 'Active', actual_start=datetime.datetime.now().isoformat())
        print(f"Started {args.id}")
    except Exception as e:
        print(f"Error: {e}")

def handle_stop(args):
    try:
        kwargs = {
            'actual_end': datetime.datetime.now().isoformat(),
            'result': args.result,
            'proof_location': args.proof_location,
            'note': args.note,
            'what_happened': args.note or args.result,
        }
        move_card(args.id, 'Completed', **kwargs)
        print(f"Stopped {args.id} -> Completed")
    except Exception as e:
        print(f"Error: {e}")

def handle_pause(args):
    try:
        kwargs = {
            'actual_end': datetime.datetime.now().isoformat(),
            'note': args.reason,
            'what_happened': args.reason,
            'next_physical_action': args.resume_action or 'resume',
        }
        move_card(args.id, 'Paused', **kwargs)
        print(f"Paused {args.id}")
    except Exception as e:
        print(f"Error: {e}")

def handle_block(args):
    try:
        kwargs = {
            'actual_end': datetime.datetime.now().isoformat(),
            'block_reason': args.reason,
            'waiting_for': args.waiting,
            'review_date': args.review,
            'fallback_action': args.fallback,
            'note': args.reason,
        }
        move_card(args.id, 'Blocked', **kwargs)
        print(f"Blocked {args.id}")
    except Exception as e:
        print(f"Error: {e}")
