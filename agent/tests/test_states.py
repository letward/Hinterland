"""Tests für die Zustandsmaschine des Agent-Orchestrators."""

import unittest

from agent.orchestrator.states import TaskState, is_valid_transition, terminal_states


class TestStates(unittest.TestCase):
    def test_allowed_transitions(self):
        self.assertTrue(is_valid_transition(TaskState.QUEUED, TaskState.ANALYZING))
        self.assertTrue(is_valid_transition(TaskState.ANALYZING, TaskState.IMPLEMENTING))
        self.assertTrue(is_valid_transition(TaskState.IMPLEMENTING, TaskState.PULL_REQUEST_CREATED))
        self.assertTrue(is_valid_transition(TaskState.PULL_REQUEST_CREATED, TaskState.CI_VALIDATION))
        self.assertTrue(is_valid_transition(TaskState.CI_VALIDATION, TaskState.MERGE_ELIGIBLE))
        self.assertTrue(is_valid_transition(TaskState.MERGE_ELIGIBLE, TaskState.MERGED))
        self.assertTrue(is_valid_transition(TaskState.MERGED, TaskState.RELEASE_BUILD))
        self.assertTrue(is_valid_transition(TaskState.RELEASE_BUILD, TaskState.RELEASE_PUBLISHED))

    def test_disallowed_transitions(self):
        self.assertFalse(is_valid_transition(TaskState.QUEUED, TaskState.RELEASE_PUBLISHED))
        self.assertFalse(is_valid_transition(TaskState.MERGED, TaskState.ANALYZING))
        self.assertFalse(is_valid_transition(TaskState.RELEASE_PUBLISHED, TaskState.MERGED))

    def test_failed_can_retry_or_review(self):
        self.assertTrue(is_valid_transition(TaskState.FAILED, TaskState.QUEUED))
        self.assertTrue(is_valid_transition(TaskState.FAILED, TaskState.NEEDS_REVIEW))

    def test_terminal_states(self):
        self.assertIn(TaskState.RELEASE_PUBLISHED, terminal_states())
        self.assertIn(TaskState.FAILED, terminal_states())
        self.assertIn(TaskState.NEEDS_REVIEW, terminal_states())
        self.assertNotIn(TaskState.QUEUED, terminal_states())


if __name__ == "__main__":
    unittest.main()
