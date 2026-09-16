# PES Path B operations

Path B uses Temporal as the authority for active commitment execution. SQLite is
an idempotent query projection and must not be used to bypass Workflow guards.

## Fixed identity map

- Namespace: `pes`
- Task queue: `pes-commitments`
- Workflow type: `pes.commitment`
- Workflow ID: `pes/commitment/<card-id>`
- Active-lock scope: the full PES system
- Query database: `PES_DB_PATH`, or the normal PES SQLite location

## Start

Install the native Temporal CLI for Windows, then start its persistent local
service:

```powershell
temporal server start-dev --db-filename "$env:LOCALAPPDATA\PES\temporal.db" --namespace pes
pes-worker
```

The Temporal frontend is at `localhost:7233`; the built-in operator UI is at
`http://localhost:8233`. Start the PES interface only after the worker reports
that it is listening on `pes-commitments`.

## Stop safely

Stop the worker with Ctrl+C, then stop the Temporal CLI with Ctrl+C. The
`--db-filename` database remains on disk and is reused by the next start.

## Health and failed work

```powershell
temporal operator cluster health --address localhost:7233
temporal workflow list --namespace pes
```

Use the UI to inspect Workflow history, failed activities, retry attempts, and
pending timers. Approved recovery commands must be sent through the Workflow;
do not repair execution state directly in SQLite.

## Backup

Create a consistent online SQLite backup of both databases:

```powershell
pes path-b backup --output C:\Backups\pes-YYYY-MM-DD
```

The backup contains both databases and a SHA-256 manifest. Restore tests must
use separate database paths and ports so production data is never overwritten.

## Workflow-code changes

Workflow code must remain deterministic: use `workflow.now()`, durable timers,
and activities for database, filesystem, network, and other external work.
Replay saved histories before deployment. Add versioning or a new Workflow type
when a change would alter commands already recorded in open histories. Record
the PES version, worker identity, image versions, test command, and replay result
with every release.
