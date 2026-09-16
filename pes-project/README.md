# PES

PES is a commitment execution and control system. Its guarded lifecycle is
Captured, Ready, Scheduled, Active, Completed, Verified, and Done.

The repository supports three runtime paths:

- **Path A** — single-user local operation with Python, SQLite, CLI, and TUI.
- **Path B** — durable local workflow execution through Temporal without Docker.
- **Path C** — team workflow execution through Camunda 8 SaaS without Docker.
- **Path D** — optimized week-plan proposals through OR-Tools CP-SAT.
- **Path E** — shared in-process and HTTP application engine with SQLite.

Use [setup.md](setup.md) for the complete Windows setup and operating guide.
Path B details are in [docs/PATH_B_OPERATIONS.md](docs/PATH_B_OPERATIONS.md).
Path C credentials, deployment, workers, Tasklist, Operate, and recovery are in
[docs/PATH_C_OPERATIONS.md](docs/PATH_C_OPERATIONS.md).
Path D solver rules, scores, review/import, replan, and what-if operation are in
[docs/PATH_D_OPERATIONS.md](docs/PATH_D_OPERATIONS.md).

## Install

PES requires Python 3.10 or later.

    python -m pip install -e .[path-c]
    pes init
    pes --help

The database defaults to ~/.local/share/pes/pes.db. Override it with
PES_DB_PATH.

Install the optional Path D solver with `python -m pip install -e ".[path-d]"`.

## Configuration

PES reads ~/.config/pes/config.toml. Override the path with PES_CONFIG_PATH.
Missing files use safe defaults.

    [pes]
    working_hours = "09:00-17:00"
    default_mode = "Full"
    work_time_unit = 0.25

Valid modes are Full, Reduced, Recovery, Admin, Field, and Review.

## Full control loop

    pes inbox add "Write the project brief"
    pes inbox process 1 --action define --card-id T-001 --name "Write brief" --current "No brief" --desired "Approved brief" --proof "Approved PDF" --next-action "Draft outline"
    pes card move T-001 --to ready
    pes capacity set --week 2026-08-03 --total 40 --fixed 12 --meals 6 --recovery 6
    pes card schedule T-001 --date 2026-08-05 --start 09:00 --duration 60
    pes start T-001
    pes stop T-001 --result "Brief approved" --proof-location "C:\proof\brief.pdf" --note "Approval received"
    pes verify T-001
    pes done T-001
    pes proof show T-001
    pes log --card T-001

## Commands and views

- pes inbox add, list, and process
- pes card define, show, move, list, update, schedule, and unschedule
- pes capacity set and show
- pes start, stop, pause, block, verify, and done
- pes proof list and show
- pes link add and remove; pes map show
- pes day, pes week, and pes queue
- pes view active, verify, blocked, proof, and records
- pes review end-of-day and weekly
- pes repeat CARD_ID
- pes calendar --output schedule.ics
- pes tui or pes-tui
- pes config

Use --help on every command and subcommand for its exact arguments.

## TUI

pes tui opens the Textual daily command sheet. Use R to refresh, E to record an
end-of-day review, W to record a weekly review, and Q to quit. The TUI and CLI
use the same SQLite database and domain functions.

## Calendar export

pes calendar --output schedule.ics optionally accepts --week YYYY-MM-DD. It
exports Scheduled cards without changing PES data. Event UIDs contain permanent
PES card IDs. Repeated exports use the same UID, allowing calendar applications
to apply their update or duplicate behavior.

## Tests

    python -m pytest -p no:cacheprovider -q

The software gate covers Paths A, B, and C: states, guards, schedules, capacity,
dependencies, durable workflows, Camunda resources and workers, logs, proof,
CLI parsing, reviews, repeats, TUI startup, calendar output, configuration, and
clean package installation.

Path D adds proposal-only week optimization. `pes path-d solve` records a scored
proposal; it does not change PES. After review, `pes path-d import RUN-ID`
independently checks the plan and applies it atomically. PES continues to own
execution state, Single-Active, proof, fallback, and history. See
[docs/PATH_D_STATUS.md](docs/PATH_D_STATUS.md) for the certification gap.

## Path C live status

Camunda 8.9 SaaS deployment and a complete Path C lifecycle have been proven
without Docker. Live process `6755399441201688` completed this path:

    Captured -> Ready -> Scheduled -> Active -> Completed -> Verified -> Done

The run exercised Tasklist assignment, API task completion, worker guards,
capacity reservation, the completion DMN, proof storage, monotonic SQLite
projection, audit history, and Operate process completion. The corrected
projection preserves schedule fields and the four proof facts on the PES card.

Quick operating sequence (after loading the Camunda credentials and
`PES_DB_PATH` described in the operations guide):

    pes path-c health
    pes path-c deploy
    pes-camunda-worker
    pes path-c start CARD-ID --name "Name" --current "Current state" --desired "Desired state" --proof "Required proof" --next-action "Next action" --owner "camunda-user-id"
    pes card show CARD-ID
    pes proof show CARD-ID
    pes log --card CARD-ID

Human tasks are claimed and completed in Camunda Tasklist. Operate is used to
inspect paths, variables, retries, and incidents. Camunda owns durable workflow
execution; the PES SQLite database owns the business/query projection.

The software and live single-instance smoke gate pass. Final Path C
Definition-of-Done certification remains open until the required two-week,
two-user operational protocol and the remaining team/failure scenarios have
recorded evidence. See [docs/PATH_C_STATUS.md](docs/PATH_C_STATUS.md).

Never commit Camunda credential exports. Store them outside the repository,
for example under `%LOCALAPPDATA%\PES\secrets`.

Path E release choices and certification gaps are in [docs/PATH_E_STATUS.md](docs/PATH_E_STATUS.md).
The pre-field Definition of Done is [docs/PATH_E_TECHNICAL_CLOSURE_CHECKLIST.md](docs/PATH_E_TECHNICAL_CLOSURE_CHECKLIST.md).
