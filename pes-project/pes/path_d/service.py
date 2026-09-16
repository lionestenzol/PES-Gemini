from __future__ import annotations

import datetime as dt
import hashlib
import json
import time
import uuid
from importlib.metadata import version as package_version
from typing import Any
from zoneinfo import ZoneInfo

from pes.database import get_db


SOLVER_NAME = "OR-Tools CP-SAT"
RULE_SET_VERSION = "path-d-rules-1"
WEIGHT_SET_VERSION = "path-d-weights-1"
TIME_ZONE = "America/Chicago"
TIME_UNIT_MINUTES = 15
WORK_START_MINUTE = 9 * 60
WORK_END_MINUTE = 17 * 60
WEIGHTS = {"scheduled": 10_000, "priority": 100, "risk": 25, "plan_change": 10}
ELIGIBLE_STATES = {"Ready", "Scheduled"}


def _monday(value: str) -> dt.date:
    day = dt.date.fromisoformat(value)
    return day - dt.timedelta(days=day.weekday())


def _canonical(value: Any) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), default=str)


def _snapshot(conn, week_of: str, card_ids: set[str] | None = None) -> dict[str, Any]:
    monday = _monday(week_of)
    capacity = conn.execute("SELECT * FROM capacity WHERE week_of=?", (monday.isoformat(),)).fetchone()
    cards = [dict(row) for row in conn.execute(
        "SELECT * FROM commitments WHERE state IN ('Ready','Scheduled') ORDER BY id"
    ) if card_ids is None or row["id"] in card_ids]
    links = [dict(row) for row in conn.execute(
        "SELECT * FROM links WHERE link_type IN ('blocks','requires','helps','produces','excludes') ORDER BY from_id,to_id,link_type"
    )]
    fixed = [dict(row) for row in conn.execute(
        "SELECT * FROM fixed_events WHERE event_date BETWEEN ? AND ? ORDER BY event_date,start_time,id",
        (monday.isoformat(), (monday + dt.timedelta(days=6)).isoformat()),
    )]
    card_states = {row["id"]: row["state"] for row in conn.execute("SELECT id,state FROM commitments")}
    facts = {
        "week_of": monday.isoformat(), "timezone": TIME_ZONE,
        "time_unit_minutes": TIME_UNIT_MINUTES,
        "capacity": dict(capacity) if capacity else None,
        "commitments": cards, "links": links, "fixed_events": fixed,
        "card_states": card_states,
        "card_scope": sorted(card_ids) if card_ids is not None else None,
        "weights": WEIGHTS, "rule_set_version": RULE_SET_VERSION,
        "weight_set_version": WEIGHT_SET_VERSION,
    }
    facts["input_version"] = hashlib.sha256(_canonical(facts).encode()).hexdigest()
    return facts


def validate_snapshot(snapshot: dict[str, Any]) -> list[str]:
    errors: list[str] = []
    if not snapshot.get("capacity"):
        errors.append(f"capacity is not set for week {snapshot['week_of']}")
    cards = snapshot.get("commitments", [])
    by_id: dict[str, dict] = {}
    for card in cards:
        card_id = str(card.get("id", ""))
        if not card_id:
            errors.append("commitment has no card ID")
        elif card_id in by_id:
            errors.append(f"duplicate card ID: {card_id}")
        by_id[card_id] = card
        duration = card.get("planned_duration")
        if duration is None:
            errors.append(f"{card_id}: planned_duration is required")
        elif not isinstance(duration, int) or duration <= 0:
            errors.append(f"{card_id}: planned_duration must be a positive integer")
        elif duration % TIME_UNIT_MINUTES:
            errors.append(f"{card_id}: duration must use {TIME_UNIT_MINUTES}-minute units")
        for field in ("deadline", "earliest_start", "latest_end"):
            value = card.get(field)
            if value:
                try:
                    dt.datetime.fromisoformat(value)
                except ValueError:
                    errors.append(f"{card_id}: invalid {field}: {value}")
    known = set(snapshot.get("card_states", {}))
    all_db_ids = known
    for link in snapshot.get("links", []):
        source, target = str(link.get("from_id")), str(link.get("to_id"))
        if source == target:
            errors.append(f"invalid self dependency: {source}")
        if not source or not target:
            errors.append("dependency link has a missing card ID")
        for card_id in (source, target):
            if card_id not in known:
                errors.append(f"dependency link references missing card: {card_id}")
    graph = {card_id: [] for card_id in all_db_ids}
    for link in snapshot.get("links", []):
        if link.get("link_type") in ("blocks", "requires"):
            graph.setdefault(str(link["from_id"]), []).append(str(link["to_id"]))
    visiting: set[str] = set(); visited: set[str] = set()
    def visit(node: str) -> bool:
        if node in visiting: return True
        if node in visited: return False
        visiting.add(node)
        if any(visit(child) for child in graph.get(node, [])): return True
        visiting.remove(node); visited.add(node); return False
    if any(visit(node) for node in list(graph) if node not in visited):
        errors.append("dependency cycle detected")
    for event in snapshot.get("fixed_events", []):
        try:
            day = dt.date.fromisoformat(event["event_date"])
            start = dt.time.fromisoformat(event["start_time"])
            end = dt.time.fromisoformat(event["end_time"])
            if end <= start: errors.append(f"{event['id']}: fixed event ends before it starts")
            if not (_monday(snapshot["week_of"]) <= day <= _monday(snapshot["week_of"]) + dt.timedelta(days=6)):
                errors.append(f"{event['id']}: fixed event is outside solve week")
            if not str(event.get("resource", "")).strip(): errors.append(f"{event['id']}: fixed event resource is required")
        except (ValueError, KeyError) as exc:
            errors.append(f"{event.get('id', 'fixed event')}: invalid fixed event: {exc}")
    return sorted(set(errors))


def _minute(week: dt.date, value: str) -> int:
    stamp = dt.datetime.fromisoformat(value)
    if stamp.tzinfo is not None:
        stamp = stamp.astimezone(ZoneInfo(TIME_ZONE)).replace(tzinfo=None)
    return (stamp.date() - week).days * 1440 + stamp.hour * 60 + stamp.minute


def solve_week(week: str, *, time_limit: float = 10.0, seed: int = 1,
               what_if: dict[str, Any] | None = None,
               run_id: str | None = None,
               card_ids: list[str] | None = None) -> dict[str, Any]:
    from ortools.sat.python import cp_model
    conn = get_db()
    try:
        snapshot = _snapshot(conn, week, set(card_ids) if card_ids else None)
        if what_if:
            snapshot = json.loads(json.dumps(snapshot))
            for key, value in what_if.get("capacity", {}).items(): snapshot["capacity"][key] = value
            for card_id, changes in what_if.get("commitments", {}).items():
                card = next((c for c in snapshot["commitments"] if c["id"] == card_id), None)
                if card: card.update(changes)
            snapshot["fixed_events"].extend(what_if.get("add_fixed_events", []))
            removed = set(what_if.get("remove_fixed_event_ids", []))
            snapshot["fixed_events"] = [e for e in snapshot["fixed_events"] if e["id"] not in removed]
            snapshot["input_version"] = hashlib.sha256(_canonical({k:v for k,v in snapshot.items() if k != "input_version"}).encode()).hexdigest()
        errors = validate_snapshot(snapshot)
        run_id = run_id or str(uuid.uuid4())
        _save_run(conn, snapshot, {"run_id":run_id,"status":"RUNNING","errors":[]}, time_limit, seed, bool(what_if))
        if errors:
            result = {"run_id": run_id, "status": "INVALID_INPUT", "errors": errors,
                      "input_version": snapshot["input_version"], "blocks": [], "unscheduled": []}
            _save_run(conn, snapshot, result, time_limit, seed, bool(what_if)); return result
        model = cp_model.CpModel(); monday = _monday(snapshot["week_of"])
        horizon = 7 * 1440
        vars_: dict[str, dict[str, Any]] = {}; resource_intervals: dict[str, list] = {}
        objective = []
        for card in snapshot["commitments"]:
            duration = int(card["planned_duration"])
            allowed = []
            for day in range(5):
                for minute in range(WORK_START_MINUTE, WORK_END_MINUTE - duration + 1, TIME_UNIT_MINUTES):
                    value = day * 1440 + minute
                    if card.get("earliest_start") and value < _minute(monday, card["earliest_start"]): continue
                    limit = card.get("latest_end") or card.get("deadline")
                    if limit and value + duration > _minute(monday, limit): continue
                    allowed.append(value)
            if not allowed:
                allowed = [0]
            start = model.NewIntVarFromDomain(cp_model.Domain.FromValues(allowed), f"start_{card['id']}")
            end = model.NewIntVar(0, horizon, f"end_{card['id']}")
            present = model.NewBoolVar(f"scheduled_{card['id']}")
            model.Add(end == start + duration)
            interval = model.NewOptionalIntervalVar(start, duration, end, present, f"interval_{card['id']}")
            if card.get("pinned") or card.get("time_fixed"):
                if card.get("planned_date") and card.get("planned_start"):
                    pinned = _minute(monday, f"{card['planned_date']}T{card['planned_start']}")
                    model.Add(start == pinned); model.Add(present == 1)
            resource_intervals.setdefault(card.get("owner") or "user", []).append(interval)
            risk = {"Low": 0, "Medium": 1, "High": 2}.get(card.get("risk_level"), 0)
            objective.append(present * (WEIGHTS["scheduled"] + int(card.get("priority") or 0) * WEIGHTS["priority"] + risk * WEIGHTS["risk"]))
            if card.get("state") == "Scheduled" and card.get("planned_date") and card.get("planned_start"):
                old_start = _minute(monday, f"{card['planned_date']}T{card['planned_start']}")
                change = model.NewIntVar(0, horizon, f"change_{card['id']}")
                model.AddAbsEquality(change, start - old_start)
                objective.append(-change * WEIGHTS["plan_change"])
            vars_[card["id"]] = {"start": start, "end": end, "present": present, "duration": duration, "card": card}
        for event in snapshot["fixed_events"]:
            start = _minute(monday, f"{event['event_date']}T{event['start_time']}")
            end = _minute(monday, f"{event['event_date']}T{event['end_time']}")
            resource_intervals.setdefault(event["resource"], []).append(model.NewFixedSizeIntervalVar(start, end-start, f"fixed_{event['id']}"))
        for intervals in resource_intervals.values(): model.AddNoOverlap(intervals)
        model.Add(sum(v["duration"] * v["present"] for v in vars_.values()) <= round(float(snapshot["capacity"]["schedule_limit"]) * 60))
        for link in snapshot["links"]:
            source, target, kind = link["from_id"], link["to_id"], link["link_type"]
            if kind in ("blocks", "requires") and source in vars_ and target in vars_:
                model.Add(vars_[source]["end"] <= vars_[target]["start"]).OnlyEnforceIf([vars_[source]["present"], vars_[target]["present"]])
                model.AddImplication(vars_[target]["present"], vars_[source]["present"])
            if kind == "excludes" and source in vars_ and target in vars_:
                model.Add(vars_[source]["present"] + vars_[target]["present"] <= 1)
        model.Maximize(sum(objective))
        solver = cp_model.CpSolver(); solver.parameters.max_time_in_seconds = time_limit
        solver.parameters.random_seed = seed; solver.parameters.num_search_workers = 1
        class StopCallback(cp_model.CpSolverSolutionCallback):
            def __init__(self): super().__init__(); self.stopped=False
            def on_solution_callback(self):
                check=get_db()
                try: requested=check.execute("SELECT stop_requested FROM solver_runs WHERE run_id=?",(run_id,)).fetchone()
                finally: check.close()
                if requested and requested[0]: self.stopped=True; self.StopSearch()
        callback=StopCallback()
        started = time.perf_counter(); status_code = solver.Solve(model,callback); elapsed = round((time.perf_counter()-started)*1000)
        status_name = solver.StatusName(status_code)
        feasible = status_code in (cp_model.OPTIMAL, cp_model.FEASIBLE)
        blocks = []
        if feasible:
            for card_id, value in vars_.items():
                if solver.Value(value["present"]):
                    start = solver.Value(value["start"]); stamp = dt.datetime.combine(monday, dt.time()) + dt.timedelta(minutes=start)
                    end = stamp + dt.timedelta(minutes=value["duration"])
                    blocks.append({"card_id": card_id, "date": stamp.date().isoformat(), "start": stamp.strftime("%H:%M"),
                                   "end": end.strftime("%H:%M"), "duration": value["duration"],
                                   "owner": value["card"].get("owner") or "user",
                                   "planned_result": value["card"].get("planned_result") or value["card"].get("desired_state_desc")})
        scheduled_ids = {b["card_id"] for b in blocks}
        unscheduled = [{"card_id": c["id"], "reason": "not selected within capacity and hard constraints"} for c in snapshot["commitments"] if c["id"] not in scheduled_ids]
        if callback.stopped: status_name="STOPPED"
        result = {"run_id": run_id, "status": status_name, "feasible": feasible, "hard_score": 0 if feasible else -1,
                  "soft_score": round(solver.ObjectiveValue()) if feasible else None, "best_bound": solver.BestObjectiveBound() if feasible else None,
                  "solve_time_ms": elapsed, "stopped_by_limit": status_name == "FEASIBLE", "stopped_by_user": callback.stopped, "input_version": snapshot["input_version"],
                  "solver": SOLVER_NAME, "solver_version": package_version("ortools"), "blocks": sorted(blocks, key=lambda b:(b["date"],b["start"])),
                  "unscheduled": unscheduled, "errors": [] if feasible else ["no feasible schedule"]}
        _save_run(conn, snapshot, result, time_limit, seed, bool(what_if)); return result
    finally:
        conn.close()


def _save_run(conn, snapshot, result, time_limit, seed, is_what_if):
    conn.execute("INSERT INTO solver_runs(run_id,week_of,input_version,solver_name,solver_version,rule_set_version,weight_set_version,seed,time_limit_seconds,status,hard_score,soft_score,solve_time_ms,stopped_by_limit,is_what_if,input_json,output_json,error) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(run_id) DO UPDATE SET status=excluded.status,hard_score=excluded.hard_score,soft_score=excluded.soft_score,solve_time_ms=excluded.solve_time_ms,stopped_by_limit=excluded.stopped_by_limit,output_json=excluded.output_json,error=excluded.error",
        (result["run_id"], snapshot["week_of"], snapshot["input_version"], SOLVER_NAME, package_version("ortools"), RULE_SET_VERSION, WEIGHT_SET_VERSION, seed, time_limit, result["status"], result.get("hard_score"), result.get("soft_score"), result.get("solve_time_ms"), int(result.get("stopped_by_limit", False)), int(is_what_if), _canonical(snapshot), _canonical(result), "; ".join(result.get("errors", [])) or None))
    conn.commit()


def show_run(run_id: str) -> dict[str, Any]:
    conn=get_db()
    try:
        row=conn.execute("SELECT * FROM solver_runs WHERE run_id=?",(run_id,)).fetchone()
        if not row: raise ValueError(f"solve run not found: {run_id}")
        result=json.loads(row["output_json"] or "{}")
        result["imported_at"]=row["imported_at"]; result["rejected_at"]=row["rejected_at"]
        return result
    finally: conn.close()


def reject_plan(run_id: str) -> None:
    conn=get_db()
    try:
        row=conn.execute("SELECT imported_at FROM solver_runs WHERE run_id=?",(run_id,)).fetchone()
        if not row: raise ValueError(f"solve run not found: {run_id}")
        if row["imported_at"]: raise ValueError("an imported proposal cannot be rejected")
        conn.execute("UPDATE solver_runs SET rejected_at=datetime('now') WHERE run_id=?",(run_id,)); conn.commit()
    finally: conn.close()


def stop_solve(run_id: str) -> None:
    conn=get_db()
    try:
        row=conn.execute("SELECT status FROM solver_runs WHERE run_id=?",(run_id,)).fetchone()
        if not row: raise ValueError(f"solve run not found: {run_id}")
        if row["status"] != "RUNNING": raise ValueError("solve is not running")
        conn.execute("UPDATE solver_runs SET stop_requested=1 WHERE run_id=?",(run_id,)); conn.commit()
    finally: conn.close()


def _validate_proposal(snapshot: dict[str, Any], output: dict[str, Any]) -> list[str]:
    errors: list[str] = []
    cards = {card["id"]: card for card in snapshot["commitments"]}
    blocks = output.get("blocks", [])
    seen: set[str] = set(); intervals: dict[str, list[tuple[dt.datetime,dt.datetime,str]]] = {}
    total = 0
    for block in blocks:
        card_id = block.get("card_id")
        if card_id in seen: errors.append(f"duplicate proposed card: {card_id}")
        seen.add(card_id)
        card = cards.get(card_id)
        if not card: errors.append(f"unknown proposed card: {card_id}"); continue
        try:
            start=dt.datetime.fromisoformat(f"{block['date']}T{block['start']}")
            end=dt.datetime.fromisoformat(f"{block['date']}T{block['end']}")
            duration=int(block["duration"])
            if duration != int(card["planned_duration"]) or end-start != dt.timedelta(minutes=duration): errors.append(f"{card_id}: proposed duration is invalid")
            if start.date() < _monday(snapshot["week_of"]) or start.date() > _monday(snapshot["week_of"])+dt.timedelta(days=4): errors.append(f"{card_id}: proposed outside working week")
            if start.hour*60+start.minute < WORK_START_MINUTE or end.hour*60+end.minute > WORK_END_MINUTE: errors.append(f"{card_id}: proposed outside working hours")
            if card.get("earliest_start") and start < dt.datetime.fromisoformat(card["earliest_start"]): errors.append(f"{card_id}: starts before earliest start")
            limit=card.get("latest_end") or card.get("deadline")
            if limit and end > dt.datetime.fromisoformat(limit): errors.append(f"{card_id}: ends after hard limit")
            intervals.setdefault(block["owner"],[]).append((start,end,card_id)); total += duration
        except (KeyError,ValueError) as exc: errors.append(f"{card_id}: malformed proposed block: {exc}")
    if snapshot.get("capacity") and total > round(float(snapshot["capacity"]["schedule_limit"])*60): errors.append("proposal exceeds PES schedule limit")
    for event in snapshot["fixed_events"]:
        start=dt.datetime.fromisoformat(f"{event['event_date']}T{event['start_time']}"); end=dt.datetime.fromisoformat(f"{event['event_date']}T{event['end_time']}")
        intervals.setdefault(event["resource"],[]).append((start,end,f"fixed:{event['id']}"))
    for resource, values in intervals.items():
        values.sort()
        for left,right in zip(values,values[1:]):
            if left[1] > right[0]: errors.append(f"resource overlap for {resource}: {left[2]} and {right[2]}")
    by_id={b["card_id"]:b for b in blocks if b.get("card_id") in cards}
    for link in snapshot["links"]:
        source,target=link["from_id"],link["to_id"]
        if link["link_type"] in ("blocks","requires") and target in by_id:
            if source in by_id:
                source_end=dt.datetime.fromisoformat(f"{by_id[source]['date']}T{by_id[source]['end']}"); target_start=dt.datetime.fromisoformat(f"{by_id[target]['date']}T{by_id[target]['start']}")
                if source_end > target_start: errors.append(f"dependency order violated: {source} before {target}")
            elif snapshot["card_states"].get(source) not in ("Verified","Done"):
                errors.append(f"unmet dependency: {source} before {target}")
        if link["link_type"] == "excludes" and source in by_id and target in by_id: errors.append(f"excluded cards both scheduled: {source}, {target}")
    return sorted(set(errors))


def import_plan(run_id: str) -> int:
    conn=get_db()
    try:
        conn.execute("BEGIN IMMEDIATE")
        row=conn.execute("SELECT * FROM solver_runs WHERE run_id=?",(run_id,)).fetchone()
        if not row: raise ValueError(f"solve run not found: {run_id}")
        if row["is_what_if"]: raise ValueError("what-if proposal must be solved as a live run before import")
        if row["status"] not in ("OPTIMAL","FEASIBLE","STOPPED"): raise ValueError("only a feasible proposal can be imported")
        if row["imported_at"] or row["rejected_at"]: raise ValueError("proposal is already closed")
        stored_snapshot=json.loads(row["input_json"])
        scope=stored_snapshot.get("card_scope")
        current=_snapshot(conn,row["week_of"],set(scope) if scope is not None else None)
        if current["input_version"] != row["input_version"]: raise ValueError("stale input version; solve again")
        output=json.loads(row["output_json"]); blocks=output["blocks"]
        errors=_validate_proposal(current,output)
        if errors: raise ValueError("proposal failed PES guards: " + "; ".join(errors))
        for block in blocks:
            card=conn.execute("SELECT * FROM commitments WHERE id=?",(block["card_id"],)).fetchone()
            if not card or card["state"] not in ELIGIBLE_STATES: raise ValueError(f"{block['card_id']}: card is no longer schedulable")
        for block in blocks:
            card=conn.execute("SELECT * FROM commitments WHERE id=?",(block["card_id"],)).fetchone()
            old={k:card[k] for k in ("state","schedule_status","planned_date","planned_start","planned_end","planned_duration","planned_result")}
            new={"state":"Scheduled","schedule_status":"scheduled","planned_date":block["date"],"planned_start":block["start"],"planned_end":block["end"],"planned_duration":block["duration"],"planned_result":block["planned_result"]}
            conn.execute("UPDATE commitments SET state='Scheduled',schedule_status='scheduled',planned_date=?,planned_start=?,planned_end=?,planned_duration=?,planned_result=?,updated_at=datetime('now') WHERE id=?",(block["date"],block["start"],block["end"],block["duration"],block["planned_result"],block["card_id"]))
            conn.execute("INSERT INTO plan_history(run_id,card_id,old_plan_json,new_plan_json) VALUES (?,?,?,?)",(run_id,block["card_id"],_canonical(old),_canonical(new)))
            if old["state"] != "Scheduled": conn.execute("INSERT INTO log(card_id,state_from,state_to,note) VALUES (?,?,?,?)",(block["card_id"],old["state"],"Scheduled",f"Path D solve {run_id}"))
        proposed={block["card_id"] for block in blocks}
        snapshot=stored_snapshot
        for item in snapshot["commitments"]:
            if item["id"] in proposed or item["state"] != "Scheduled": continue
            card=conn.execute("SELECT * FROM commitments WHERE id=?",(item["id"],)).fetchone()
            old={k:card[k] for k in ("state","schedule_status","planned_date","planned_start","planned_end","planned_duration","planned_result")}
            new={"state":"Ready","schedule_status":"unscheduled","planned_date":None,"planned_start":None,"planned_end":None,"planned_duration":card["planned_duration"],"planned_result":None}
            conn.execute("UPDATE commitments SET state='Ready',schedule_status='unscheduled',planned_date=NULL,planned_start=NULL,planned_end=NULL,planned_result=NULL,updated_at=datetime('now') WHERE id=?",(item["id"],))
            conn.execute("INSERT INTO plan_history(run_id,card_id,old_plan_json,new_plan_json) VALUES (?,?,?,?)",(run_id,item["id"],_canonical(old),_canonical(new)))
            conn.execute("INSERT INTO log(card_id,state_from,state_to,note) VALUES (?,?,?,?)",(item["id"],"Scheduled","Ready",f"Path D solve {run_id}: left unscheduled"))
        conn.execute("UPDATE solver_runs SET imported_at=datetime('now') WHERE run_id=?",(run_id,)); conn.commit(); return len(blocks)
    except Exception:
        conn.rollback(); raise
    finally: conn.close()
