import sqlite3
from pathlib import Path
import os

def get_db_path():
    return os.environ.get(
        "PES_DB_PATH",
        os.path.expanduser("~/.local/share/pes/pes.db"),
    )

DB_PATH = get_db_path()

def get_db():
    db_path = Path(DB_PATH).expanduser()
    db_path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(db_path))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn

def init_db():
    conn = get_db()
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS inbox (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp TEXT NOT NULL DEFAULT (datetime('now')),
            raw_text TEXT NOT NULL,
            mark TEXT NOT NULL DEFAULT '?',
            processed_at TEXT,
            process_action TEXT,
            card_id TEXT
        );

        CREATE TABLE IF NOT EXISTS commitments (
            id TEXT PRIMARY KEY,
            level TEXT NOT NULL DEFAULT 'Task',
            name TEXT NOT NULL,
            parent_id TEXT,
            current_state_desc TEXT,
            desired_state_desc TEXT,
            proof_of_completion TEXT,
            next_physical_action TEXT,
            state TEXT NOT NULL DEFAULT 'Captured',
            schedule_status TEXT NOT NULL DEFAULT 'unscheduled',
            planned_date TEXT,
            planned_start TEXT,
            planned_end TEXT,
            planned_duration INTEGER,
            actual_start TEXT,
            actual_end TEXT,
            result TEXT,
            proof_location TEXT,
            what_happened TEXT,
            review_date TEXT,
            repeat_rule TEXT,
            block_reason TEXT,
            waiting_for TEXT,
            fallback_action TEXT,
            fallback_at TEXT,
            deadline TEXT,
            earliest_start TEXT,
            latest_end TEXT,
            time_fixed INTEGER NOT NULL DEFAULT 0,
            pinned INTEGER NOT NULL DEFAULT 0,
            planned_result TEXT,
            owner TEXT NOT NULL DEFAULT 'user',
            priority INTEGER DEFAULT 0,
            risk_level TEXT DEFAULT 'Low',
            desired_result_made INTEGER DEFAULT 0,
            proof_exists INTEGER DEFAULT 0,
            proof_stored INTEGER DEFAULT 0,
            required_action_remains INTEGER DEFAULT 1,
            workflow_id TEXT UNIQUE,
            projection_version INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS links (
            from_id TEXT NOT NULL,
            to_id TEXT NOT NULL,
            link_type TEXT NOT NULL,
            PRIMARY KEY (from_id, to_id, link_type),
            FOREIGN KEY (from_id) REFERENCES commitments(id) ON DELETE CASCADE,
            FOREIGN KEY (to_id) REFERENCES commitments(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            card_id TEXT NOT NULL,
            timestamp TEXT NOT NULL DEFAULT (datetime('now')),
            state_from TEXT,
            state_to TEXT NOT NULL,
            note TEXT,
            actual_start TEXT,
            actual_end TEXT,
            FOREIGN KEY (card_id) REFERENCES commitments(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS proof_index (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            card_id TEXT NOT NULL UNIQUE,
            result TEXT NOT NULL,
            proof_location TEXT NOT NULL,
            verified INTEGER NOT NULL DEFAULT 0,
            verified_at TEXT,
            FOREIGN KEY (card_id) REFERENCES commitments(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS capacity (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            week_of TEXT NOT NULL UNIQUE,
            total_hours REAL NOT NULL,
            fixed_commitments REAL NOT NULL DEFAULT 0,
            meals_travel_transitions REAL NOT NULL DEFAULT 0,
            recovery_reserve REAL NOT NULL DEFAULT 0,
            available_capacity REAL NOT NULL,
            schedule_limit REAL NOT NULL
        );

        CREATE TABLE IF NOT EXISTS review_runs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            review_type TEXT NOT NULL,
            timestamp TEXT NOT NULL DEFAULT (datetime('now')),
            summary TEXT NOT NULL,
            changes_made INTEGER NOT NULL DEFAULT 0,
            tomorrow_mode TEXT,
            must_happen TEXT
            ,run_key TEXT UNIQUE
        );

        CREATE TABLE IF NOT EXISTS projection_events (
            event_id TEXT PRIMARY KEY,
            workflow_id TEXT NOT NULL,
            card_id TEXT NOT NULL,
            version INTEGER NOT NULL,
            action TEXT NOT NULL,
            accepted INTEGER NOT NULL,
            payload TEXT NOT NULL,
            projected_at TEXT NOT NULL DEFAULT (datetime('now')),
            UNIQUE(workflow_id, version)
        );

        CREATE TABLE IF NOT EXISTS active_lock (
            scope TEXT PRIMARY KEY,
            card_id TEXT NOT NULL,
            acquired_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS schedule_reservations (
            card_id TEXT PRIMARY KEY,
            planned_date TEXT NOT NULL,
            planned_duration INTEGER NOT NULL,
            workflow_id TEXT NOT NULL,
            reserved_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS protocol_runs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            path TEXT NOT NULL CHECK(path IN ('A','B','C','D','E')),
            started_on TEXT NOT NULL,
            ends_on TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'active',
            completed_at TEXT,
            UNIQUE(path, started_on)
        );

        CREATE TABLE IF NOT EXISTS protocol_events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            run_id INTEGER NOT NULL,
            event_date TEXT NOT NULL,
            event_type TEXT NOT NULL,
            outcome TEXT NOT NULL CHECK(outcome IN ('pass','fail','observed')),
            evidence TEXT NOT NULL,
            friction TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            FOREIGN KEY(run_id) REFERENCES protocol_runs(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS camunda_instances (
            card_id TEXT PRIMARY KEY,
            process_instance_key TEXT NOT NULL UNIQUE,
            process_definition_id TEXT NOT NULL,
            process_version INTEGER NOT NULL,
            state TEXT NOT NULL,
            projection_version INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now')),
            FOREIGN KEY(card_id) REFERENCES commitments(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS camunda_job_results (
            job_key TEXT PRIMARY KEY,
            job_type TEXT NOT NULL,
            card_id TEXT,
            process_instance_key TEXT,
            result TEXT NOT NULL,
            completed_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS camunda_audit (
            event_key TEXT PRIMARY KEY,
            card_id TEXT,
            process_instance_key TEXT,
            event_type TEXT NOT NULL,
            actor_id TEXT,
            model_version INTEGER,
            payload TEXT NOT NULL,
            occurred_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS pes_users (
            user_id TEXT PRIMARY KEY,
            role TEXT NOT NULL CHECK(role IN ('worker','operator','model-author','admin')),
            active INTEGER NOT NULL DEFAULT 1,
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS camunda_repeat_cycles (
            series_id TEXT NOT NULL,
            cycle_no INTEGER NOT NULL,
            card_id TEXT NOT NULL UNIQUE,
            source_job_key TEXT NOT NULL UNIQUE,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            PRIMARY KEY(series_id, cycle_no)
        );

        CREATE TABLE IF NOT EXISTS fixed_events (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            event_date TEXT NOT NULL,
            start_time TEXT NOT NULL,
            end_time TEXT NOT NULL,
            resource TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS solver_runs (
            run_id TEXT PRIMARY KEY,
            week_of TEXT NOT NULL,
            input_version TEXT NOT NULL,
            solver_name TEXT NOT NULL,
            solver_version TEXT NOT NULL,
            rule_set_version TEXT NOT NULL,
            weight_set_version TEXT NOT NULL,
            seed INTEGER NOT NULL,
            time_limit_seconds REAL NOT NULL,
            status TEXT NOT NULL,
            hard_score INTEGER,
            soft_score INTEGER,
            solve_time_ms INTEGER,
            stopped_by_limit INTEGER NOT NULL DEFAULT 0,
            is_what_if INTEGER NOT NULL DEFAULT 0,
            input_json TEXT NOT NULL,
            output_json TEXT,
            error TEXT,
            imported_at TEXT,
            rejected_at TEXT,
            stop_requested INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS plan_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            run_id TEXT NOT NULL,
            card_id TEXT NOT NULL,
            old_plan_json TEXT NOT NULL,
            new_plan_json TEXT NOT NULL,
            changed_at TEXT NOT NULL DEFAULT (datetime('now')),
            FOREIGN KEY(run_id) REFERENCES solver_runs(run_id),
            FOREIGN KEY(card_id) REFERENCES commitments(id)
        );
    """)
    _migrate(conn)
    conn.commit()
    conn.close()

def _migrate(conn):
    """Apply additive migrations without discarding an existing personal DB."""
    columns = {row["name"] for row in conn.execute("PRAGMA table_info(inbox)")}
    for name, kind in (
        ("processed_at", "TEXT"),
        ("process_action", "TEXT"),
        ("card_id", "TEXT"),
    ):
        if name not in columns:
            conn.execute(f"ALTER TABLE inbox ADD COLUMN {name} {kind}")
    commitment_columns = {
        row["name"] for row in conn.execute("PRAGMA table_info(commitments)")
    }
    for name, kind in (
        ("workflow_id", "TEXT"),
        ("projection_version", "INTEGER NOT NULL DEFAULT 0"),
        ("fallback_at", "TEXT"),
        ("deadline", "TEXT"),
        ("earliest_start", "TEXT"),
        ("latest_end", "TEXT"),
        ("time_fixed", "INTEGER NOT NULL DEFAULT 0"),
        ("pinned", "INTEGER NOT NULL DEFAULT 0"),
        ("planned_result", "TEXT"),
    ):
        if name not in commitment_columns:
            conn.execute(f"ALTER TABLE commitments ADD COLUMN {name} {kind}")
    solver_columns = {
        row["name"] for row in conn.execute("PRAGMA table_info(solver_runs)")
    }
    if "stop_requested" not in solver_columns:
        conn.execute("ALTER TABLE solver_runs ADD COLUMN stop_requested INTEGER NOT NULL DEFAULT 0")
    review_columns = {
        row["name"] for row in conn.execute("PRAGMA table_info(review_runs)")
    }
    if "run_key" not in review_columns:
        conn.execute("ALTER TABLE review_runs ADD COLUMN run_key TEXT")
    conn.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS review_runs_run_key "
        "ON review_runs(run_key) WHERE run_key IS NOT NULL"
    )
    conn.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS commitments_workflow_id "
        "ON commitments(workflow_id) WHERE workflow_id IS NOT NULL"
    )
    protocol_sql = conn.execute(
        "SELECT sql FROM sqlite_master WHERE type='table' AND name='protocol_runs'"
    ).fetchone()["sql"]
    if "'E'" not in protocol_sql:
        # Rebuild both related tables so SQLite's renamed foreign-key target
        # cannot strand existing Path A/B evidence.
        conn.execute("PRAGMA foreign_keys=OFF")
        conn.execute("ALTER TABLE protocol_events RENAME TO protocol_events_old")
        conn.execute("ALTER TABLE protocol_runs RENAME TO protocol_runs_old")
        conn.execute("""CREATE TABLE protocol_runs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            path TEXT NOT NULL CHECK(path IN ('A','B','C','D','E')),
            started_on TEXT NOT NULL,
            ends_on TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'active',
            completed_at TEXT,
            UNIQUE(path, started_on))""")
        conn.execute("""CREATE TABLE protocol_events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            run_id INTEGER NOT NULL,
            event_date TEXT NOT NULL,
            event_type TEXT NOT NULL,
            outcome TEXT NOT NULL CHECK(outcome IN ('pass','fail','observed')),
            evidence TEXT NOT NULL,
            friction TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            FOREIGN KEY(run_id) REFERENCES protocol_runs(id) ON DELETE CASCADE)""")
        conn.execute("INSERT INTO protocol_runs SELECT * FROM protocol_runs_old")
        conn.execute("INSERT INTO protocol_events SELECT * FROM protocol_events_old")
        conn.execute("DROP TABLE protocol_events_old")
        conn.execute("DROP TABLE protocol_runs_old")
        conn.execute("PRAGMA foreign_keys=ON")
