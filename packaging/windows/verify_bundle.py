"""Launch the extracted EXE with no Python in its PATH; all writes are synthetic."""
import hashlib
import json
import os
from pathlib import Path
import socket
import struct
import subprocess
import tempfile
import time
import urllib.request
import zipfile

ROOT = Path(__file__).resolve().parents[2]
ARCHIVE = ROOT / 'docs/delivery/windows-desktop-0.1.0/晋学智辅-Windows-x64-0.1.0.zip'


def report_when(path, process, statuses, timeout=70):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if path.is_file():
            result = json.loads(path.read_text(encoding='utf-8'))
            if result.get('status') in statuses:
                return result
            if result.get('status') in ('ERROR', 'SMOKE_FAILED'):
                raise RuntimeError(result)
        if process.poll() is not None:
            raise RuntimeError('EXE exited before ready: ' + str(process.returncode) + '; report=' + str(path))
        time.sleep(.15)
    raise TimeoutError('EXE readiness timeout; report=' + str(path))


def cleanup_owned(process):
    if process.poll() is None:
        process.terminate()
        process.wait(timeout=15)


def main():
    parent = ROOT / 'app/.qa-temp/windows-package'
    parent.mkdir(parents=True, exist_ok=True)
    run = Path(tempfile.mkdtemp(prefix='native-', dir=parent))
    checks = {}
    with zipfile.ZipFile(ARCHIVE) as z:
        assert z.testzip() is None
        assert all('..' not in Path(name).parts for name in z.namelist())
        z.extractall(run / '中文 程序')
    folder = run / '中文 程序/晋学智辅'
    for line in (folder / 'MANIFEST.sha256').read_text(encoding='utf-8').splitlines():
        digest, name = line.split('  ', 1)
        assert hashlib.sha256((folder / name).read_bytes()).hexdigest() == digest, name
    checks['zip_crc_and_manifest'] = True
    exe = folder / '晋学智辅.exe'
    image = exe.read_bytes()
    pe = struct.unpack_from('<I', image, 0x3c)[0]
    assert image[:2] == b'MZ' and image[pe:pe+4] == b'PE\0\0'
    assert struct.unpack_from('<H', image, pe + 24 + 68)[0] == 2
    checks['real_windows_gui_executable'] = True
    env = os.environ.copy()
    system = env.get('SYSTEMROOT', env.get('WINDIR', 'C:/Windows'))
    for key in ('PYTHONHOME', 'PYTHONPATH', 'VIRTUAL_ENV'):
        env.pop(key, None)
    env.update(SYSTEMROOT=system, WINDIR=system, PATH=str(Path(system) / 'System32') + os.pathsep + system)
    runtime = run / 'runtime.json'
    unused_data = run / '不应创建的资料'
    subprocess.run([str(exe), '--runtime-check', '--data-dir', str(unused_data), '--report', str(runtime)], env=env, cwd=run, timeout=50, check=True)
    info = json.loads(runtime.read_text(encoding='utf-8'))
    assert info['ok'] and info['frozen'] and not unused_data.exists()
    assert Path(info['executable']) == exe
    checks['bundled_runtime_without_python_path'] = True
    checks['readonly_check_does_not_create_store'] = True
    state_path = run / 'smoke.json'
    data = run / '中文 学生资料'
    sibling = run / 'webview' / 'keep.txt'
    sibling.parent.mkdir()
    sibling.write_text('unowned sibling must survive', encoding='utf-8')
    proc = subprocess.Popen([str(exe), '--smoke-test', '--data-dir', str(data), '--report', str(state_path)], env=env, cwd=run)
    try:
        state = report_when(state_path, proc, {'SMOKE_PASSED'})
        duplicate = run / 'duplicate.json'
        second = subprocess.run([str(exe), '--data-dir', str(data), '--report', str(duplicate)], env=env, cwd=run, timeout=20)
        assert second.returncode == 1
        assert json.loads(duplicate.read_text(encoding='utf-8'))['error_type'] == 'DirectoryInUse'
        checks['duplicate_instance_rejected'] = True
        subprocess.run(['node', str(ROOT / 'packaging/windows/snapshot-webview.mjs'), str(state['debug_port']), state['url'], str(run / 'packaged-window.png')], cwd=ROOT, timeout=15, check=True)
        checks['native_webview_screenshot'] = True
        proc.wait(timeout=50)
        assert proc.returncode == 0
        final = json.loads(state_path.read_text(encoding='utf-8'))
        assert final['status'] == 'CLOSED' and final['ok']
        checks.update(final['smoke']['checks'])
        port = int(state['url'].rsplit(':', 1)[1])
        with socket.socket() as sock:
            assert sock.connect_ex(('127.0.0.1', port)) != 0
        checks['closed_window_stops_owned_service'] = True
        assert sibling.read_text(encoding='utf-8') == 'unowned sibling must survive'
        checks['profile_cleanup_preserves_unowned_sibling'] = True
    finally:
        cleanup_owned(proc)
    # A second normal process opens the same synthetic records; cleanup below is
    # explicitly forced, and is not evidence of clicking the native close dialog.
    reopened = run / 'reopened.json'
    proc = subprocess.Popen([str(exe), '--data-dir', str(data), '--report', str(reopened)], env=env, cwd=run)
    try:
        state = report_when(reopened, proc, {'READY'})
        opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
        with opener.open(state['url'] + '/api/bootstrap') as r:
            b = json.load(r)
        assert len(b['students']) == 1 and b['event_count'] == 2
        assert b['students'][0]['ref'] == 'SYN-DESKTOP-A'
        with opener.open(state['url'] + '/api/profiles/' + b['students'][0]['id']) as r:
            profile = json.load(r)
        assert len(profile['retests']) == 1 and len(profile['events']) == 2
        checks['normal_restart_retains_history_and_retest'] = True
    finally:
        cleanup_owned(proc)
    with socket.socket() as sock:
        assert sock.connect_ex(('127.0.0.1', int(state['url'].rsplit(':', 1)[1]))) != 0
    checks['owned_restart_process_cleanup'] = True
    summary = {'ok': all(checks.values()), 'checks': checks, 'run': str(run),
        'clean_windows_without_installed_python': 'NOT_VERIFIED', 'native_close_cancel_dialog_click': 'NOT_VERIFIED',
        'restart_process_cleanup': 'owned synthetic process terminated after read-only verification', 'runtime': info}
    (parent / 'verification.json').write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps({'ok': summary['ok'], 'checks': len(checks), 'run': str(run)}, ensure_ascii=True))


if __name__ == '__main__':
    main()
