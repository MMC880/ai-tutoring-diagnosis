"""Real current-user Windows encryption, using isolated synthetic credentials only."""
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
import zipfile
from unittest.mock import patch

import httpx
from fastapi.testclient import TestClient

from backend.main import create_app
from backend.provider import ProviderConfig, ProviderService
from backend.provider_store import ProviderStore, StoreError
from backend.archive import ArchiveStore
from backend.intake import IntakeService
from backend.operations import Operations


@unittest.skipUnless(sys.platform == 'win32', 'Windows DPAPI required')
class StoreTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.store = ProviderStore(self.root / 'private' / 'config.dpapi')

    def tearDown(self):
        self.temp.cleanup()

    def service(self, store=None):
        return ProviderService(None, Path('unused'), store=store or self.store)

    def config(self, key='synthetic-only-secret', base='https://example.org/v1'):
        return ProviderConfig(base_url=base, model='test-model', api_key=key)

    def test_real_dpapi_lengths_and_new_process_no_plaintext(self):
        for length in [1, 2560, 2561, 4096]:
            key = 'K' * length
            self.service().configure(self.config(key), remember=True)
            raw = self.store.path.read_bytes()
            if length > 1:
                self.assertNotIn(key.encode(), raw)
            code = ('import json,sys; from pathlib import Path; '
                    'from backend.provider_store import ProviderStore; '
                    'from backend.provider import ProviderService; '
                    'p=ProviderService(None,Path("unused"),store=ProviderStore(Path(sys.argv[1]))); '
                    'assert p._config.api_key == "K"*int(sys.argv[2]); '
                    'assert p.settings()["connection"]=="NOT_TESTED"; '
                    'print(json.dumps(p.settings()))')
            result = subprocess.run([sys.executable, '-X', 'utf8', '-B', '-c', code,
                                     str(self.store.path), str(length)], capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertEqual(json.loads(result.stdout)['storage_status'], 'RESTORED')

    def test_forget_and_memory_mode_remove_previous_saved_item(self):
        p = self.service()
        p.configure(self.config(), remember=True)
        p.configure(self.config('new-memory-only'), remember=False)
        self.assertFalse(self.store.path.exists())
        self.assertFalse(self.service().settings()['key_loaded'])
        p.configure(self.config(), remember=True)
        p.clear()
        self.assertFalse(self.service().settings()['key_loaded'])
        self.assertFalse(self.store.path.exists())

    def test_corrupt_ciphertext_fails_closed_and_is_preserved(self):
        self.service().configure(self.config(), remember=True)
        raw = self.store.path.read_bytes()
        self.store.path.write_bytes(raw[:30] + b'corrupt')
        p = self.service()
        self.assertFalse(p.settings()['key_loaded'])
        self.assertEqual(p.settings()['storage_status'], 'RESTORE_FAILED')
        self.assertTrue(self.store.path.exists())

    def test_failed_replace_keeps_previous_cipher_and_active_config(self):
        p = self.service()
        p.configure(self.config(), remember=True)
        before = self.store.path.read_bytes()
        with patch('backend.provider_store.os.replace', side_effect=PermissionError('private path')):
            with self.assertRaises(StoreError):
                p.configure(self.config('replacement-key'), remember=True)
        self.assertEqual(self.store.path.read_bytes(), before)
        self.assertEqual(p._config.api_key, 'synthetic-only-secret')
        self.assertEqual(list(self.store.path.parent.iterdir()), [self.store.path])

    def test_failed_delete_disables_memory_but_reports_saved_copy(self):
        p = self.service()
        p.configure(self.config(), remember=True)
        with patch.object(self.store, 'delete', side_effect=StoreError('清除失败')):
            with self.assertRaises(StoreError):
                p.clear()
        self.assertFalse(p.settings()['key_loaded'])
        self.assertEqual(p.settings()['storage_status'], 'CLEAR_FAILED')
        self.assertTrue(self.store.path.exists())

    def test_invalid_endpoint_does_not_replace_bound_config(self):
        p = self.service()
        p.configure(self.config(), remember=True)
        before = self.store.path.read_bytes()
        with self.assertRaises(ValueError):
            p.configure(self.config(base='https://localhost/v1'), remember=True)
        self.assertEqual(self.store.path.read_bytes(), before)
        restored = self.service()
        self.assertEqual(restored._config.base_url, 'https://example.org/v1')
        self.assertEqual(restored._config.api_key, 'synthetic-only-secret')

    def test_api_never_returns_key_and_default_app_is_ephemeral(self):
        calls = []
        def transport(request):
            calls.append(request)
            return httpx.Response(200, json={'choices': [{'message': {'content': '晋学智辅连接成功。'}}]})
        def app(store=None):
            return create_app(self.root / 'test.sqlite3', self.root / 'archive',
                              provider_transport=httpx.MockTransport(transport), provider_store=store)
        with TestClient(app(self.store)) as client:
            response = client.post('/api/provider', json={**self.config().model_dump(), 'remember': True})
            self.assertEqual(response.status_code, 200)
            self.assertNotIn('synthetic-only-secret', response.text)
            self.assertTrue(response.json()['config_saved'])
        with TestClient(app(self.store)) as client:
            state = client.get('/api/provider').json()
            self.assertTrue(state['key_loaded'])
            self.assertEqual(calls, [])  # Restore must never contact provider.
            self.assertEqual(client.post('/api/provider/test').status_code, 200)
        with TestClient(app()) as client:
            self.assertFalse(client.get('/api/provider').json()['key_loaded'])
        self.assertEqual(len(calls), 1)
        self.assertFalse(any(b'synthetic-only-secret' in f.read_bytes()
                             for f in (self.root / 'archive').rglob('*') if f.is_file()))

    def test_oversized_and_invalid_schema_fail_closed(self):
        self.store.path.parent.mkdir(parents=True)
        self.store.path.write_bytes(b'x' * 65537)
        with self.assertRaises(StoreError):
            self.store.load()
        with self.assertRaises(StoreError):
            self.store.save({'api_key': 'synthetic-only-secret'})

    def test_student_backup_excludes_credential(self):
        self.service().configure(self.config(), remember=True)
        backup = Operations(IntakeService(ArchiveStore(self.root / 'archive'))).backup(self.root / 'backups')
        with zipfile.ZipFile(backup['path']) as bundle:
            self.assertFalse(any('dpapi' in name or 'provider' in name for name in bundle.namelist()))
            self.assertFalse(any(b'synthetic-only-secret' in bundle.read(name) for name in bundle.namelist()))

    def test_unsupported_crypto_does_not_create_plaintext(self):
        with patch('backend.provider_store.os.name', 'posix'):
            with self.assertRaises(StoreError):
                self.store.save(self.config().model_dump())
        self.assertFalse(self.store.path.exists())


if __name__ == '__main__':
    unittest.main()
