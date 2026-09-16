# PES Path C operations (Camunda 8 SaaS, no Docker)

Path C targets Camunda 8.9 SaaS. Camunda BPMN is authoritative for process
flow. PES SQLite is authoritative for business/query data and cannot advance a
process. The permanent mapping is:

```text
PES card ID <-> Camunda business ID <-> Camunda process instance key
```

The stable process IDs are `pes-commitment` and `pes-review`; the stable DMN
decision ID is `pes-completion-gate`. Model version tag `1.0.0` starts Path C.

## Create the SaaS environment

1. Create a Camunda 8.9 SaaS cluster.
2. Create API credentials with Orchestration Cluster access.
3. Create or invite at least two test users.
4. Create the groups `pes-workers`, `pes-schedulers`, `pes-verifiers`, and
   `pes-reviewers`, then assign the intended users.
5. Keep operator and model-author permissions separate from normal workers.

Mirror each Camunda test user into the PES role registry. The user ID must match
the Camunda assignee exactly:

```powershell
pes path-c user worker-1 --role worker
pes path-c user worker-2 --role worker
pes path-c user operator-1 --role operator
pes path-c user model-author-1 --role model-author
pes path-c users
```

Completing listeners use Camunda's authoritative assignee. Normal human tasks
accept active `worker` or `admin` roles and deny unknown, operator-only, and
model-author-only identities. Each accepted completion stores actor, task,
process instance, and time in `camunda_audit`.

Never commit credentials. Set them in each PowerShell window:

```powershell
$env:CAMUNDA_REST_ADDRESS = "https://<region>.zeebe.camunda.io/<cluster-id>"
$env:CAMUNDA_AUTH_STRATEGY = "OAUTH"
$env:CAMUNDA_CLIENT_ID = "<client-id>"
$env:CAMUNDA_CLIENT_SECRET = "<client-secret>"
$env:CAMUNDA_OAUTH_URL = "https://login.cloud.camunda.io/oauth/token"
$env:CAMUNDA_TOKEN_AUDIENCE = "zeebe.camunda.io"
$env:PES_DB_PATH = "$env:LOCALAPPDATA\PES\pes.db"
```

Use the exact REST address and OAuth values downloaded from the Camunda cluster
rather than constructing them when the downloaded credentials differ.

## Install and check

```powershell
Set-Location "C:\Users\bruke\pes-project"
python -m pip install -e ".[path-c]"
pes path-c health
pes path-c resources
```

SDK major 9.x matches Camunda server 8.9.

## Deploy

The deployment command sends the BPMN, DMN, and all linked forms in one atomic
resource deployment:

```powershell
pes path-c deploy
```

Record the deployment key, process definition IDs/versions, and decision
definition ID/version. A deployment failure marks no checklist item complete.

## Start the worker

In a dedicated PowerShell window with the same environment variables:

```powershell
pes-camunda-worker
```

It subscribes to:

- `pes-ready-check`
- `pes-schedule-check`
- `pes-acquire-active`
- `pes-release-active`
- `pes-project-state`
- `pes-store-proof`
- `pes-audit-user-task`
- `pes-create-repeat-cycle`
- `pes-record-review`

Each job has a 30-second timeout. BPMN creates jobs with three or five retries.
`camunda_job_results.job_key` makes repeated job delivery idempotent.

## Start a commitment

Capture the item first:

```powershell
pes inbox add "Prepare the team release brief"
pes inbox list
pes inbox process 1 --action store
```

Then start exactly one Camunda process using the same permanent card ID:

```powershell
pes path-c start C-001 `
  --name "Prepare the team release brief" `
  --current "No approved release brief" `
  --desired "Team has an approved release brief" `
  --proof "Approved brief in the release folder" `
  --next-action "Draft the release outline" `
  --owner "worker-1"
```

Users perform assigned work in Camunda Tasklist. Operators inspect path,
variables, failed jobs, and incidents in Operate. Search with the card ID,
which is also the process business ID.

## Business versus technical faults

- `Blocked` is PES business state and stores `block_reason`, `waiting_for`,
  `review_date`, and any required `fallback_action`.
- A Camunda incident is a technical failure such as an exhausted worker retry.
- Never represent a business block only as an incident.
- Never repair business state by editing SQLite.

For repair, record the operator user ID, reason, incident key, affected card ID,
and approved action in the audit record before retrying or modifying an
instance. The repair must resume at a BPMN point that still executes every PES
guard.

## Stop safely

Stop `pes-camunda-worker` with Ctrl+C. Camunda SaaS retains process state,
timers, tasks, jobs, and incidents. Restart the worker with the same
configuration; outstanding jobs will be redelivered and idempotency markers
prevent duplicate PES effects.

The separate `pes-review` model has daily and weekly timer starts. End-of-day
reviews require a recorded system change, tomorrow mode, and what must happen.
Weekly reviews require Collect, Clarify, Verify, Update, Remove, Select,
Schedule, and next-week capacity. The `pes-repeat-series` model creates a new
permanent card ID for each cycle, calls `pes-commitment`, preserves the series
mapping, and waits on the configured interval before another cycle.

## Backup

Camunda SaaS owns engine durability. Back up the PES business/query database
separately:

```powershell
pes path-b backup --output "C:\Backups\pes-$(Get-Date -Format yyyy-MM-dd)"
```

For Path C sign-off, also export or retain the Camunda audit data required
beyond the configured Operate retention period. Restore testing must use a
separate PES database and a non-production Camunda cluster.

## Release rule

Deploy a new model version; do not overwrite the meaning of an open instance.
Record resource hashes, deployment key, definition versions, test command, and
the decision for open instances: remain on old version, explicitly migrate, or
cancel through an approved business path. Prefer forward-fix over unlogged
manual modification.

## Operational protocol

```powershell
pes protocol start --path C --date 2026-08-02
pes protocol status 3
```

Use the run ID printed by `start`; do not assume it is always `3`. Record each
real test with `pes protocol record`. The run cannot complete before its
inclusive fourteenth day and cannot replace the checklist's required live
Tasklist, Operate, access, restart, incident, backup, and team evidence.
