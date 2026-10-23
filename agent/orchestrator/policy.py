"""Hinterland Agent-Orchestrator — Berechtigungs- und Policy-Prüfungen.

Zentrale Stelle für alle Entscheidungen, was ein Agent tun darf. Agents
dürfen diese Regeln nicht selbst ändern.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Final

from .task import Task, RiskLevel


# Regeln, die niemals durch einen Agenten verändert werden dürfen.
POLICY_VERSION: Final[str] = "1.0"

# Maximal zulässige Zeitlimits pro Risikolevel (Sekunden).
MAX_TIME_LIMIT_BY_RISK: Final[dict[str, int]] = {
    RiskLevel.LOW: 3600,        # 1 h
    RiskLevel.MEDIUM: 7200,     # 2 h
    RiskLevel.HIGH: 14400,      # 4 h
    RiskLevel.CRITICAL: 28800,  # 8 h (nur mit menschlicher Freigabe)
}

# Maximal zulässige Retries pro Risikolevel.
MAX_RETRIES_BY_RISK: Final[dict[str, int]] = {
    RiskLevel.LOW: 3,
    RiskLevel.MEDIUM: 2,
    RiskLevel.HIGH: 1,
    RiskLevel.CRITICAL: 0,
}

# Werkzeuge, die niemals für untrusted Aufgaben erlaubt sind.
FORBIDDEN_TOOLS: Final[set[str]] = {
    "publish_release",
    "modify_security_policy",
    "modify_branch_protection",
    "run_on_privileged_runner",
    "write_github_secret",
}

# Kanäle, über die Aufgaben angenommen werden dürfen.
TRUSTED_SOURCES: Final[set[str]] = {
    "github:issue",
    "github:pull_request",
    "schedule:nightly",
    "schedule:security",
    "user:direct",
}


@dataclass(frozen=True)
class PolicyDecision:
    allowed: bool
    reason: str


class Policy:
    """Statische Policy-Prüfung ohne Abhängigkeit von externen Diensten."""

    @staticmethod
    def validate_risk_level(risk_level: str) -> PolicyDecision:
        if risk_level not in {RiskLevel.LOW, RiskLevel.MEDIUM, RiskLevel.HIGH, RiskLevel.CRITICAL}:
            return PolicyDecision(False, f"Ungültiges Risikolevel: {risk_level}")
        return PolicyDecision(True, "ok")

    @staticmethod
    def validate_time_limit(risk_level: str, time_limit_seconds: int) -> PolicyDecision:
        max_limit = MAX_TIME_LIMIT_BY_RISK.get(risk_level)
        if max_limit is None:
            return PolicyDecision(False, f"Unbekanntes Risikolevel: {risk_level}")
        if time_limit_seconds <= 0:
            return PolicyDecision(False, "Zeitlimit muss positiv sein")
        if time_limit_seconds > max_limit:
            return PolicyDecision(
                False,
                f"Zeitlimit {time_limit_seconds}s überschreitet Maximum {max_limit}s für Risikolevel {risk_level}",
            )
        return PolicyDecision(True, "ok")

    @staticmethod
    def validate_max_retries(risk_level: str, max_retries: int) -> PolicyDecision:
        max_allowed = MAX_RETRIES_BY_RISK.get(risk_level, 0)
        if max_retries < 0:
            return PolicyDecision(False, "max_retries darf nicht negativ sein")
        if max_retries > max_allowed:
            return PolicyDecision(
                False,
                f"max_retries {max_retries} überschreitet Maximum {max_allowed} für Risikolevel {risk_level}",
            )
        return PolicyDecision(True, "ok")

    @staticmethod
    def validate_source(source: str) -> PolicyDecision:
        if source not in TRUSTED_SOURCES:
            return PolicyDecision(False, f"Nicht vertrauenswürdige Aufgabenquelle: {source}")
        return PolicyDecision(True, "ok")

    @staticmethod
    def validate_forbidden_tools(allowed_tools: list[str]) -> PolicyDecision:
        forbidden = set(allowed_tools) & FORBIDDEN_TOOLS
        if forbidden:
            return PolicyDecision(
                False,
                f"Verbotene Werkzeuge für Agent: {sorted(forbidden)}",
            )
        return PolicyDecision(True, "ok")

    @staticmethod
    def may_create_pr(risk_level: str) -> PolicyDecision:
        # CRITICAL-Aufgaben dürfen niemals ohne menschliche Freigabe einen PR erstellen.
        if risk_level == RiskLevel.CRITICAL:
            return PolicyDecision(False, "CRITICAL-Aufgaben benötigen menschliche Freigabe für PR-Erstellung")
        return PolicyDecision(True, "ok")

    @staticmethod
    def may_publish_release(risk_level: str) -> PolicyDecision:
        # Releases dürfen niemals allein durch einen Agenten ausgelöst werden.
        return PolicyDecision(False, "Release-Publikation erfordert vertrauenswürdiges Ereignis, nicht nur Agentenbehauptung")

    @staticmethod
    def validate_task(task: Task) -> list[str]:
        """Validiert ein vollständiges Task-Objekt und gibt eine Liste von Fehlern zurück."""
        errors: list[str] = []
        checks = [
            Policy.validate_risk_level(task.risk_level),
            Policy.validate_source(task.source),
            Policy.validate_forbidden_tools(task.allowed_tools),
            Policy.validate_time_limit(task.risk_level, task.time_limit_seconds),
            Policy.validate_max_retries(task.risk_level, task.max_retries),
        ]
        for check in checks:
            if not check.allowed:
                errors.append(check.reason)
        return errors
