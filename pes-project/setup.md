# PES setup and usage (native Windows, no Docker)

This guide runs PES Path B natively on Windows. Path B uses Temporal as the
authoritative execution system and SQLite as its local query projection.

## 1. Requirements

- Windows PowerShell
- Python 3.10 or newer
- Temporal CLI

Confirm the tools are available:

```powershell
python --version
temporal --version
```

If Temporal is not installed, install the official Temporal CLI for Windows.
One supported route is WinGet:

```powershell
winget search Temporal.CLI
winget install Temporal.CLI
```

If `temporal` is not recognized immediately after installation, close and
reopen PowerShell so its updated `PATH` is loaded.

## 2. Install PES

Open PowerShell in the repository and install the package:

```powershell
Set-Location "C:\Users\bruke\pes-project"
python -m pip install -e .
pes init
pes --help
```

The editable install provides these commands:

- `pes` — main CLI
- `pes-worker` — Path B Temporal worker
- `pes-tui` — Path A terminal interface

## 3. Set the native runtime environment

Run this in every new PowerShell window used for PES:

```powershell
$env:PES_DB_PATH = "$env:LOCALAPPDATA\PES\pes.db"
$env:PES_TEMPORAL_ADDRESS = "localhost:7233"
$env:PES_TEMPORAL_NAMESPACE = "pes"
$env:PES_TEMPORAL_TASK_QUEUE = "pes-commitments"
New-Item -ItemType Directory -Force "$env:LOCALAPPDATA\PES" | Out-Null
```

`PES_DB_PATH` is the Path B query database. Temporal's durable history is kept
separately in `temporal.db`.

## 4. Start PES

PES needs two long-running processes. Keep each one in its own PowerShell
window.

### Window 1 — Temporal server

```powershell
$env:PES_DB_PATH = "$env:LOCALAPPDATA\PES\pes.db"
$env:PES_TEMPORAL_ADDRESS = "localhost:7233"
$env:PES_TEMPORAL_NAMESPACE = "pes"
$env:PES_TEMPORAL_TASK_QUEUE = "pes-commitments"
New-Item -ItemType Directory -Force "$env:LOCALAPPDATA\PES" | Out-Null

temporal server start-dev `
  --db-filename "$env:LOCALAPPDATA\PES\temporal.db" `
  --namespace pes `
  --port 7233 `
  --ui-port 8233
```

Leave this window open. The Temporal UI is available at
<http://localhost:8233>.

### Window 2 — PES worker

```powershell
Set-Location "C:\Users\bruke\pes-project"
$env:PES_DB_PATH = "$env:LOCALAPPDATA\PES\pes.db"
$env:PES_TEMPORAL_ADDRESS = "localhost:7233"
$env:PES_TEMPORAL_NAMESPACE = "pes"
$env:PES_TEMPORAL_TASK_QUEUE = "pes-commitments"

pes-worker
```

Leave this window open too. The worker listens on `pes-commitments`.

### Window 3 — PES commands

Open a third PowerShell window, set the same environment variables, and verify
the runtime:

```powershell
Set-Location "C:\Users\bruke\pes-project"
$env:PES_DB_PATH = "$env:LOCALAPPDATA\PES\pes.db"
$env:PES_TEMPORAL_ADDRESS = "localhost:7233"
$env:PES_TEMPORAL_NAMESPACE = "pes"
$env:PES_TEMPORAL_TASK_QUEUE = "pes-commitments"

pes path-b health
temporal operator cluster health --address localhost:7233
```

Expected PES output:

```text
Temporal health: SERVING
```

Install the durable end-of-day and weekly review schedules once:

```powershell
pes path-b install-schedules
```

The operation is safe to run again; it keeps the schedules at their fixed IDs.

## 5. Create and run a commitment

Path B's guarded lifecycle is:

```text
Captured -> Ready -> Scheduled -> Active -> Completed -> Verified -> Done
```

### Capture the input

All new work should first be captured in the Inbox:

```powershell
pes inbox add "Write the project brief"
pes inbox list
```

At present, Inbox capture and Path B workflow creation are separate operations.
After noting the Inbox ID, mark it stored:

```powershell
pes inbox process 1 --action store
```

Do **not** use `pes inbox process --action define` for a Path B commitment. That
action creates a Path A SQLite card; it does not create the authoritative
Temporal workflow.

### Start the durable workflow

Choose a permanent, unique card ID:

```powershell
pes path-b start PB-001 `
  --name "Write the project brief" `
  --current "No approved brief exists" `
  --desired "The project brief is approved" `
  --proof "Approved brief PDF exists" `
  --next-action "Draft the outline"
```

The Workflow ID becomes `pes/commitment/PB-001`. A new workflow always starts
in `Captured`.

Move it through the Ready gate:

```powershell
pes path-b command PB-001 ready
```

Ready requires non-empty current state, desired state, proof rule, and next
physical action. Priority 80 or higher, or High risk, also requires a fallback
action supplied at creation with `--fallback`.

### Set weekly capacity

Capacity is expressed in hours. `--week` may be any date in the target week;
PES stores it under that week's Monday.

```powershell
pes capacity set `
  --week 2026-08-03 `
  --total 40 `
  --fixed 12 `
  --meals 6 `
  --recovery 6

pes capacity show --week 2026-08-03
```

### Schedule the work

Path B command data is supplied as a JSON object:

```powershell
pes path-b command PB-001 schedule --data '{"planned_date":"2026-08-05","planned_start":"09:00","planned_end":"10:00","planned_duration":60}'
```

`planned_duration` is in minutes and must be positive. Scheduling is rejected
if the proof rule is empty or the capacity reservation would overschedule the
week.

### Execute and finish

Only one commitment can be Active across PES at a time.

```powershell
pes path-b command PB-001 activate

pes path-b command PB-001 complete --data '{"result":"Brief approved","proof_location":"C:\\proof\\brief.pdf","what_happened":"Approval received"}'

pes path-b command PB-001 verify --data '{"desired_result_made":true,"proof_exists":true,"proof_stored":true,"required_action_remains":false}'

pes path-b command PB-001 done
```

The verification gate requires all of the following:

- a recorded result
- a proof location
- the desired result was made
- proof exists
- proof is stored
- no required action remains

## 6. Inspect a commitment

Query the authoritative Workflow state:

```powershell
pes path-b show PB-001
pes path-b questions PB-001
```

Inspect all Workflow histories in the Temporal UI at
<http://localhost:8233>, or list them from PowerShell:

```powershell
temporal workflow list --namespace pes
```

The `questions` command reports the nine PES control questions for the selected
commitment.

## 7. Update, pause, block, and cancel

Update allowed fields while preserving Workflow history:

```powershell
pes path-b command PB-001 update --data '{"next_physical_action":"Send the draft for review"}'
```

Pause Active work:

```powershell
pes path-b command PB-001 pause --data '{"what_happened":"Meeting interrupted the work","next_physical_action":"Resume section two"}'
```

A Paused commitment may return directly to Active:

```powershell
pes path-b command PB-001 activate
```

Block Active work with a review date:

```powershell
pes path-b command PB-001 block --data '{"block_reason":"Waiting for legal review","waiting_for":"Legal team","review_date":"2026-08-06","fallback_action":"Escalate to project sponsor"}'
```

When the dependency clears, return the commitment to Ready:

```powershell
pes path-b command PB-001 unblock
```

Cancel a non-terminal commitment:

```powershell
pes path-b command PB-001 cancel
```

`Done` and `Canceled` are terminal states.

## 8. Valid Path B transitions

| From | Allowed destination |
| --- | --- |
| Captured | Ready, Canceled |
| Ready | Scheduled, Captured, Canceled |
| Scheduled | Active, Ready, Canceled |
| Active | Completed, Paused, Blocked, Canceled |
| Completed | Verified, Active, Ready, Canceled |
| Verified | Done, Completed, Canceled |
| Paused | Active, Canceled |
| Blocked | Ready, Canceled |
| Done | None |
| Canceled | None |

Use `unschedule` to move Scheduled work back to Ready:

```powershell
pes path-b command PB-001 unschedule
```

## 9. Backup and recovery

Create a consistent online backup of both native SQLite databases:

```powershell
pes path-b backup --output "C:\Backups\pes-$(Get-Date -Format yyyy-MM-dd)"
```

The backup directory contains the Temporal database, the PES query database,
and a SHA-256 manifest. Test restores using different database paths and ports;
do not overwrite the live databases to test a restore.

If the query projection needs rebuilding from Temporal's authoritative state:

```powershell
pes path-b rebuild
```

Do not manually repair Path B execution state in SQLite. Send state changes as
Workflow commands so Temporal records and guards them.

## 10. Stop and restart safely

1. Press Ctrl+C in the PES worker window.
2. Press Ctrl+C in the Temporal server window.

The two database files remain on disk. Restart Temporal with the same
`--db-filename`, then restart `pes-worker`. Durable commands and timers survive
worker downtime.

## 11. Track Path B operational completion

Path B's software tests can pass before the two-week operational protocol is
complete. Check the existing run:

```powershell
pes protocol status 2
```

Record real-use evidence as it occurs:

```powershell
pes protocol record 2 `
  --type real_commitment `
  --outcome observed `
  --evidence "PB-001 moved through the durable control loop"
```

The accepted Path B event types are:

- `real_commitment`
- `inbox`
- `define`
- `capacity`
- `dependencies`
- `blocked_timer`
- `activity_retry`
- `worker_restart`
- `offline_signal`
- `offline_signal_processed`
- `eod_review`
- `weekly_review`
- `overschedule`
- `proof`
- `friction`

The current run began on 2026-08-02 and cannot pass its elapsed-time gate before
2026-08-15. Completing it earlier is intentionally rejected:

```powershell
pes protocol complete 2
```

Run that command only after `pes protocol status 2` reports
`ready_to_complete: True`.

## 12. Run the tests

```powershell
Set-Location "C:\Users\bruke\pes-project"
python -m pytest -p no:cacheprovider -q
```

For command-specific help:

```powershell
pes --help
pes path-b --help
pes path-b start --help
pes path-b command --help
```

## Path A versus Path B

Path A commands such as `pes card move`, `pes start`, `pes stop`, `pes verify`,
and `pes done` operate directly on the SQLite implementation. Path B commands
under `pes path-b` operate through durable Temporal Workflows. For a Path B
commitment, use the Inbox only for capture and use `pes path-b` for lifecycle
control. Do not alternate Path A and Path B lifecycle commands on the same card
ID.

## Path C team setup

Path C uses Camunda 8 SaaS without Docker. Its credential setup, deployment,
worker, Tasklist/Operate workflow, recovery rules, and honest completion status
are documented in `docs/PATH_C_OPERATIONS.md` and `docs/PATH_C_STATUS.md`.
