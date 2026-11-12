"""Run the actual opt-in script with synthetic console and transport boundaries."""
import contextlib
import importlib.util
import io
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from backend.provider import ProviderService, ProviderError


class LiveEntryTests(unittest.TestCase):
    def test_script_binds_student_and_assignment_before_real_request_boundary(self):
        root = Path(__file__).resolve().parents[1]
        fixtures = root / '.qa-temp/agent-history/1794473690001'
        if not (fixtures / 'fixtures.json').exists():
            self.skipTest('prior isolated two-assignment fixture not available')
        spec = importlib.util.spec_from_file_location('live_entry_test', root / 'scripts/verify-history-live.py')
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        fixture = json.loads((fixtures / 'fixtures.json').read_text('utf-8'))
        reached = []
        original_chat = ProviderService.chat

        def observe_chat(provider, payload):
            self.assertEqual(payload.student_id, fixture['student']['id'])
            self.assertEqual(payload.assignment_id, fixture['new']['assignment_id'])
            self.assertEqual(payload.subject, 'math')
            reached.append(payload.student_id)
            return original_chat(provider, payload)

        def stop_at_boundary(*_):
            raise ProviderError('SYNTHETIC_REQUEST_BOUNDARY_NO_NETWORK')

        with tempfile.TemporaryDirectory() as temporary:
            module.ROOT = Path(temporary)
            with patch('sys.argv', ['verify-history-live.py', '--prompt-key']), \
                 patch.object(module, 'secure_console', return_value=True), \
                 patch.object(module.getpass, 'getpass', return_value='synthetic-entry-only'), \
                 patch.object(ProviderService, 'chat', observe_chat), \
                 patch.object(ProviderService, '_request', stop_at_boundary), \
                 contextlib.redirect_stdout(io.StringIO()):
                # Skill file remains source-readable, but all writes are isolated.
                skill = module.ROOT / 'skills/math-error-review'
                skill.mkdir(parents=True)
                (skill / 'SKILL.md').write_bytes((root / 'skills/math-error-review/SKILL.md').read_bytes())
                self.assertEqual(module.main(), 1)
            result = json.loads(next(module.ROOT.glob('.qa-temp/history-live/*/result.json')).read_text('utf-8'))
            self.assertIn('SYNTHETIC_REQUEST_BOUNDARY', result['reason'])
            self.assertEqual(result['external_calls'], 1)  # Observed attempt, synthetic boundary only.
            self.assertTrue(result['formal_files_unchanged'])
            self.assertTrue(result['source_fixture_unchanged'])
        self.assertEqual(reached, [fixture['student']['id']])
