VALID_LINK_TYPES = {"blocks", "helps", "produces", "requires", "excludes"}


def add_link(conn, from_id, to_id, link_type):
    if link_type not in VALID_LINK_TYPES:
        raise ValueError(f"invalid link type {link_type}")
    if from_id == to_id:
        raise ValueError("a card cannot link to itself")
    for card_id in (from_id, to_id):
        if not conn.execute("SELECT 1 FROM commitments WHERE id=?", (card_id,)).fetchone():
            raise ValueError(f"Card {card_id} not found")
    conn.execute(
        "INSERT INTO links (from_id, to_id, link_type) VALUES (?, ?, ?)",
        (from_id, to_id, link_type),
    )


def remove_link(conn, from_id, to_id, link_type):
    result = conn.execute(
        "DELETE FROM links WHERE from_id=? AND to_id=? AND link_type=?",
        (from_id, to_id, link_type),
    )
    if result.rowcount == 0:
        raise ValueError("link not found")


def get_direct_blockers(conn, card_id):
    rows = conn.execute(
        "SELECT from_id FROM links WHERE to_id=? AND link_type IN ('blocks','requires')",
        (card_id,),
    ).fetchall()
    return [r["from_id"] for r in rows]


def outcome_map(conn, root_id):
    root = conn.execute("SELECT * FROM commitments WHERE id=?", (root_id,)).fetchone()
    if not root:
        raise ValueError(f"Card {root_id} not found")
    rows = conn.execute(
        """WITH RECURSIVE tree(id, depth) AS (
             SELECT id, 0 FROM commitments WHERE id=?
             UNION ALL
             SELECT c.id, tree.depth + 1 FROM commitments c JOIN tree ON c.parent_id=tree.id
           )
           SELECT c.*, tree.depth FROM tree JOIN commitments c ON c.id=tree.id
           ORDER BY tree.depth, c.created_at""",
        (root_id,),
    ).fetchall()
    ids = [r["id"] for r in rows]
    placeholders = ",".join("?" for _ in ids)
    links = conn.execute(
        f"SELECT * FROM links WHERE from_id IN ({placeholders}) OR to_id IN ({placeholders})",
        ids + ids,
    ).fetchall() if ids else []
    return [dict(r) for r in rows], [dict(r) for r in links]
