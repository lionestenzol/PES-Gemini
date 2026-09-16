# Path E Status

Technical closure checklist: [PATH_E_TECHNICAL_CLOSURE_CHECKLIST.md](PATH_E_TECHNICAL_CLOSURE_CHECKLIST.md)

## Release choices

- Engine form: both an in-process Python interface and a network service.
- Primary backend: SQLite.
- Selected clients: `InProcessClient` and the versioned HTTP `HTTPClient`.
- API version: `v1`.
- User model: single-user for this release; actor identity is retained in events.
- Tenant model: single-tenant.
- Time representation: existing PES minute durations and ISO date/time fields.

## Implemented software slice

Both clients send commands and queries to `pes.path_e.Engine`. The engine calls
the existing PES state and constraint engines, so clients do not copy state or
guard rules. `SQLiteAdapter` is the persistence boundary. The HTTP service uses
only the Python standard library and binds to localhost by default.

Implemented and tested:

- Create and read commitment contracts.
- Guarded state-move contract.
- Inbox, Ready, Active, Verify, Blocked, and Records views with bounded paging.
- Stable error codes and safe HTTP errors.
- Actor, request ID, and event ID recording.
- Create and move idempotency keys.
- Optimistic stale-write rejection using the public `updated_at` version.
- Atomic state move, Path E event, and idempotency result transaction.
- Identical domain truth and guard errors through in-process and HTTP clients.
- Safe commitment updates that reject direct state patches.
- Capacity set/read commands using the shared Time Engine calculation.
- Link create/remove commands using the shared Graph Engine rules.
- Health, proof, filtered history, and bounded event-log queries.
- A Path E two-week evidence protocol available through `pes protocol`.

Implemented HTTP routes:

- `POST /v1/commitments`
- `GET /v1/commitments/{id}`
- `PATCH /v1/commitments/{id}`
- `POST /v1/commitments/{id}/move`
- `GET /v1/commitments/{id}/history`
- `GET /v1/views/{name}`
- `POST /v1/capacity` and `GET /v1/capacity/{week}`
- `POST /v1/links` and `DELETE /v1/links` with link query keys
- `GET /v1/proof`, `GET /v1/log`, and `GET /v1/health`

## Commands

Start the local API:

    pes-path-e --host 127.0.0.1 --port 8787

Run the focused contract gate:

    python -m pytest -p no:cacheprovider -q tests/test_path_e.py

Run the complete software gate:

    python -m pytest -p no:cacheprovider -q

## Certification status

Path E status: **NOT DONE**.

The initial universal-engine software slice passes, but the Definition of Done
also requires the Control Baseline protocol, the Path E two-week/two-client
field test, remaining schedule/review/map routes, adapter equivalence against the in-memory
test adapter, access/security/load/recovery gates, migration/import/export and
backup proof, and final sign-off evidence. None of those are inferred from unit
tests.
