from pathlib import Path
from icalendar import Calendar, Event
from pes.database import get_db
import datetime


def export_calendar(output, week=None):
    conn = get_db()
    query = "SELECT * FROM commitments WHERE state='Scheduled' AND planned_date IS NOT NULL"
    params = []
    if week:
        day = datetime.date.fromisoformat(week)
        monday = day - datetime.timedelta(days=day.weekday())
        query += " AND planned_date BETWEEN ? AND ?"
        params = [monday.isoformat(), (monday + datetime.timedelta(days=6)).isoformat()]
    rows = conn.execute(query + " ORDER BY planned_date, planned_start", params).fetchall()
    conn.close()
    cal = Calendar()
    cal.add("prodid", "-//PES//Path A//EN")
    cal.add("version", "2.0")
    for row in rows:
        event = Event()
        event.add("uid", f"{row['id']}@pes.local")
        event.add("summary", row["name"])
        event.add("description", f"PES card {row['id']}\n{row['desired_state_desc'] or ''}")
        date = datetime.date.fromisoformat(row["planned_date"])
        if row["planned_start"]:
            start = datetime.datetime.combine(date, datetime.time.fromisoformat(row["planned_start"]))
            event.add("dtstart", start)
            event.add("dtend", start + datetime.timedelta(minutes=row["planned_duration"] or 30))
        else:
            event.add("dtstart", date)
        cal.add_component(event)
    target = Path(output)
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(cal.to_ical())
    return len(rows)
