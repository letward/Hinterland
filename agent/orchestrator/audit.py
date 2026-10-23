"""Hinterland Agent-Orchestrator — Audit-Trail.

Append-only-Protokoll aller Zustandsänderungen und wichtigen Aktionen.
Wird als JSONL-Datei geführt, um nachträgliche Manipulation sichtbar zu machen.
"""

from __future__ import annotations

import json
import os
from dataclasses import asdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from .task import AuditEntry


class AuditLog:
    def __init__(self, path: str | os.PathLike[str]):
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)

    def append(
        self,
        task_id: str,
        state_from: str | None,
        state_to: str,
        actor: str,
        detail: str,
        metadata: dict[str, Any] | None = None,
    ) -> None:
        entry = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "task_id": task_id,
            "state_from": state_from,
            "state_to": state_to,
            "actor": actor,
            "detail": detail,
            "metadata": metadata or {},
        }
        with self.path.open("a", encoding="utf-8") as fh:
            fh.write(json.dumps(entry, ensure_ascii=False) + "\n")

    def read(self) -> list[dict[str, Any]]:
        if not self.path.exists():
            return []
        entries: list[dict[str, Any]] = []
        with self.path.open("r", encoding="utf-8") as fh:
            for line in fh:
                line = line.strip()
                if line:
                    entries.append(json.loads(line))
        return entries

    def entries_for_task(self, task_id: str) -> list[dict[str, Any]]:
        return [e for e in self.read() if e.get("task_id") == task_id]
