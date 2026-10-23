"""Tests für das Task-Modell (Erstellung, Übergänge, Retry-Limit, Policy)."""

import unittest

from agent.orchestrator.states import TaskState
from agent.orchestrator.task import Task, RiskLevel
from agent.orchestrator.policy import Policy


class TestTask(unittest.TestCase):
    def test_create_defaults_to_queued(self):
        t = Task.create("Titel", "Beschreibung", "github:issue")
        self.assertEqual(t.state, TaskState.QUEUED)
        self.assertEqual(t.risk_level, RiskLevel.MEDIUM)
        self.assertEqual(t.retry_count, 0)
        self.assertIsNotNone(t.id)

    def test_valid_transition_updates_audit(self):
        t = Task.create("Titel", "Beschreibung", "schedule:nightly")
        t.transition(TaskState.ANALYZING, "agent", "gestartet")
        self.assertEqual(t.state, TaskState.ANALYZING)
        self.assertEqual(len(t.audit), 1)
        self.assertEqual(t.audit[0].actor, "agent")

    def test_invalid_transition_raises(self):
        t = Task.create("Titel", "Beschreibung", "github:issue")
        with self.assertRaises(ValueError):
            t.transition(TaskState.RELEASE_PUBLISHED, "agent", "direkt")

    def test_retry_increments_and_resets_to_queued(self):
        t = Task.create("Titel", "Beschreibung", "github:issue", max_retries=2)
        t.fail("agent", "fehler")
        t.retry("agent", "wiederholung 1")
        self.assertEqual(t.state, TaskState.QUEUED)
        self.assertEqual(t.retry_count, 1)
        t.retry("agent", "wiederholung 2")
        self.assertEqual(t.retry_count, 2)
        with self.assertRaises(ValueError):
            t.retry("agent", "wiederholung 3")

    def test_policy_rejects_forbidden_tools(self):
        t = Task.create("Titel", "Beschreibung", "github:issue", allowed_tools=["publish_release"])
        errors = Policy.validate_task(t)
        self.assertTrue(any("publish_release" in e for e in errors))

    def test_policy_rejects_critical_pr(self):
        self.assertFalse(Policy.may_create_pr(RiskLevel.CRITICAL).allowed)
        self.assertTrue(Policy.may_create_pr(RiskLevel.LOW).allowed)

    def test_policy_never_allows_agent_release(self):
        self.assertFalse(Policy.may_publish_release(RiskLevel.LOW).allowed)
        self.assertFalse(Policy.may_publish_release(RiskLevel.CRITICAL).allowed)


if __name__ == "__main__":
    unittest.main()
