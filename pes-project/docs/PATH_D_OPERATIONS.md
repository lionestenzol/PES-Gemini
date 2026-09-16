# PES Path D operations (OR-Tools)

Path D proposes an optimized Monday-through-Friday week plan. OR-Tools is the
selected solver, pinned at `9.15.6755`. PES remains authoritative: solving does
not change a card, and only `pes path-d import RUN_ID` can apply a reviewed
proposal through PES guards in one SQLite transaction.

## Install and health

```powershell
python -m pip install -e ".[path-d]"
$env:PES_DB_PATH = "$env:LOCALAPPDATA\PES\pes.db"
pes init
pes path-d health
```

Path D uses 15-minute units and `America/Chicago`. Working hours are 09:00–17:00,
Monday–Friday. Durations are fixed, required, positive, and divisible by 15.
An unscheduled item remains Ready; an accepted replan can return an old
Scheduled item to Ready with plan history.

## Planning fields and fixed events

```powershell
pes card update CARD-ID --field planned_duration --value 60
pes card update CARD-ID --field deadline --value 2026-08-07T17:00
pes card update CARD-ID --field earliest_start --value 2026-08-03T10:00
pes card update CARD-ID --field pinned --value true
pes path-d fixed-add TEAM-MEETING --name "Team meeting" --date 2026-08-03 --start 10:00 --end 11:00 --resource worker-1
```

`blocks` and `requires` impose hard precedence. `excludes` prevents both cards
from being scheduled. `helps` and `produces` are retained as graph facts but do
not affect Path D rule-set version 1.

## Solve, review, and import

```powershell
pes capacity set --week 2026-08-03 --total 40 --fixed 12 --meals 6 --recovery 6
pes path-d solve --week 2026-08-03 --time-limit 10 --seed 1
pes path-d show RUN-ID
pes path-d import RUN-ID
pes day --date 2026-08-03
```

Review `blocks`, `unscheduled`, `errors`, `hard_score`, `soft_score`, and
`stopped_by_limit` before import. A feasible result has hard score 0. Higher
soft scores are better. Version 1 weights are: scheduled 10000, priority 100,
risk 25, and plan-change 10 (reserved for replan stability). A soft score never
overrides a hard constraint.

Reject without changing PES:

```powershell
pes path-d reject RUN-ID
```

Every run stores the input snapshot/hash, solver and rules versions, weights,
seed, time limit, status, score, solve time, and output. Import is blocked when
the PES input hash has changed, the result is infeasible, the proposal was
rejected, or independent PES guards reject the output.

## Replan and what-if

A normal new solve is a replan: it snapshots current PES facts, produces a new
run ID, and retains all older runs. Review its differences in the proposed
blocks and `plan_history` after import.

What-if uses copied facts and cannot be imported:

```powershell
pes path-d solve --week 2026-08-03 --what-if '{"capacity":{"schedule_limit":8}}'
pes path-d solve --week 2026-08-03 --what-if '{"commitments":{"CARD-ID":{"priority":100}}}'
pes path-d runs
```

To plan only a defined project/work packet, pass a comma-separated card scope.
Unrelated invalid Ready cards remain untouched:

```powershell
pes path-d solve --week 2026-08-03 --cards CARD-A,CARD-B,CARD-C
```

For a long solve, choose a unique run ID and use another terminal to request a
cooperative stop. The best feasible proposal found is returned with status
`STOPPED` and `stopped_by_user: true`:

```powershell
pes path-d solve --week 2026-08-03 --time-limit 300 --run-id WEEK-2026-08-03-R1
pes path-d stop WEEK-2026-08-03-R1
```

Run a normal solve after choosing a what-if result, then review and import that
new live proposal.

## Authority boundary

The solver may propose only dates, times, duration, owner, and planned result.
It cannot activate or complete work, make or approve proof, execute fallback,
or write actual start/end/result fields. PES continues to enforce Single-Active,
proof, fallback, state transitions, capacity, logs, and terminal records.

## Field protocol

```powershell
pes protocol start --path D
pes protocol status RUN-ID
```

Path D is not certified Done until the two-week checklist protocol and control
baseline are complete, even when all software tests pass.
