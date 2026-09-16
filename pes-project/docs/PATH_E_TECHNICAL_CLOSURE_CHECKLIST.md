# Path E Technical Closure Definition of Done

Source: `PES_PATH_E_DEFINITION_OF_DONE_CHECKLIST.md` (PES-REF-002)

## 1. Closure definition

Use this checklist to reach **Path E Technical Closure** without waiting for the
two-week field-test clock.

Technical Closure means the selected Path E release is complete, testable,
recoverable, documented, and safe to begin the two-week operational validation.
It is not the roadmap's final **Path E Done** mark because PES-REF-002 requires a
completed two-week field test for that mark.

Only the elapsed-time requirement is waived here. The field behaviors—two
clients, lifecycle movement, conflicts, retry, restart, backup/restore, history,
and proof lookup—must still pass in an automated or same-session operational
smoke test.

Checkbox meanings:

- `[ ]` not proven.
- `[x]` proven by the named evidence.
- `[N/A]` excluded by a recorded release choice and reason.

Do not mark a box from code inspection alone. Record a passing test, request and
response, database/event record, trace, or release artifact.

## 2. Fixed release choices

- [ ] Engine form recorded as **both in-process and network service**.
- [ ] API version recorded as **v1**.
- [ ] Primary backend recorded as **SQLite**.
- [ ] Query and proof store recorded as **SQLite**.
- [ ] Client 1 recorded as **InProcessClient**.
- [ ] Client 2 recorded as **HTTPClient**.
- [ ] User model recorded as **single-user with actor attribution**.
- [ ] Tenant model recorded as **single-tenant**.
- [ ] Duration unit recorded as **minutes**.
- [ ] Date/time and timezone rule recorded.
- [ ] Calendar integration recorded as selected or `N/A`.
- [ ] Other outside integrations recorded individually or `N/A`.

Proof file: `docs/PATH_E_STATUS.md` plus the completed sign-off in section 20.

## 3. Control baseline prerequisite

- [ ] The five PES machines are named and mapped to code: State, Constraint,
      Graph, Time, and Event Log.
- [ ] All 15 roadmap acceptance tests pass against the control path.
- [ ] The control path answers the nine mandatory questions.
- [ ] Done and Canceled records remain queryable.
- [ ] Proof is findable for every completed control result.
- [ ] Any separate control-protocol requirement is complete or explicitly
      recorded as outside this Technical Closure waiver.

Required command:

    python -m pytest -p no:cacheprovider -q tests/test_core.py tests/test_path_a.py

## 4. Engine and authority boundary

- [ ] `pes.path_e.Engine` is the documented public application entry point.
- [ ] Both selected clients call the same Engine command/query methods.
- [ ] Clients contain no copied transition or guard rules.
- [ ] HTTP handlers contain transport mapping only, not PES rules.
- [ ] Every state move uses the State Engine.
- [ ] Every state, schedule, dependency, completion, and regression guard uses
      the Constraint Engine.
- [ ] Link commands use the Graph Engine.
- [ ] Capacity calculations use the Time Engine.
- [ ] Accepted commands write an append-only Path E event.
- [ ] A command's state/data mutation and event commit atomically.
- [ ] The SQLite adapter contains persistence translation only.
- [ ] The engine receives time and IDs through injectable ports.
- [ ] Core tests run without HTTP and without outside services.
- [ ] No client or integration writes PES database rows directly.

## 5. Public domain contract

- [ ] Public commitment IDs are unique and stable.
- [ ] Public fields cover level, parent, current state, desired state, proof
      requirement, next action, lifecycle state, schedule state, planned time,
      actual time, result, proof location, block facts, owner, priority, risk,
      and created/changed times.
- [ ] Backend-only fields are absent from public responses unless documented.
- [ ] Unknown write fields return a stable validation error.
- [ ] Required fields identify the invalid field.
- [ ] Direct state patches are rejected and point clients to the move command.
- [ ] Empty list queries return an empty list, not an error.
- [ ] List sorting, filters, limit, and offset behavior are documented and tested.
- [ ] The same object fields and meanings return through both clients.

## 6. Command contract closure

For every public write command, prove command name/version, actor, request ID,
required/optional input, idempotency behavior, stable success, stable error, and
safe backend-error translation.

- [ ] Create commitment.
- [ ] Update permitted commitment fields.
- [ ] Move commitment through every permitted lifecycle transition.
- [ ] Reject every forbidden lifecycle transition.
- [ ] Schedule commitment atomically through the Engine.
- [ ] Unschedule commitment atomically through the Engine.
- [ ] Set week capacity.
- [ ] Create link.
- [ ] Remove link.
- [ ] Run end-of-day review.
- [ ] Run weekly review.
- [ ] Verify proof and create/update one proof-index row.
- [ ] Move Verified work to Done.
- [ ] Each retryable command has an idempotency key and retention rule.
- [ ] No public command returns a raw SQLite or Python exception.

## 7. Query and HTTP route closure

- [ ] `POST /v1/commitments`.
- [ ] `GET /v1/commitments/{id}`.
- [ ] `PATCH /v1/commitments/{id}`.
- [ ] `POST /v1/commitments/{id}/move`.
- [ ] Schedule and unschedule routes are documented and tested.
- [ ] `GET /v1/views/inbox`.
- [ ] `GET /v1/views/ready`.
- [ ] `GET /v1/views/day/{date}`.
- [ ] `GET /v1/views/week/{week_of}`.
- [ ] `GET /v1/views/active`.
- [ ] `GET /v1/views/verify`.
- [ ] `GET /v1/views/blocked`.
- [ ] `GET /v1/views/map/{outcome_id}`.
- [ ] `GET /v1/views/proof` or the documented v1 proof equivalent.
- [ ] `GET /v1/views/records`.
- [ ] `POST /v1/capacity` and `GET /v1/capacity/{week}`.
- [ ] Link create/remove routes have a stable identifier contract.
- [ ] End-of-day and weekly review routes.
- [ ] Filtered system log route.
- [ ] One-card history route.
- [ ] Process health and backend-readiness route.
- [ ] The checked-in API schema matches every implemented route and error form.
- [ ] Route tests prove invalid requests change no data.

## 8. Five-machine rule gates

### State and Constraint

- [ ] Captured, Ready, Scheduled, Active, Completed, Verified, Done, Paused,
      Blocked, and Canceled are supported.
- [ ] Ready requires all four front fields.
- [ ] High-priority/high-risk Ready and Blocked work requires a fallback.
- [ ] Schedule requires proof, date, positive duration, capacity, and satisfied
      dependencies.
- [ ] Active enforces dependencies and Single-Active.
- [ ] Completed requires result and actual end.
- [ ] Verified requires result, proof location, and all four completion answers.
- [ ] Blocked requires reason, waiting target, and review date.
- [ ] Regression protects Verified/Done work with live dependents.
- [ ] Failed guards change no domain data and create no success event.
- [ ] Both clients return the same stable guard code and safe message.

### Graph

- [ ] `blocks`, `requires`, `helps`, `produces`, and `excludes` have documented
      meanings and tests.
- [ ] Missing-card, self-link, duplicate-link, and missing-link behavior is stable.
- [ ] Dependency checks and outcome-map queries use Graph Engine results.
- [ ] Every accepted link mutation creates an event with link facts.
- [ ] Map depth/size is bounded.

### Time

- [ ] Week normalization starts Monday.
- [ ] Available capacity subtracts fixed work, meals/travel/transitions, and
      recovery reserve.
- [ ] Schedule limit is 70 percent of available capacity.
- [ ] Scheduled work counts against the correct week.
- [ ] Planned time stays separate from actual time.
- [ ] Fixed-clock, midnight, week-boundary, and applicable DST tests pass.
- [ ] Competing schedules cannot jointly exceed capacity.

### Event Log

- [ ] Every accepted public command makes one event.
- [ ] Events include unique ID, applicable card ID, type, time, actor, request ID,
      and relevant old/new facts.
- [ ] Event and mutation commit in one transaction.
- [ ] Failed commands never make success events.
- [ ] One-card history and bounded filtered-system-log queries pass.
- [ ] Secret/proof content is excluded from logs unless explicitly permitted.

## 9. Adapter contract and equivalence

- [ ] A repository/adapter protocol is explicit and documented.
- [ ] SQLite passes the shared repository contract tests.
- [ ] An in-memory test adapter passes the same contract tests.
- [ ] Create, update, move, guard fault, dependency, capacity, Single-Active,
      completion, view, log, date/time, and ID results are equivalent across
      both adapters.
- [ ] Swapping the adapter requires no client or route rule changes.
- [ ] Backend-only fields do not alter public responses.
- [ ] Backend outage/fault translation is safe and stable.

## 10. Two-client consistency and concurrency

- [ ] Both clients pass the complete shared client-contract suite.
- [ ] A create/update/move from client A is immediately readable from client B.
- [ ] Both clients agree on state, plan, proof, and dependency facts.
- [ ] Mutable objects expose a version or equivalent conflict token.
- [ ] A stale update returns conflict and changes no data.
- [ ] The client can refresh and retry after conflict.
- [ ] Same-actor/same-key create retry makes one commitment and event.
- [ ] Same-actor/same-key move retry makes one move and event.
- [ ] Capacity and link retries have tested, documented behavior.
- [ ] One actor cannot reuse another actor's idempotency record.
- [ ] Idempotency retention and cleanup are documented and tested.
- [ ] Race tests cover Single-Active, capacity, proof-index creation, and link
      creation.
- [ ] Client disconnect/time-out has a request-status or safe-retry recovery path.

## 11. User, tenant, and integration boundary

- [ ] Single-user actor/trusted-system identity rules are documented.
- [ ] Anonymous access is disabled or explicitly limited.
- [ ] Owner and actor meanings are separate.
- [ ] Access checks run before protected proof/log reads and writes.
- [ ] Denied access changes no data and emits only safe audit information.
- [ ] Multi-user authorization items are marked `N/A` with the single-user reason,
      or fully implemented and tested.
- [ ] Multi-tenant items are marked `N/A` with the single-tenant reason, or fully
      implemented and tested.
- [ ] Every selected integration has source-of-truth, ID mapping, timezone,
      retry, duplicate prevention, rate/load limit, timeout, partial-failure,
      and secret-handling rules.
- [ ] Unselected calendar integration is marked `N/A`, or all calendar boundary
      tests pass.

## 12. Data lifecycle

- [ ] Schema has an explicit version.
- [ ] Every schema change has an idempotent migration.
- [ ] Migration test upgrades a prior-release database copy.
- [ ] Failed migration leaves a known recoverable state.
- [ ] Old card IDs, logs, and proof rows remain valid after upgrade.
- [ ] API/data/client release order is documented.
- [ ] Rollback or forward-fix procedure is tested.
- [ ] Export schema/version is documented.
- [ ] Export retains commitments, IDs, links, capacity, required history facts,
      and proof-location references.
- [ ] Import validates schema, duplicate IDs, states, and links.
- [ ] Failed import writes no partial live data.
- [ ] Export/import round trip answers the same required PES questions.
- [ ] Secrets are excluded from default export.

## 13. Security and privacy

- [ ] Request-body, text-field, proof-field, list-page, log, and map-size limits
      are documented and tested.
- [ ] SQL injection and unsafe log-control-text tests pass.
- [ ] HTTP errors contain no traceback, SQL, path, key, token, or secret.
- [ ] Secrets come from the approved runtime source and are absent from source,
      tests, proof artifacts, logs, and metrics.
- [ ] Localhost-only default is tested.
- [ ] Protected transport is required and documented for non-localhost use.
- [ ] Dependency versions and vulnerability-check command are recorded.
- [ ] Backup files receive live-data-equivalent access controls.

## 14. Health, trace, metrics, and retention

- [ ] Health reports process and backend readiness without secrets.
- [ ] Every request has a request/trace ID.
- [ ] Command and fault logs contain safe command/result codes.
- [ ] One trace follows client → route → engine → adapter → event ID.
- [ ] Metrics count commands, guard rejections, faults, backend faults, and
      request duration without personal/proof data.
- [ ] Log, event, idempotency, proof, and backup retention rules are documented.

## 15. Performance and overload

Record targets before testing:

- [ ] Target users: ______
- [ ] Target commitments: ______
- [ ] Target links: ______
- [ ] Target events: ______
- [ ] Target request rate: ______
- [ ] Command latency target: ______
- [ ] View latency target: ______

Then prove:

- [ ] Normal-size and target-size datasets meet the targets.
- [ ] Log and map queries remain bounded.
- [ ] Slow clients do not hold domain transactions open.
- [ ] SQLite lock/busy behavior is configured and tested.
- [ ] Overload returns a controlled result without data damage.

## 16. Fault, backup, and recovery

- [ ] Invalid input and guard failure change no data.
- [ ] API restart retains all committed data.
- [ ] Backend outage returns a controlled fault.
- [ ] Timed-out commands have a safe retry/status path.
- [ ] Adapter fault rolls back command and event.
- [ ] Event-write fault rolls back domain mutation.
- [ ] State-write fault creates no success event.
- [ ] Service recovers after backend return.
- [ ] Backup command and storage location are documented.
- [ ] Restore is tested against non-live data and dated proof is retained.
- [ ] Restore preserves Single-Active, IDs, links, events, and proof rows.
- [ ] Recovery does not duplicate commitments, events, or proof rows.

## 17. Automated acceptance and comparison

- [ ] Core, state, constraint, graph, time, event, command, query, route, schema,
      adapter, client, multi-client, idempotency, concurrency, access, migration,
      import/export, recovery, security, and performance suites pass.
- [ ] AT-001 through AT-015 pass through every applicable selected client.
- [ ] AT-001 through AT-015 pass against SQLite and the in-memory adapter.
- [ ] One real or canonical commitment answers all nine mandatory questions
      identically through both clients.
- [ ] Path A/control and Path E use the same card IDs on the comparison dataset.
- [ ] Both paths permit/reject the same transitions and enforce the same Ready,
      Single-Active, capacity, dependency, block, proof, and Records rules.
- [ ] Full suite exits zero:

      python -m pytest -p no:cacheprovider -q

## 18. Same-session operational smoke

This replaces only the elapsed two-week clock; it does not waive the behaviors.
Run on non-live data and retain API, database, event, trace, and restore proof.

- [ ] Start the Path E service with the release configuration.
- [ ] Use both selected clients.
- [ ] Create at least 20 commitments through the Engine/API.
- [ ] Move at least 10 commitments through the full lifecycle.
- [ ] Create at least three dependency links.
- [ ] Exercise one Blocked card with review date and one fallback action.
- [ ] Set capacity for two distinct weeks.
- [ ] Produce one capacity rejection and one Single-Active rejection.
- [ ] Verify proof before every tested Done move.
- [ ] Run at least one end-of-day and one weekly review through each supporting
      client.
- [ ] Change data through client A and read it through client B.
- [ ] Produce and recover from one stale-data conflict.
- [ ] Retry one write and prove no duplicate commitment/event.
- [ ] Restart the API and prove committed data remains.
- [ ] Backup and restore non-live data.
- [ ] Retrieve full event history for one commitment.
- [ ] Retrieve proof for every completed smoke result.
- [ ] Record all client, route, adapter, and rule friction.

## 19. Operations and release record

- [ ] Engine boundary and five-machine architecture are documented.
- [ ] Public command, query, API, adapter, client-extension, access, migration,
      import/export, backup/restore, recovery, trace, release, and rollback
      procedures are documented.
- [ ] One command starts the local service: `pes-path-e`.
- [ ] One command runs the full suite.
- [ ] One command checks schema/migration status.
- [ ] Configuration defaults are safe.
- [ ] Release client, backend, schema, engine, and API versions are fixed.
- [ ] No open fault can bypass a guard, lose proof, create two Active cards,
      corrupt data, or split client truth.
- [ ] Complete diff is reviewed and `git diff --check` passes.
- [ ] Release commit/tag and proof folder are recorded.

## 20. Technical Closure sign-off

Mark **Path E Technical Closure: DONE** only when sections 2–19 are complete.

```text
Path E Technical Closure:  NOT DONE / DONE
Official Path E Done:       NOT DONE (two-week field test excluded)
Engine version:
API version:
Schema version:
Selected backend/version:
Selected client 1/version:
Selected client 2/version:
User model:
Tenant model:
Time unit/timezone:
Performance targets:
Full test command:
Full test result/date:
Git commit/tag:
API schema proof:
Adapter equivalence proof:
Multi-client proof:
Concurrency proof:
Security proof:
Performance proof:
Backup/restore proof:
Same-session smoke proof:
Proof folder:
Open faults:
Approved by:
```

## 21. Explicitly excluded gate

The following master-checklist item is not required for this Technical Closure:

- Run Path E with real work for two elapsed weeks.

After Technical Closure, complete the original `pes protocol start --path E`
operational run. Only then evaluate the master checklist's official **Path E
Done** gate.
