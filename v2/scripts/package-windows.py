"""Build a new, self-contained portable directory; never overwrite old deliveries."""
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import zipfile

ROOT = Path(__file__).resolve().parents[1]
REPO = ROOT.parent


def build(destination: Path, version='2.0.0-preview.1'):
    if not re.fullmatch(r'\d+\.\d+\.\d+(?:-[A-Za-z0-9.-]+)?', version):
        raise SystemExit('版本号无效')
    if destination.exists():
        raise SystemExit('目标已存在，请使用新的交付目录；不覆盖旧包')
    destination.mkdir(parents=True)
    env = dict(os.environ, JINXUE_RELEASE='1', PYTHONUTF8='1', PYTHONDONTWRITEBYTECODE='1',
               TEMP=str(REPO / '.cache/v2-temp'), TMP=str(REPO / '.cache/v2-temp'))
    subprocess.run(['npm.cmd', 'run', 'build'], cwd=ROOT, env=env, check=True, shell=False)
    electron = ROOT / 'node_modules/electron/dist'
    portable = destination / 'JinxueZhifu'
    shutil.copytree(electron, portable)
    (portable / 'electron.exe').rename(portable / 'JinxueZhifu.exe')
    app = portable / 'resources/app'
    shutil.copytree(ROOT / 'desktop', app / 'desktop')
    (app / 'package.json').write_text(json.dumps({'name': 'jinxue-zhifu', 'version': version,
        'main': 'desktop/main.cjs', 'description': '晋学智辅2.0本地学习档案试用版'}), encoding='utf-8')
    frozen = destination / 'frozen'
    # Reuse pinned PyInstaller 6.22.3; v2 dependency search path precedes old dependencies.
    builder = REPO / '.tools/windows-build/venv/Scripts/python.exe'
    command = [str(builder), '-X', 'utf8', '-m', 'PyInstaller', '--noconfirm', '--clean', '--onedir',
        '--name', 'JinxueBackend', '--distpath', str(frozen), '--workpath', str(destination / 'build'),
        '--specpath', str(destination), '--paths', str(ROOT / '.venv/Lib/site-packages'), '--paths', str(ROOT),
        '--hidden-import', 'backend.main', '--collect-all', 'skills_ref', '--collect-all', 'tzdata',
        '--collect-submodules', 'uvicorn', '--add-data', f'{ROOT / "skills"};skills',
        '--add-data', f'{ROOT / "dist"};web', str(ROOT / 'backend/packaged_entry.py')]
    subprocess.run(command, cwd=ROOT, env=env, check=True)
    shutil.copytree(frozen / 'JinxueBackend', app / 'runtime/backend')
    shutil.copy2(ROOT / 'WINDOWS_TRIAL_GUIDE.md', portable / 'START-HERE.md')
    # No data, profile, key or developer runtime is copied.
    files = sorted(p for p in portable.rglob('*') if p.is_file())
    manifest = {p.relative_to(portable).as_posix(): hashlib.sha256(p.read_bytes()).hexdigest() for p in files}
    (destination / 'MANIFEST.json').write_text(json.dumps(manifest, indent=2), encoding='utf-8')
    print(json.dumps({'portable': str(portable), 'files': len(files), 'bytes': sum(p.stat().st_size for p in files)}, ensure_ascii=False))


def archive(destination: Path):
    portable = destination / 'JinxueZhifu'
    manifest = json.loads((destination / 'MANIFEST.json').read_text('utf-8'))
    for relative, digest in manifest.items():
        if hashlib.sha256((portable / relative).read_bytes()).hexdigest() != digest:
            raise SystemExit('已测包发生变化：' + relative)
    version = json.loads((portable / 'resources/app/package.json').read_text('utf-8'))['version']
    archive_path = destination / f'JinxueZhifu-{version}-Windows-x64.zip'
    with zipfile.ZipFile(archive_path, 'x', zipfile.ZIP_DEFLATED) as bundle:
        for relative in manifest:
            bundle.write(portable / relative, 'JinxueZhifu/' + relative)
        bundle.write(destination / 'MANIFEST.json', 'MANIFEST.json')
    digest = hashlib.sha256(archive_path.read_bytes()).hexdigest()
    (destination / 'SHA256.txt').write_text(digest + '  ' + archive_path.name + '\n', encoding='ascii')
    print(json.dumps({'zip': str(archive_path), 'bytes': archive_path.stat().st_size, 'sha256': digest}))


if __name__ == '__main__':
    destination = Path(sys.argv[2]).resolve()
    if REPO / 'docs/delivery' not in destination.parents:
        raise SystemExit('交付路径需在本项目docs/delivery内')
    if sys.argv[1] == 'build':
        build(destination, sys.argv[3] if len(sys.argv) > 3 else '2.0.0-preview.1')
    else:
        {'archive': archive}[sys.argv[1]](destination)
