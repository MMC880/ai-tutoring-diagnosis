import tempfile
import unittest
import zipfile
from unittest.mock import patch
from pathlib import Path

from backend.archive import ArchiveStore
from backend.intake import IntakeService


class OperationsTests(unittest.TestCase):
    def test_backup_verified_empty_target_restore_and_corruption_rejection(self):
        from backend.operations import Operations
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            store = ArchiveStore(root / 'source')
            student = store.resolve_student('虚构A', True)['student']
            intake = IntakeService(store)
            intake.submit('one', '数学作业归档，第3题错', [('p.jpg', b'synthetic-unreadable')], student['id'])
            ops = Operations(intake)
            receipt = ops.backup(root / 'copies')
            self.assertTrue(Path(receipt['path']).is_file())
            self.assertTrue(Path(receipt['path']).name.isascii())
            restored = root / 'restored'
            ops.restore(Path(receipt['path']), restored)
            self.assertEqual(ArchiveStore(restored).list_students()[0]['id'], student['id'])
            self.assertEqual(IntakeService(ArchiveStore(restored)).latest(student['id'], 'math')['questions'], ['3'])
            with self.assertRaises(ValueError):
                ops.restore(Path(receipt['path']), restored)
            bad = root / 'bad.zip'
            with zipfile.ZipFile(bad, 'w') as bundle:
                bundle.writestr('../escape', 'no')
            with self.assertRaises(ValueError):
                ops.restore(bad, root / 'bad-target')
            self.assertFalse((root / 'escape').exists())

    def test_failed_backup_publishes_nothing_and_retry_succeeds(self):
        from backend.operations import Operations
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            ops = Operations(IntakeService(ArchiveStore(root / 'source')))
            with patch.object(ops, 'verify', side_effect=ValueError('injected validation failure')):
                with self.assertRaises(ValueError):
                    ops.backup(root / 'copies')
            self.assertEqual(list((root / 'copies').iterdir()), [])
            receipt = ops.backup(root / 'copies')
            ops.restore(Path(receipt['path']), root / 'restored')
            self.assertTrue((root / 'restored' / 'intake.sqlite3').exists())

    def test_tampered_entry_cannot_restore_or_change_current_data(self):
        from backend.operations import Operations
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            ops = Operations(IntakeService(ArchiveStore(root / 'source')))
            receipt = ops.backup(root / 'copies')
            altered = root / 'altered.zip'
            with zipfile.ZipFile(receipt['path']) as original, zipfile.ZipFile(altered, 'w') as bad:
                for name in original.namelist():
                    bad.writestr(name, b'corrupted' if name == 'intake.sqlite3' else original.read(name))
            with self.assertRaises(ValueError):
                ops.restore(altered, root / 'restored')
            self.assertFalse((root / 'restored').exists())
            with ops.intake._connect() as db:
                self.assertEqual(db.execute('PRAGMA integrity_check').fetchone()[0], 'ok')
