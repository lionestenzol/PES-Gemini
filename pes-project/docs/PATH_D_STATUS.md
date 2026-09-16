# Path D completion status

Status date: 2026-08-03

Field protocol: run `4`, started 2026-08-03, elapsed-time gate ends
2026-08-16 (inclusive day 14).

Live evidence recorded on 2026-08-03: optimal proposal/import
`c934e00d-2fea-4646-88b5-94ed6c42edcd`, rejected replan
`bfa06bf6-1086-4672-ab9b-9a2988197ea3`, and infeasible pinned what-if
`5f88a297-4cd4-4f4f-948a-d8802d2fdeb5`. All protocol event categories are
present; only the elapsed-time gate remains.

## Current verdict

Path D is **implemented as an initial tested release but not certified Done**.
OR-Tools is selected; Timefold is NOT APPLICABLE. The control-baseline and
two-week Path D field gates remain open.

## Implemented and tested

- Stable database snapshot and SHA-256 input version
- Aggregated input validation and dependency-cycle detection
- Monday–Friday, 15-minute, America/Chicago planning model
- Optional scheduling with explicit unscheduled output
- Dependency precedence and `excludes` constraints
- Weekly 70-percent schedule-limit enforcement
- Per-resource no-overlap and immovable fixed events
- Earliest start, latest end, hard deadline, pinned work, priority, and risk
- Deterministic seed, time limit, solve status, score, bound, and solve time
- Durable solve records and retained proposal output
- Proposal review/show/reject commands
- Independent PES proposal validation
- Stale-input rejection and atomic import with plan history and event logs
- What-if copied facts that cannot be imported
- Day view with order, planned time/duration/result, fixed events, and capacity
- Path D two-week evidence protocol
- Cooperative user stop with a clearly marked best feasible proposal
- Replan-stability penalty that prefers unchanged approved times
- Automated 50-commitment, 5-resource, 10-second target test

## Still required for certification

- Confirm the selection gate with real workload facts
- Complete the control-baseline two-week protocol
- Complete the Path D two-week field protocol
- Record target-size performance and memory evidence
- Record user-stop and best-valid-plan behavior on a real workload
- Run real replans after blocks, fixed-event changes, and deadline changes
- Record at least two real what-if comparisons
- Complete all checklist acceptance, nine-question, and control-comparison proof
