import io
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import Mock
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from PIL import Image
from store import Store, ValidationError
from files import save_document, get_document
from ai_service import AIService, DEFAULTS
from desktop_backup import BackupBridge
import vision
from photo_progress import photo_progress
from intake import intake_overview
import teaching


class TrialFeedbackTests(unittest.TestCase):
    def test_webp_named_jpg_retains_bytes_and_preview(self):
        with tempfile.TemporaryDirectory() as root:
            raw = io.BytesIO()
            Image.new('RGB', (100, 120), 'white').save(raw, format='WEBP')
            meta = save_document(root, 'wechat.jpg', raw.getvalue())
            self.assertEqual(meta['mime'], 'image/webp')
            self.assertEqual(get_document(root, meta['id'])[1].read_bytes(), raw.getvalue())
            self.assertTrue(vision.preview_document(root, meta['id']).startswith(b'\x89PNG'))
            store=Store(root)
            paper=store.create_paper(dict(student_ref='SYN-WEBP',student_name='合成',batch_id='SYN',title='合成卷',
                documents=[meta],questions=[dict(id='Q01',stem='1+1',answer='2',result='CORRECT')]))
            self.assertEqual(photo_progress(store,paper['id'])['total_images'],1)
            self.assertEqual(intake_overview(store)['batches'][0]['papers'][0]['photo_count'],1)
            duplicate=store.create_paper(dict(student_ref='SYN-WEBP',student_name='合成',batch_id='SYN-2',title='同照片重复登记',
                documents=[meta],questions=[dict(id='Q01',stem='1+1',answer='2',result='CORRECT')]))
            store.confirm(paper['id'],1,True);store.confirm(duplicate['id'],1,True)
            self.assertEqual(store.profile(paper['student_id'])['archive_summary']['duplicate_count'],1)
            webp=save_document(root,'synthetic.webp',raw.getvalue())
            material=teaching.Library(store).create(dict(document_id=webp['id'],title='合成图',kind='教案',scope='数学',edition='SYN'))
            backup=store.backup()
            store.restore(backup['id'],'RESTORE')
            self.assertEqual(teaching.Library(store).get(material['id'])['id'],material['id'])

    def test_png_named_jpg_uses_actual_mime(self):
        with tempfile.TemporaryDirectory() as root:
            raw = io.BytesIO(); Image.new('RGB', (100, 120)).save(raw, format='PNG')
            self.assertEqual(save_document(root, 'wechat.jpg', raw.getvalue())['mime'], 'image/png')

    def test_invalid_image_error_names_file(self):
        with tempfile.TemporaryDirectory() as root:
            with self.assertRaisesRegex(ValidationError, 'broken.jpg'):
                save_document(root, 'broken.jpg', b'not an image')

    def test_connection_status_is_session_specific_and_reset_on_changes(self):
        with tempfile.TemporaryDirectory() as root:
            ai = AIService(Store(root), transport=lambda *args: {'choices': [{'message': {'content': '{"ok":true}'}, 'finish_reason': 'stop'}]})
            self.assertEqual(ai.settings()['connection']['status'], 'NOT_TESTED')
            ai.configure(DEFAULTS | {'api_key': 'synthetic-test-key'})
            job = ai.prepare({'mode': 'probe'}); ai.send(job['id'], True)
            self.assertEqual(ai.settings()['connection']['status'], 'SUCCEEDED')
            ai.configure(DEFAULTS | {'model': 'changed-model'})
            self.assertEqual(ai.settings()['connection']['status'], 'NOT_TESTED')
            ai.reset_after_restore()
            self.assertFalse(ai.settings()['key_loaded'])

    def test_failed_probe_is_not_connected(self):
        with tempfile.TemporaryDirectory() as root:
            def fail(*args): raise TimeoutError('synthetic timeout')
            ai=AIService(Store(root), transport=fail)
            ai.configure(DEFAULTS | {'api_key': 'synthetic-test-key'})
            ai.send(ai.prepare({'mode': 'probe'})['id'], True)
            self.assertNotEqual(ai.settings()['connection']['status'], 'SUCCEEDED')

    def test_backup_cancel_does_not_create_copy(self):
        service=Mock(url='http://127.0.0.1:12345')
        bridge=BackupBridge(service, 'folder')
        bridge._window=Mock(); bridge._window.get_current_url.return_value=service.url
        bridge._window.create_file_dialog.return_value=None
        self.assertTrue(bridge.choose_backup()['cancelled'])
        service.store.backup.assert_not_called()

    def test_backup_copies_to_selected_folder_with_ascii_name(self):
        with tempfile.TemporaryDirectory() as root, tempfile.TemporaryDirectory() as destination:
            service=Mock(url='http://127.0.0.1:12345', store=Store(root))
            bridge=BackupBridge(service, 'folder')
            bridge._window=Mock(); bridge._window.get_current_url.return_value=service.url
            bridge._window.create_file_dialog.return_value=[destination]
            result=bridge.choose_backup()
            self.assertNotIn('error', result)
            path=Path(result['path'])
            self.assertEqual(path.parent, Path(destination).resolve())
            self.assertTrue(path.name.isascii())
            self.assertTrue(path.is_file())

    def test_external_page_cannot_call_backup(self):
        service=Mock(url='http://127.0.0.1:12345')
        bridge=BackupBridge(service, 'folder'); bridge._window=Mock()
        bridge._window.get_current_url.return_value='https://example.com/'
        self.assertIn('error', bridge.choose_backup())
        bridge._window.create_file_dialog.assert_not_called()
        service.store.backup.assert_not_called()
