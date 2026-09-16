# Path C completion status

Status date: 2026-08-02

## Current verdict

Path C software is implemented and its single-instance live lifecycle passes,
but final Definition-of-Done certification remains **in progress**. Camunda
8.9 SaaS credentials, deployment, Tasklist, Operate, workers, incident repair,
the completion decision, proof storage, and the complete lifecycle have been
exercised without Docker. The required two-week, two-user field protocol and
the remaining team/failure scenarios are still time- or evidence-gated.

## Implemented and locally tested

- Stable commitment and review BPMN process IDs
- Source-controlled BPMN, DMN, and linked Camunda Forms
- Typed four-input completion decision with one passing truth-table row
- Official Camunda Python SDK 9.x integration for server 8.9
- Nine job-worker subscriptions with explicit timeouts and BPMN retry limits
- Permanent card/process mapping schema
- Idempotent job-result and audit-event storage
- Captured-state support for incomplete raw work
- Ready gate using the existing PES law
- Atomic 70-percent capacity reservation
- Dependency checks before Schedule and Active
- System-wide Single-Active lock under concurrent requests
- Proof Index write only after the completion facts pass
- Path C CLI and package resource inclusion
- Two-week Path C operational evidence tracker
- Monotonic projections across Pause/Resume, Block, and proof loops
- Authoritative-assignee completion listeners on every human task
- Separated worker, operator, model-author, and admin role checks
- Idempotent timestamped human-task audit records
- Distinct end-of-day and weekly timer paths with guarded review records
- Repeat-series model with unique cycle IDs, child processes, and durable timer
- Live `pes-commitment` lifecycle through Captured, Ready, Scheduled, Active,
  Completed, Verified, and Done
- Live Tasklist assignment and completion through the Camunda API
- Live Operate process completion and incident diagnosis/repair
- Live completion-DMN pass, verified proof record, audit history, and monotonic
  PES SQLite projection
- Schedule fields and four proof facts preserved in the final commitment row

## Not yet proven

- The selection gate's real team facts
- Live blocked timer, early unblock, restart, and fallback behavior
- Live review/repeat timers and missed-review visibility
- Team access rules with allowed and denied tests
- Audit retention/export beyond Operate retention
- Full backup restoration against a separate Camunda test cluster
- All fifteen Path C acceptance tests through the live BPMN system
- Control comparison against the Python baseline
- Two-week field test with at least two users

## Evidence commands

```powershell
python -m pytest -p no:cacheprovider -q tests\test_path_c.py
python -m pytest -p no:cacheprovider -q
pes path-c resources
pes protocol status <path-c-run-id>
```
