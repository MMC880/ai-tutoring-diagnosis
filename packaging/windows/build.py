"""Reproducible local Windows build; never packages a data directory or .env."""
import hashlib
import importlib.metadata
import json
from pathlib import Path
import shutil
import subprocess
import sys
import zipfile

ROOT = Path(__file__).resolve().parents[2]
OUTPUT = ROOT / 'docs/delivery/windows-desktop-0.1.1'
DIST = OUTPUT / 'portable'
BUILD = ROOT / '.tools/windows-build/pyinstaller'


def main():
    if sys.platform != 'win32':
        raise SystemExit('Build this Windows artifact on Windows.')
    OUTPUT.mkdir(parents=True, exist_ok=True)
    subprocess.run([sys.executable, '-m', 'PyInstaller', '--noconfirm', '--distpath', str(DIST),
                    '--workpath', str(BUILD), str(ROOT / 'packaging/windows/jinxue.spec')], cwd=ROOT, check=True)
    folder = DIST / '晋学智辅'
    shutil.copyfile(ROOT / 'packaging/windows/USER_GUIDE.md', folder / '使用说明.txt')
    shutil.copyfile(ROOT / 'docs/pilot/TRIAL_FEEDBACK_TEMPLATE.md', folder / '试用问题反馈表.md')
    versions = {d.metadata['Name']: d.version for d in importlib.metadata.distributions()}
    (folder / '构建版本.json').write_text(json.dumps({'desktop_version': '0.1.1', 'python': sys.version.split()[0],
        'packages': versions, 'source_commit': subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip(),
        'source_has_uncommitted_changes': bool(subprocess.check_output(['git', 'status', '--porcelain'], cwd=ROOT, text=True)),
        'data_included': False}, ensure_ascii=False, indent=2), encoding='utf-8')
    licenses = folder / '第三方许可'
    licenses.mkdir(exist_ok=True)
    for distribution in importlib.metadata.distributions():
        for f in distribution.files or []:
            if '.dist-info/' in str(f).replace('\\', '/') and any(k in f.name.lower() for k in ('license', 'copying', 'notice')):
                source = Path(distribution.locate_file(f))
                if source.is_file():
                    name = distribution.metadata['Name'].replace('/', '_') + '-' + f.name
                    shutil.copyfile(source, licenses / name)
    python_license = Path(sys.base_prefix) / 'LICENSE.txt'
    if python_license.is_file():
        shutil.copyfile(python_license, licenses / 'Python-LICENSE.txt')
    files = sorted(p for p in folder.rglob('*') if p.is_file())
    forbidden = [p for p in files if p.suffix.lower() in ('.sqlite3', '.sqlite', '.db', '.log') or p.name.startswith('.env')]
    if forbidden:
        raise RuntimeError('Forbidden data in bundle: ' + str(forbidden))
    manifest = '\n'.join(hashlib.sha256(p.read_bytes()).hexdigest() + '  ' + p.relative_to(folder).as_posix() for p in files) + '\n'
    (folder / 'MANIFEST.sha256').write_text(manifest, encoding='utf-8')
    archive = OUTPUT / '晋学智辅-Windows-x64-0.1.1.zip'
    with zipfile.ZipFile(archive, 'w', zipfile.ZIP_DEFLATED) as z:
        for p in sorted(folder.rglob('*')):
            if p.is_file():
                z.write(p, p.relative_to(DIST))
    summary = {'exe': str(folder / '晋学智辅.exe'), 'zip': str(archive), 'files': len(files) + 1,
        'zip_bytes': archive.stat().st_size, 'zip_sha256': hashlib.sha256(archive.read_bytes()).hexdigest()}
    (OUTPUT / 'build-summary.json').write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps(summary, ensure_ascii=True))


if __name__ == '__main__':
    main()
