"""Windows desktop entry; business data never lives inside the executable bundle."""
import argparse
import ctypes
import importlib.metadata
import json
import os
from pathlib import Path
import socket
import sys
import threading
import tempfile

from server import make_server
from store import Store

DESKTOP_VERSION = '0.1.1'
HERE = Path(__file__).resolve().parent


def default_data_dir(environ=None, home=None):
    environ = os.environ if environ is None else environ
    base = Path(environ['LOCALAPPDATA']) if environ.get('LOCALAPPDATA') else (home or Path.home()) / 'AppData' / 'Local'
    return base / 'JinxueZhifu' / 'data'


class DirectoryInUse(RuntimeError):
    pass


class DataDirectoryLock:
    def __init__(self, root):
        self.root, self.handle = Path(root).resolve(), None

    def __enter__(self):
        self.root.mkdir(parents=True, exist_ok=True)
        self.handle = (self.root / 'server.lock').open('a+b')
        try:
            self.handle.seek(0, 2)
            if not self.handle.tell():
                self.handle.write(b'0')
                self.handle.flush()
            self.handle.seek(0)
            if sys.platform == 'win32':
                import msvcrt
                msvcrt.locking(self.handle.fileno(), msvcrt.LK_NBLCK, 1)
            else:
                import fcntl
                fcntl.flock(self.handle.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        except OSError as exc:
            self.handle.close()
            self.handle = None
            raise DirectoryInUse('晋学智辅已在使用这份资料，请回到已经打开的窗口。未再次启动，也未结束其他程序。') from exc
        return self

    def __exit__(self, *_):
        if self.handle:
            self.handle.close()
            self.handle = None


class DesktopService:
    def __init__(self, data_dir):
        self.data_dir = Path(data_dir).resolve()
        self.lock = DataDirectoryLock(self.data_dir)
        self.server = self.worker = None

    def __enter__(self):
        self.lock.__enter__()
        try:
            self.store = Store(self.data_dir)
            self.server = make_server(self.store, 0)
            # Finish this instance's in-flight requests before releasing its data lock.
            self.server.daemon_threads = False
            self.url = 'http://127.0.0.1:' + str(self.server.server_address[1])
            self.worker = threading.Thread(target=self.server.serve_forever, name='JinxueLocalHTTP', daemon=True)
            self.worker.start()
            (self.data_dir / 'server.json').write_text(json.dumps({'url': self.url, 'mode': 'LOCAL_STORE_EXPLICIT_AI'}), encoding='utf-8')
            return self
        except Exception:
            self.__exit__()
            raise

    def __exit__(self, *_):
        try:
            if self.server:
                if self.worker and self.worker.is_alive():
                    self.server.shutdown()
                    self.worker.join(timeout=5)
                self.server.server_close()
        finally:
            self.server = self.worker = None
            self.lock.__exit__()


def webview2_version():
    if sys.platform != 'win32':
        return None
    import winreg
    for hive in (winreg.HKEY_CURRENT_USER, winreg.HKEY_LOCAL_MACHINE):
        for suffix in ('', 'WOW6432Node\\'):
            try:
                with winreg.OpenKey(hive, 'SOFTWARE\\' + suffix + 'Microsoft\\EdgeUpdate\\Clients') as clients:
                    for i in range(winreg.QueryInfoKey(clients)[0]):
                        with winreg.OpenKey(clients, winreg.EnumKey(clients, i)) as item:
                            try:
                                name, _ = winreg.QueryValueEx(item, 'name')
                                version, _ = winreg.QueryValueEx(item, 'pv')
                                if 'WebView2' in name and version != '0.0.0.0':
                                    return version
                            except OSError:
                                continue
            except OSError:
                continue
    return None


def runtime_report(data_dir):
    packages = {}
    for package in ('pywebview', 'pythonnet', 'python-docx', 'pypdf', 'Pillow'):
        try:
            packages[package] = importlib.metadata.version(package)
        except importlib.metadata.PackageNotFoundError:
            packages[package] = None
    return {'desktop_version': DESKTOP_VERSION, 'frozen': bool(getattr(sys, 'frozen', False)),
            'executable': sys.executable, 'python': sys.version.split()[0], 'packages': packages,
            'resources_ok': all((HERE / 'web' / p).is_file() for p in ('index.html', 'app.js', 'styles.css', 'archive-panel.js')),
            'webview2_version': webview2_version(), 'dotnet_release': dotnet_release(),
            'data_directory': str(Path(data_dir).resolve())}


def dotnet_release():
    if sys.platform != 'win32':
        return 0
    import winreg
    try:
        with winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE, r'SOFTWARE\Microsoft\NET Framework Setup\NDP\v4\Full') as key:
            return int(winreg.QueryValueEx(key, 'Release')[0])
    except OSError:
        return 0


def validate_smoke_dir(root):
    root = Path(root).resolve()
    if root.exists() and (not root.is_dir() or any(root.iterdir())):
        raise ValueError('合成烟测必须使用全新空目录，不能读取或覆盖已有学生资料。')


def parse_options(argv=None):
    parser = argparse.ArgumentParser(description='晋学智辅Windows本地试用版')
    parser.add_argument('--data-dir')
    parser.add_argument('--report', help='显式本机JSON诊断文件，不含密钥或学生作答')
    parser.add_argument('--runtime-check', action='store_true')
    parser.add_argument('--smoke-test', action='store_true', help='仅对显式全新空目录运行合成窗口烟测')
    args = parser.parse_args(argv)
    if args.smoke_test and (not args.data_dir or not args.report):
        raise ValueError('合成烟测须明确指定全新资料目录和报告文件。')
    if args.report and Path(args.report).suffix.lower() != '.json':
        raise ValueError('诊断报告须使用独立的.json文件。')
    return args


def write_report(path, report):
    if path:
        target = Path(path).resolve()
        target.parent.mkdir(parents=True, exist_ok=True)
        temporary = target.with_suffix('.json.tmp')
        temporary.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
        temporary.replace(target)
    elif sys.stdout:
        print(json.dumps(report, ensure_ascii=True))


def create_teacher_window(renderer, url, smoke=False, backup_bridge=None):
    bridge_options = {'js_api': backup_bridge} if backup_bridge is not None else {}
    return renderer.create_window('晋学智辅 · Windows试用版' + (' · 合成自动测试' if smoke else ''), url,
        width=1280, height=820, min_size=(980, 680), text_select=True, zoomable=True,
        confirm_close=not smoke, background_color='#f2f5f6', **bridge_options,
        localization={'global.quitConfirmation': '确定退出晋学智辅？未保存的编辑不会保留，已保存草稿和确认档案不受影响。',
                      'global.ok': '确定', 'global.cancel': '取消', 'global.saveFile': '保存文件'})


def may_close(window):
    try:
        if window.evaluate_js("typeof busy !== 'undefined' && busy"):
            window.evaluate_js("typeof toast === 'function' && toast('正在保存或处理，请完成后再退出。')")
            return False
    except Exception:
        # An unrendered/broken page still needs a way to close its native window.
        pass
    return True


class CloseGuard:
    """Never wait for WebView JavaScript on the native synchronous UI thread."""
    def __init__(self, window):
        self.window = window
        self.lock = threading.Lock()
        self.checking = self.allow_once = False

    def __call__(self):
        with self.lock:
            if self.allow_once:
                self.allow_once = False
                return True
            if self.checking:
                return False
            self.checking = True
        threading.Thread(target=self.check_then_close, name='JinxueCloseCheck', daemon=True).start()
        return False

    def check_then_close(self):
        try:
            if may_close(self.window):
                with self.lock:
                    self.allow_once = True
                # Re-enters the UI closing event, then the native OK/Cancel dialog.
                self.window.destroy()
        finally:
            with self.lock:
                self.checking = False


def show_error(message):
    if sys.platform == 'win32':
        ctypes.windll.user32.MessageBoxW(None, message, '晋学智辅', 0x10)
    elif sys.stderr:
        print(message, file=sys.stderr)


def main(argv=None):
    report_path = None
    try:
        args = parse_options(argv)
        report_path = args.report
        data_dir = Path(args.data_dir).expanduser().resolve() if args.data_dir else default_data_dir().resolve()
        if getattr(sys, 'frozen', False) and data_dir.is_relative_to(Path(sys.executable).resolve().parent):
            raise ValueError('资料目录须在程序文件夹之外，请使用默认本机资料目录。')
        report = runtime_report(data_dir)
        if args.runtime_check:
            report['ok'] = report['resources_ok'] and bool(report['webview2_version']) and report['dotnet_release'] >= 394802
            write_report(report_path, report)
            return 0 if report['ok'] else 1
        if not report['webview2_version']:
            raise RuntimeError('未检测到Microsoft Edge WebView2 Runtime。请通过微软官网安装运行组件后重试：\nhttps://developer.microsoft.com/microsoft-edge/webview2/\n本软件没有静默安装或更改系统设置。')
        if report['dotnet_release'] < 394802:
            raise RuntimeError('需要Microsoft .NET Framework 4.6.2或更高版本。请通过微软官网安装受支持的版本后重试：\nhttps://dotnet.microsoft.com/download/dotnet-framework\n本软件没有静默安装或更改系统设置。')
        if args.smoke_test:
            validate_smoke_dir(data_dir)
        import webview
        webview.settings['ALLOW_DOWNLOADS'] = True
        webview.settings['ALLOW_FILE_URLS'] = False
        webview.settings['OPEN_EXTERNAL_LINKS_IN_BROWSER'] = True
        loaded = threading.Event()
        # pywebview private-mode cleanup can delete this path. It must be newly
        # allocated and owned by this process, never a sibling of student data.
        with DesktopService(data_dir) as service, tempfile.TemporaryDirectory(prefix='JinxueWebView-', ignore_cleanup_errors=True) as profile:
            report.update(url=service.url, pid=os.getpid(), status='STARTING')
            from desktop_backup import BackupBridge
            backup_bridge = BackupBridge(service, webview.FileDialog.FOLDER)
            window = create_teacher_window(webview, service.url, smoke=args.smoke_test, backup_bridge=backup_bridge)
            backup_bridge._window = window
            window.events.loaded += loaded.set
            window.events.closing += CloseGuard(window)
            if args.smoke_test:
                from desktop_smoke import run_smoke, unused_port
                port = unused_port()
                webview.settings['REMOTE_DEBUGGING_PORT'] = port
                report['debug_port'] = port
                callback = lambda: run_smoke(window, loaded, service, report, report_path)
            else:
                def callback():
                    if loaded.wait(30):
                        report.update(status='READY', ok=True)
                        write_report(report_path, report)
            webview.start(callback, gui='edgechromium', debug=False, private_mode=True,
                          storage_path=profile)
        report['status'] = 'CLOSED'
        write_report(report_path, report)
        return 0 if report.get('ok') else 1
    except Exception as exc:
        error = {'ok': False, 'status': 'ERROR', 'error_type': type(exc).__name__, 'error': str(exc)}
        write_report(report_path, error)
        if not report_path:
            show_error(str(exc))
        return 1


if __name__ == '__main__':
    raise SystemExit(main())
