"""Tests für Policy-Prüfungen (Risikolevel, Zeitlimits, Retries, Quellen)."""

import unittest

from agent.orchestrator.task import Task, RiskLevel
from agent.orchestrator.policy import Policy


class TestPolicy(unittest.TestCase):
    def test_valid_task_passes(self):
        t = Task.create("Titel", "Beschreibung", "schedule:nightly", risk_level=RiskLevel.LOW)
        self.assertEqual(Policy.validate_task(t), [])

    def test_invalid_risk_level_rejected(self):
        with self.assertRaises(ValueError):
            Task.create("Titel", "Beschreibung", "github:issue", risk_level="kritisch")

    def test_time_limit_too_high_rejected(self):
        t = Task.create("Titel", "Beschreibung", "github:issue", risk_level=RiskLevel.LOW, time_limit_seconds=999999)
        errors = Policy.validate_task(t)
        self.assertGreater(len(errors), 0)
        self.assertTrue(any("berschreitet" in e for e in errors))

    def test_max_retries_too_high_rejected(self):
        t = Task.create("Titel", "Beschreibung", "github:issue", risk_level=RiskLevel.HIGH, max_retries=5)
        errors = Policy.validate_task(t)
        self.assertGreater(len(errors), 0)
        self.assertTrue(any("berschreitet" in e for e in errors))

    def test_untrusted_source_rejected(self):
        t = Task.create("Titel", "Beschreibung", "unknown:source")
        errors = Policy.validate_task(t)
        self.assertGreater(len(errors), 0)
        self.assertTrue(any("vertrauenswürdig" in e for e in errors))


if __name__ == "__main__":
    unittest.main()
