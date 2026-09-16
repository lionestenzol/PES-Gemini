import json

import pytest

from pes import database
from pes.database import get_db, init_db
from pes.path_d.service import import_plan, reject_plan, show_run, solve_week, stop_solve


WEEK = "2026-08-03"


@pytest.fixture(autouse=True)
def isolated_db(tmp_path, monkeypatch):
    monkeypatch.setattr(database, "DB_PATH", str(tmp_path / "path-d.db"))
    init_db()
    conn=get_db()
    conn.execute("INSERT INTO capacity(week_of,total_hours,fixed_commitments,meals_travel_transitions,recovery_reserve,available_capacity,schedule_limit) VALUES (?,?,?,?,?,?,?)",(WEEK,40,12,6,6,16,11.2))
    conn.commit(); conn.close()


def card(card_id, duration=60, priority=0, owner="worker", **fields):
    conn=get_db()
    values={"id":card_id,"name":card_id,"state":"Ready","level":"Task","owner":owner,
            "planned_duration":duration,"priority":priority,"risk_level":"Low",
            "current_state_desc":"not done","desired_state_desc":f"{card_id} done",
            "proof_of_completion":"proof","next_physical_action":"work"}
    values.update(fields)
    cols=",".join(values); marks=",".join("?" for _ in values)
    conn.execute(f"INSERT INTO commitments({cols}) VALUES ({marks})",tuple(values.values())); conn.commit(); conn.close()


def link(source,target,kind="blocks"):
    conn=get_db(); conn.execute("INSERT INTO links(from_id,to_id,link_type) VALUES (?,?,?)",(source,target,kind)); conn.commit(); conn.close()


def test_solver_keeps_dependency_order_and_fixed_event_no_overlap():
    card("A",60,90); card("B",60,80); link("A","B")
    conn=get_db(); conn.execute("INSERT INTO fixed_events VALUES (?,?,?,?,?,?)",("MEET","Meeting","2026-08-03","09:00","10:00","worker")); conn.commit(); conn.close()
    result=solve_week(WEEK)
    assert result["status"] == "OPTIMAL" and result["hard_score"] == 0
    blocks={b["card_id"]:b for b in result["blocks"]}
    assert blocks["A"]["end"] <= blocks["B"]["start"] or blocks["A"]["date"] < blocks["B"]["date"]
    assert all(not (b["date"]=="2026-08-03" and b["start"]<"10:00" and b["end"]>"09:00") for b in blocks.values())


def test_capacity_and_priority_leave_lower_value_work_unscheduled():
    conn=get_db(); conn.execute("UPDATE capacity SET schedule_limit=1 WHERE week_of=?",(WEEK,)); conn.commit(); conn.close()
    card("HIGH",60,100); card("LOW",60,1)
    result=solve_week(WEEK)
    assert [b["card_id"] for b in result["blocks"]] == ["HIGH"]
    assert result["unscheduled"][0]["card_id"] == "LOW"


def test_invalid_input_reports_multiple_errors_without_plan_change():
    card("BAD",-5); link("BAD","BAD")
    result=solve_week(WEEK)
    assert result["status"] == "INVALID_INPUT"
    assert any("positive integer" in e for e in result["errors"])
    assert any("self dependency" in e for e in result["errors"])
    conn=get_db(); assert conn.execute("SELECT state FROM commitments WHERE id='BAD'").fetchone()[0] == "Ready"; conn.close()


def test_atomic_import_records_history_and_does_not_change_actual_fields():
    card("A",60,10); result=solve_week(WEEK)
    assert import_plan(result["run_id"]) == 1
    conn=get_db(); row=conn.execute("SELECT state,schedule_status,planned_date,actual_start,result FROM commitments WHERE id='A'").fetchone()
    assert tuple(row) == ("Scheduled","scheduled",result["blocks"][0]["date"],None,None)
    assert conn.execute("SELECT COUNT(*) FROM plan_history WHERE run_id=?",(result["run_id"],)).fetchone()[0] == 1
    assert conn.execute("SELECT COUNT(*) FROM log WHERE note=?",(f"Path D solve {result['run_id']}",)).fetchone()[0] == 1
    conn.close()


def test_stale_import_and_rejected_proposal_change_no_plan():
    card("A"); stale=solve_week(WEEK)
    conn=get_db(); conn.execute("UPDATE commitments SET priority=99 WHERE id='A'"); conn.commit(); conn.close()
    with pytest.raises(ValueError,match="stale input"): import_plan(stale["run_id"])
    fresh=solve_week(WEEK); reject_plan(fresh["run_id"])
    with pytest.raises(ValueError,match="closed"): import_plan(fresh["run_id"])
    conn=get_db(); assert conn.execute("SELECT state FROM commitments WHERE id='A'").fetchone()[0] == "Ready"; conn.close()


def test_what_if_is_saved_but_cannot_be_imported():
    card("A",60)
    result=solve_week(WEEK,what_if={"capacity":{"schedule_limit":0}})
    assert result["blocks"] == [] and show_run(result["run_id"])["run_id"] == result["run_id"]
    with pytest.raises(ValueError,match="what-if"): import_plan(result["run_id"])


def test_import_independently_rejects_tampered_overlap_atomically():
    card("A",60); card("B",60); result=solve_week(WEEK)
    output=show_run(result["run_id"])
    output["blocks"][1].update({"date":output["blocks"][0]["date"],"start":output["blocks"][0]["start"],"end":output["blocks"][0]["end"]})
    conn=get_db(); conn.execute("UPDATE solver_runs SET output_json=? WHERE run_id=?",(json.dumps(output),result["run_id"])); conn.commit(); conn.close()
    with pytest.raises(ValueError,match="PES guards"): import_plan(result["run_id"])
    conn=get_db(); assert [r[0] for r in conn.execute("SELECT state FROM commitments ORDER BY id")] == ["Ready","Ready"]; assert conn.execute("SELECT COUNT(*) FROM plan_history").fetchone()[0] == 0; conn.close()


def test_earliest_start_and_hard_deadline_bound_the_block():
    card("WINDOW",60,earliest_start="2026-08-04T13:00",deadline="2026-08-04T15:00")
    result=solve_week(WEEK); block=result["blocks"][0]
    assert block["date"] == "2026-08-04"
    assert block["start"] >= "13:00" and block["end"] <= "15:00"


def test_impossible_pinned_facts_return_clear_no_solution():
    card("A",60,state="Scheduled",pinned=1,planned_date="2026-08-03",planned_start="09:00")
    card("B",60,state="Scheduled",pinned=1,planned_date="2026-08-03",planned_start="09:00")
    result=solve_week(WEEK)
    assert result["status"] == "INFEASIBLE" and not result["feasible"]
    assert result["hard_score"] == -1 and result["errors"] == ["no feasible schedule"]


def test_user_stop_request_returns_clearly_marked_best_plan():
    for index in range(20): card(f"T-{index:02}",60,index)
    initial=solve_week(WEEK)
    conn=get_db(); conn.execute("UPDATE solver_runs SET status='RUNNING' WHERE run_id=?",(initial["run_id"],)); conn.commit(); conn.close()
    stop_solve(initial["run_id"])
    stopped=solve_week(WEEK,time_limit=30,run_id=initial["run_id"])
    assert stopped["status"] == "STOPPED" and stopped["stopped_by_user"]
    assert stopped["feasible"] and stopped["blocks"]


def test_replan_prefers_existing_approved_time_when_valid():
    card("OLD",60,10,state="Scheduled",planned_date="2026-08-03",planned_start="09:00")
    card("NEW",60,10)
    result=solve_week(WEEK)
    old=next(block for block in result["blocks"] if block["card_id"] == "OLD")
    assert (old["date"],old["start"]) == ("2026-08-03","09:00")


def test_target_size_returns_valid_plan_within_limit():
    for index in range(50): card(f"P-{index:03}",30,index % 5,owner=f"R-{index % 5}")
    result=solve_week(WEEK,time_limit=10,seed=7)
    assert result["feasible"] and result["solve_time_ms"] <= 10_500
    assert len({block["card_id"] for block in result["blocks"]}) == len(result["blocks"])


def test_card_scope_excludes_invalid_unrelated_ready_work():
    card("GOOD",60); card("BAD",None)
    result=solve_week(WEEK,card_ids=["GOOD"])
    assert result["feasible"] and [b["card_id"] for b in result["blocks"]] == ["GOOD"]


def test_scoped_proposal_import_rechecks_the_same_scope():
    card("GOOD",60); card("BAD",None)
    result=solve_week(WEEK,card_ids=["GOOD"])
    assert import_plan(result["run_id"]) == 1
    conn=get_db(); assert conn.execute("SELECT state FROM commitments WHERE id='GOOD'").fetchone()[0] == "Scheduled"; conn.close()


def test_path_d_cli_registered():
    from pes.pes_cli import build_parser
    args=build_parser().parse_args(["path-d","solve","--week",WEEK])
    assert args.path_d_action == "solve"
