"""Hinterland Agent-Orchestrator — Aufgaben-Modell.

Ein Task ist die zentrale Arbeitseinheit. Er trägt seinen eigenen Zustand,
Risikoklasse, zulässige Werkzeuge, Berechtigungen, Zeitlimits und eine
Historie (Audit-Trail).
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass, field, asdict
from datetime import datetime, timezone
from typing import Any

from .states import TaskState, is_valid_transition


class RiskLevel:
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


ALL_RISK_LEVELS = {RiskLevel.LOW, RiskLevel.MEDIUM, RiskLevel.HIGH, RiskLevel.CRITICAL}


@dataclass
class AuditEntry:
    timestamp: str
    state_from: str | None
    state_to: str
    actor: str
    detail: str

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass
class Task:
    id: str
    title: str
    description: str
    source: str  # z.B. "github:issue", "github:pr", "schedule:nightly"
    state: TaskState = TaskState.QUEUED
    risk_level: str = RiskLevel.MEDIUM
    allowed_tools: list[str] = field(default_factory=list)
    permissions: list[str] = field(default_factory=list)
    time_limit_seconds: int = 3600
    max_retries: int = 3
    retry_count: int = 0
    branch: str | None = None
    workspace: str | None = None
    pr_url: str | None = None
    result: dict[str, Any] | None = None
    created_at: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    updated_at: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    audit: list[AuditEntry] = field(default_factory=list)

    def transition(self, to_state: TaskState, actor: str, detail: str = "") -> None:
        if not is_valid_transition(self.state, to_state):
            raise ValueError(
                f"Ungültiger Übergang {self.state.name} -> {to_state.name} für Task {self.id}"
            )
        from_state = self.state
        self.state = to_state
        self.updated_at = datetime.now(timezone.utc).isoformat()
        self.audit.append(
            AuditEntry(
                timestamp=self.updated_at,
                state_from=from_state.name if from_state else None,
                state_to=to_state.name,
                actor=actor,
                detail=detail,
            )
        )

    def fail(self, actor: str, detail: str = "") -> None:
        self.transition(TaskState.FAILED, actor, detail or "Task fehlgeschlagen")

    def retry(self, actor: str, detail: str = "") -> None:
        if self.retry_count >= self.max_retries:
            raise ValueError(
                f"Task {self.id} hat das Retry-Limit ({self.max_retries}) erreicht"
            )
        self.retry_count += 1
        self.updated_at = datetime.now(timezone.utc).isoformat()
        if self.state != TaskState.QUEUED:
            self.transition(TaskState.QUEUED, actor, detail or f"Wiederholung {self.retry_count}/{self.max_retries}")
        else:
            self.audit.append(
                AuditEntry(
                    timestamp=self.updated_at,
                    state_from=self.state.name,
                    state_to=TaskState.QUEUED.name,
                    actor=actor,
                    detail=detail or f"Wiederholung {self.retry_count}/{self.max_retries}",
                )
            )

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "title": self.title,
            "description": self.description,
            "source": self.source,
            "state": self.state.name,
            "risk_level": self.risk_level,
            "allowed_tools": self.allowed_tools,
            "permissions": self.permissions,
            "time_limit_seconds": self.time_limit_seconds,
            "max_retries": self.max_retries,
            "retry_count": self.retry_count,
            "branch": self.branch,
            "workspace": self.workspace,
            "pr_url": self.pr_url,
            "result": self.result,
            "created_at": self.created_at,
            "updated_at": self.updated_at,
            "audit": [e.to_dict() for e in self.audit],
        }

    @classmethod
    def create(
        cls,
        title: str,
        description: str,
        source: str,
        risk_level: str = RiskLevel.MEDIUM,
        allowed_tools: list[str] | None = None,
        permissions: list[str] | None = None,
        time_limit_seconds: int = 3600,
        max_retries: int = 3,
    ) -> "Task":
        if risk_level not in ALL_RISK_LEVELS:
            raise ValueError(f"Ungültiges Risikolevel: {risk_level}")
        return cls(
            id=str(uuid.uuid4()),
            title=title,
            description=description,
            source=source,
            state=TaskState.QUEUED,
            risk_level=risk_level,
            allowed_tools=allowed_tools or [],
            permissions=permissions or [],
            time_limit_seconds=time_limit_seconds,
            max_retries=max_retries,
        )
