from argparse import Namespace

from pes.commands import execute


def test_stop_output_is_ascii_safe_on_windows(monkeypatch, capsys):
    monkeypatch.setattr(execute, "move_card", lambda *args, **kwargs: None)
    execute.handle_stop(Namespace(
        id="CARD-1", result="result", proof_location="proof.txt", note="done",
    ))
    output = capsys.readouterr().out
    assert output == "Stopped CARD-1 -> Completed\n"
    assert "→" not in output
