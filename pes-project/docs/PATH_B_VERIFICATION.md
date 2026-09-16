# PES Path B verification

Test date: 2026-08-02

## Software result

- Test command: `python -m pytest -p no:cacheprovider -q`
- Result: `86 passed, 1 skipped`
- Path B AT-001 through AT-015: 15 passed
- Path A/Path B parity gates: 15 passed
- Transition-law comparison: passed
- Workflow replay: passed
- Concurrent capacity control: passed
- Concurrent system-wide Active lock: passed
- Blocked review and fallback timers: passed
- Early unblock timer invalidation: passed
- Review schedules: installed and live trigger passed
- Repeat-series cycle identity: passed
- Temporal-sourced projection repair: passed
- Two-database backup/restore: passed
- Nine-question gate: passed

The skipped ephemeral-test-server case is worker replacement with a pending
sticky Workflow task. The native-server test passed:

- Workflow ID: `pes/commitment/PB-OFFLINE-002`
- Signal ID: `offline-signal-002`
- Signal entered history while no worker was running.
- A replacement worker processed it.
- Workflow state remained `Ready` and advanced to version 2.
- `next_physical_action` became `processed after worker restart`.

## Runtime identity

- Temporal CLI: 1.8.1
- Temporal Server: 1.31.2
- Temporal UI: 2.50.1
- Temporal Python SDK: 1.31.0
- PES version: 1.0.0
- Worker identity: `pes-worker-1.0.0`
- Namespace: `pes`
- Retention: 7 days
- Task queue: `pes-commitments`
- Query database: `%LOCALAPPDATA%\PES\pes.db`
- Temporal database: `%LOCALAPPDATA%\PES\temporal.db`
- Multiple-user gate: NOT APPLICABLE (single-user Path B)

## Durable proof

- Native restart Workflow: `pes/commitment/PB-NATIVE-001`
- Offline-signal Workflow: `pes/commitment/PB-OFFLINE-002`
- Backup manifest:
  `%LOCALAPPDATA%\PES\backups\verification-2026-08-02\manifest.json`
- Scheduled reviews: `pes-review-end-of-day`, `pes-review-weekly`

## Sign-off truth

Control Baseline status: NOT DONE

Path B status: NOT DONE

The software gates pass. Final checklist status remains NOT DONE until the real
two-week Path A control protocol and real two-week Path B field protocol both
finish. Elapsed operational evidence must not be simulated.

## Active operational protocols

- Path A control run: ID 1
- Path B field run: ID 2
- Start date: 2026-08-02
- Inclusive end date: 2026-08-15
- Current status: active

Path B day-one evidence records the native worker restart, signal accepted while
the worker was stopped, signal processing after replacement-worker startup, one
scheduled end-of-day review, and observed system friction. Path A currently has
no credited real-use events.

Inspect progress with:

```powershell
pes protocol status 1
pes protocol status 2
```
