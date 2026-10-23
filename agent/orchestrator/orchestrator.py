"""Hinterland Agent-Orchestrator — Hauptsteuerung.

Nimmt Aufgaben aus definierten Quellen an, validiert, priorisiert und führt
sie in isolierten Arbeitsbereichen aus. Keine Abhängigkeit von kostenpflichten
KI-APIs; KI-Modelle sind austauschbare Komponenten.
"""

from __future__ import annotations

import os
import shutil
import uuid
from dataclasses import asdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from .audit import AuditLog
from .policy import Policy
from .states import TaskState, is_valid_transition, terminal_states
from .task import Task, RiskLevel, AuditEntry


class Orchestrator:
    """Zentrale Steuerung aller Agenten-Aufgaben."""

    def __init__(self, work_dir: str | os.PathLike[str] = ".hermes/agent"):
        self.work_dir = Path(work_dir)
        self.work_dir.mkdir(parents=True, exist_ok=True)
        self.audit = AuditLog(self.work_dir / "audit.jsonl")
        self._tasks: dict[str, Task] = {}

    # --------------------------------------------------------------- create

    def create_task(
        self,
        title: str,
        description: str,
        source: str,
        risk_level: str = RiskLevel.MEDIUM,
        allowed_tools: list[str] | None = None,
        permissions: list[str] | None = None,
        time_limit_seconds: int = 3600,
        max_retries: int = 3,
        actor: str = "system",
    ) -> Task:
        task = Task.create(
            title=title,
            description=description,
            source=source,
            risk_level=risk_level,
            allowed_tools=allowed_tools,
            permissions=permissions,
            time_limit_seconds=time_limit_seconds,
            max_retries=max_retries,
        )

        # Policy vor Annahme prüfen
        errors = Policy.validate_task(task)
        if errors:
            task.fail(actor, "; ".join(errors))
            self._persist(task)
            self.audit.append(
                task.id, None, task.state.name, actor, "Aufgabe abgelehnt: " + "; ".join(errors)
            )
            return task

        task.transition(TaskState.ANALYZING, actor, "Aufgabe angenommen und validiert")
        self._persist(task)
        self.audit.append(task.id, TaskState.QUEUED.name, TaskState.ANALYZING.name, actor, "validiert")
        return task

    # --------------------------------------------------------------- execute

    def execute(self, task: Task, actor: str = "agent") -> Task:
        """Führt eine Aufgabe im zugewiesenen, isolierten Arbeitsbereich aus.

        Die tatsächliche Implementierung liegt in spezialisierten Workers.
        Hier wird nur der Zustandsfluss, die Isolation und das Audit gesteuert.
        """
        if task.state == TaskState.FAILED and task.retry_count >= task.max_retries:
            raise ValueError(f"Task {task.id} hat das Retry-Limit erreicht")

        workspace = self._workspace_for(task)
        task.workspace = str(workspace)
        task.branch = f"agent/{task.id[:8]}"

        try:
            task.transition(TaskState.IMPLEMENTING, actor, f"Arbeitsbereich {workspace}")
            self._persist(task)

            # Platzhalter für Worker-Logik (keine KI-API-Anrufe hier).
            # Ein Worker überschreibt _run_worker.
            result = self._run_worker(task, workspace)

            if result.get("ok"):
                task.transition(TaskState.PULL_REQUEST_CREATED, actor, "Änderung implementiert")
                task.result = result
            else:
                task.fail(actor, result.get("error", "unbekannter Fehler"))

        except Exception as exc:  # noqa: BLE001
            task.fail(actor, str(exc))

        self._persist(task)
        return task

    def _run_worker(self, task: Task, workspace: Path) -> dict[str, Any]:
        """Überschrieben von spezialisierten Workers. Standardeinstellung: abgelehnt."""
        return {"ok": False, "error": "kein Worker für diesen Aufgabentyp registriert"}

    # --------------------------------------------------------------- retry

    def retry(self, task: Task, actor: str = "system") -> Task:
        if task.state != TaskState.FAILED:
            raise ValueError(f"Nur fehlgeschlagene Aufgaben können wiederholt werden (aktuell: {task.state.name})")
        if task.retry_count >= task.max_retries:
            raise ValueError(f"Retry-Limit für Task {task.id} erreicht")
        task.retry(actor, f"Wiederholung {task.retry_count}/{task.max_retries}")
        self._persist(task)
        return self.execute(task, actor)

    # --------------------------------------------------------------- helpers

    def _workspace_for(self, task: Task) -> Path:
        safe = "".join(c if c.isalnum() or c in "-_" else "_" for c in task.title.lower())[:40]
        return self.work_dir / "workspaces" / f"{task.id[:8]}-{safe}"

    def _persist(self, task: Task) -> None:
        path = self.work_dir / "tasks" / f"{task.id}.json"
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(__import__("json").dumps(task.to_dict(), indent=2, ensure_ascii=False), encoding="utf-8")

    def get(self, task_id: str) -> Task | None:
        return self._tasks.get(task_id)

    def list_states(self) -> dict[str, int]:
        counts: dict[str, int] = {}
        for task in self._tasks.values():
            counts[task.state.name] = counts.get(task.state.name, 0) + 1
        return counts
