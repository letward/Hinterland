"""Hinterland Agent-Workers — Basis-Klasse für isolierte Arbeitsbereiche."""

from __future__ import annotations

from pathlib import Path
from typing import Any

from ..orchestrator.task import Task


class BaseWorker:
    """Führt eine Aufgabe in einem isolierten Arbeitsbereich aus.

    Subklassen implementieren run(). Der Worker darf keine
    Sicherheitsregeln, Statuschecks oder Release-Gates ändern.
    """

    def __init__(self, task: Task, workspace: Path):
        self.task = task
        self.workspace = workspace

    def run(self) -> dict[str, Any]:
        self.workspace.mkdir(parents=True, exist_ok=True)
        try:
            return self._run()
        finally:
            # Arbeitsbereich nach Ausführung aufräumen (Isolation).
            if self.workspace.exists():
                for child in self.workspace.iterdir():
                    if child.is_dir():
                        import shutil
                        shutil.rmtree(child)
                    else:
                        child.unlink()

    def _run(self) -> dict[str, Any]:
        return {"ok": False, "error": "nicht implementiert"}
