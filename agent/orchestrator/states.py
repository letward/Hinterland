"""Hinterland Agent-Orchestrator — Zustandsmaschine.

Definiert alle zulässigen Aufgaben-Zustände und erlaubte Übergänge.
"""

from __future__ import annotations

from enum import Enum, auto


class TaskState(Enum):
    QUEUED = auto()
    ANALYZING = auto()
    IMPLEMENTING = auto()
    PULL_REQUEST_CREATED = auto()
    CI_VALIDATION = auto()
    MERGE_ELIGIBLE = auto()
    MERGED = auto()
    RELEASE_BUILD = auto()
    RELEASE_PUBLISHED = auto()
    FAILED = auto()
    NEEDS_REVIEW = auto()


# Gerichtete, erlaubte Übergänge: von -> Menge(zu)
ALLOWED_TRANSITIONS: dict[TaskState, set[TaskState]] = {
    TaskState.QUEUED: {TaskState.ANALYZING, TaskState.FAILED, TaskState.NEEDS_REVIEW},
    TaskState.ANALYZING: {TaskState.IMPLEMENTING, TaskState.FAILED, TaskState.NEEDS_REVIEW},
    TaskState.IMPLEMENTING: {TaskState.PULL_REQUEST_CREATED, TaskState.FAILED, TaskState.NEEDS_REVIEW},
    TaskState.PULL_REQUEST_CREATED: {TaskState.CI_VALIDATION, TaskState.FAILED, TaskState.NEEDS_REVIEW},
    TaskState.CI_VALIDATION: {TaskState.MERGE_ELIGIBLE, TaskState.FAILED, TaskState.NEEDS_REVIEW},
    TaskState.MERGE_ELIGIBLE: {TaskState.MERGED, TaskState.FAILED, TaskState.NEEDS_REVIEW},
    TaskState.MERGED: {TaskState.RELEASE_BUILD, TaskState.FAILED, TaskState.NEEDS_REVIEW},
    TaskState.RELEASE_BUILD: {TaskState.RELEASE_PUBLISHED, TaskState.FAILED, TaskState.NEEDS_REVIEW},
    TaskState.RELEASE_PUBLISHED: {TaskState.FAILED, TaskState.NEEDS_REVIEW},
    TaskState.FAILED: {TaskState.QUEUED, TaskState.NEEDS_REVIEW},  # begrenzte Wiederholung
    TaskState.NEEDS_REVIEW: {TaskState.QUEUED, TaskState.FAILED},
}


def is_valid_transition(from_state: TaskState, to_state: TaskState) -> bool:
    """Prüft, ob ein Zustandsübergang nach den Regeln erlaubt ist."""
    return to_state in ALLOWED_TRANSITIONS.get(from_state, set())


def terminal_states() -> set[TaskState]:
    """Zustände, aus denen keine weiteren automatischen Übergänge erfolgen."""
    return {TaskState.RELEASE_PUBLISHED, TaskState.FAILED, TaskState.NEEDS_REVIEW}
