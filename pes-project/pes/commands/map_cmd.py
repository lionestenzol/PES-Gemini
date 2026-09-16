from pes.database import get_db
from pes.engine.graph_engine import add_link, remove_link, outcome_map


def handle(args):
    conn = get_db()
    try:
        if args.map_action == "add":
            add_link(conn, args.from_id, args.to, args.type)
            conn.commit()
            print(f"Link {args.from_id} --{args.type}--> {args.to} added.")
        elif args.map_action == "remove":
            remove_link(conn, args.from_id, args.to, args.type)
            conn.commit()
            print("Link removed.")
        elif args.map_action == "show":
            cards, links = outcome_map(conn, args.outcome_id)
            for card in cards:
                print(f"{'  ' * card['depth']}{card['id']} [{card['state']}] {card['name']}")
            for link in links:
                print(f"  {link['from_id']} --{link['link_type']}--> {link['to_id']}")
    finally:
        conn.close()
