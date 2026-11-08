"""Desktop lifecycle contracts use temporary synthetic directories only."""
import json
from pathlib import Path
import socket
import sys
import tempfile
import threading
import unittest
from unittest.mock import Mock, patch
import urllib.request

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import desktop


class DesktopTests(unittest.TestCase):
    def test_data_directory_is_independent_of_executable(self):
        result = desktop.default_data_dir({'LOCALAPPDATA': 'C:/Users/示例/AppData/Local'})
        self.assertEqual(result, Path('C:/Users/示例/AppData/Local/JinxueZhifu/data'))

    def test_missing_localappdata_uses_home_not_working_directory(self):
        self.assertEqual(desktop.default_data_dir({}, Path('C:/用户')), Path('C:/用户/AppData/Local/JinxueZhifu/data'))

    def test_readonly_runtime_check_does_not_create_student_store(self):
        with tempfile.TemporaryDirectory() as tmp:
            target = Path(tmp) / '尚未创建'
            report = desktop.runtime_report(target)
            self.assertFalse(target.exists())
            self.assertIn('resources_ok', report)
            self.assertNotIn('api_key', report)

    def test_smoke_test_refuses_nonempty_directory(self):
        with tempfile.TemporaryDirectory() as tmp:
            target = Path(tmp)
            (target / 'keep.txt').write_text('do not change')
            with self.assertRaisesRegex(ValueError, '空'):
                desktop.validate_smoke_dir(target)
            self.assertEqual((target / 'keep.txt').read_text(), 'do not change')

    def test_smoke_test_requires_explicit_data_and_report(self):
        with self.assertRaisesRegex(ValueError, '明确'):
            desktop.parse_options(['--smoke-test'])

    def test_directory_lock_blocks_second_owner_and_can_be_reacquired(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp) / '中文 空格资料'
            with desktop.DataDirectoryLock(root):
                with self.assertRaises(desktop.DirectoryInUse):
                    with desktop.DataDirectoryLock(root):
                        self.fail('second owner acquired the lock')
            with desktop.DataDirectoryLock(root):
                self.assertTrue((root / 'server.lock').is_file())

    def test_dynamic_loopback_service_stops_and_retains_saved_records(self):
        with tempfile.TemporaryDirectory() as tmp:
            data = Path(tmp) / '中文 空格资料'
            with desktop.DesktopService(data) as service:
                address = service.url
                port = service.server.server_address[1]
                self.assertEqual(service.server.server_address[0], '127.0.0.1')
                opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
                with opener.open(address + '/api/bootstrap') as r:
                    self.assertEqual(json.load(r)['students'], [])
                paper = service.store.create_paper({'student_ref': 'SYN-DESKTOP', 'student_name': '合成学生', 'batch_id': 'SYN-DESKTOP-01', 'title': '合成作业', 'questions': [{'id': 'Q01', 'stem': '1+1', 'answer': '2', 'result': 'CORRECT'}]})
                self.assertIsNotNone(paper['id'])
                with self.assertRaises(desktop.DirectoryInUse):
                    with desktop.DataDirectoryLock(data):
                        self.fail('active desktop store was not locked')
            with socket.socket() as sock:
                self.assertNotEqual(sock.connect_ex(('127.0.0.1', port)), 0)
            with desktop.DesktopService(data) as reopened:
                self.assertEqual(len(reopened.store.bootstrap()['papers']), 1)

    def test_service_start_failure_releases_lock(self):
        with tempfile.TemporaryDirectory() as tmp:
            with patch.object(desktop, 'make_server', side_effect=RuntimeError('synthetic bind failure')):
                with self.assertRaisesRegex(RuntimeError, 'synthetic'):
                    with desktop.DesktopService(Path(tmp)):
                        pass
            with desktop.DataDirectoryLock(Path(tmp)):
                pass

    def test_native_window_has_chinese_close_warning_and_no_python_bridge(self):
        renderer = Mock()
        window = desktop.create_teacher_window(renderer, 'http://127.0.0.1:12345')
        self.assertIs(window, renderer.create_window.return_value)
        kwargs = renderer.create_window.call_args.kwargs
        self.assertTrue(kwargs['confirm_close'])
        self.assertNotIn('js_api', kwargs)
        self.assertIn('未保存', kwargs['localization']['global.quitConfirmation'])

    def test_busy_window_cannot_close_during_save(self):
        window = Mock()
        window.evaluate_js.return_value = True
        self.assertFalse(desktop.may_close(window))
        window.evaluate_js.return_value = False
        self.assertTrue(desktop.may_close(window))

    def test_missing_webview_runtime_fails_before_creating_store(self):
        with tempfile.TemporaryDirectory() as tmp:
            data, report = Path(tmp) / '学生资料', Path(tmp) / 'diagnostic.json'
            with patch.object(desktop, 'webview2_version', return_value=None), patch.object(desktop, 'Store') as store:
                result = desktop.main(['--data-dir', str(data), '--report', str(report)])
            self.assertEqual(result, 1)
            store.assert_not_called()
            self.assertFalse(data.exists())
            error = json.loads(report.read_text(encoding='utf-8'))
            self.assertIn('Microsoft Edge WebView2 Runtime', error['error'])
            self.assertIn('微软官网', error['error'])

    def test_missing_dotnet_fails_before_creating_store(self):
        with tempfile.TemporaryDirectory() as tmp:
            data, report = Path(tmp) / '学生资料', Path(tmp) / 'diagnostic.json'
            with patch.object(desktop, 'webview2_version', return_value='157.0.0.0'), patch.object(desktop, 'dotnet_release', return_value=0), patch.object(desktop, 'Store') as store:
                self.assertEqual(desktop.main(['--data-dir', str(data), '--report', str(report)]), 1)
            store.assert_not_called()
            self.assertFalse(data.exists())
            self.assertIn('.NET Framework 4.6.2', json.loads(report.read_text(encoding='utf-8'))['error'])

    def test_native_close_checks_javascript_off_ui_thread_and_resets_after_cancel(self):
        ui_thread = threading.get_ident()
        checked, allow_check = threading.Event(), threading.Event()
        closed = threading.Event()
        window = Mock()
        def evaluate(_):
            self.assertNotEqual(threading.get_ident(), ui_thread)
            checked.set()
            allow_check.wait(3)
            return False
        window.evaluate_js.side_effect = evaluate
        guard = desktop.CloseGuard(window)
        def destroy():
            self.assertTrue(guard())  # native second close event can ask OK/Cancel
            closed.set()             # simulated Cancel leaves the window alive
        window.destroy.side_effect = destroy
        self.assertFalse(guard())
        self.assertTrue(checked.wait(2))
        self.assertFalse(guard())  # another click while checking cannot duplicate
        allow_check.set()
        self.assertTrue(closed.wait(3))
        with guard.lock:
            self.assertFalse(guard.allow_once)

    def test_frozen_app_refuses_data_inside_program_folder(self):
        with tempfile.TemporaryDirectory() as tmp:
            program = Path(tmp) / '程序'
            data, report = program / 'data', Path(tmp) / 'diagnostic.json'
            with patch.object(desktop.sys, 'frozen', True, create=True), patch.object(desktop.sys, 'executable', str(program / 'app.exe')), patch.object(desktop, 'Store') as store:
                result = desktop.main(['--data-dir', str(data), '--report', str(report)])
            self.assertEqual(result, 1)
            store.assert_not_called()
            self.assertFalse(data.exists())
            self.assertIn('程序文件夹之外', json.loads(report.read_text(encoding='utf-8'))['error'])


if __name__ == '__main__':
    unittest.main()
