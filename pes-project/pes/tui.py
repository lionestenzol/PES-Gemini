from textual.app import App, ComposeResult
from textual.binding import Binding
from textual.containers import Vertical
from textual.widgets import Footer, Header, Static
from pes.database import get_db
from pes.commands import review
from pes.config import load_config


def daily_text():
    conn = get_db()
    active = conn.execute("SELECT * FROM commitments WHERE state='Active'").fetchall()
    ready = conn.execute(
        "SELECT * FROM commitments WHERE state='Ready' ORDER BY priority DESC, created_at LIMIT 10"
    ).fetchall()
    conn.close()
    lines = ["ACTIVE"]
    lines += [f"{r['id']} {r['name']} -> {r['next_physical_action']}" for r in active] or ["(none)"]
    lines += ["", "READY"]
    lines += [f"{r['id']} {r['name']} -> {r['next_physical_action']}" for r in ready] or ["(none)"]
    return "\n".join(lines)


class PESApp(App):
    TITLE = "PES Daily Command Sheet"
    BINDINGS = [
        Binding("q", "quit", "Quit"), Binding("r", "refresh", "Refresh"),
        Binding("e", "end_day", "End-of-day review"),
        Binding("w", "weekly", "Weekly review"),
    ]

    def compose(self) -> ComposeResult:
        yield Header()
        with Vertical():
            yield Static(daily_text(), id="daily")
            yield Static("E: end-of-day review | W: weekly review", id="status")
        yield Footer()

    def action_refresh(self):
        self.query_one("#daily", Static).update(daily_text())

    def action_end_day(self):
        mode = load_config()["default_mode"]
        review.end_of_day(mode, "Review the Ready queue")
        self.query_one("#status", Static).update(f"End-of-day review recorded ({mode}).")

    def action_weekly(self):
        review.weekly()
        self.query_one("#status", Static).update("Weekly review recorded.")


def main():
    PESApp().run()
