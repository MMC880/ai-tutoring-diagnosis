# Explicit runtime resources only; student stores and developer caches are never input.
from pathlib import Path
from PyInstaller.utils.hooks import collect_all, copy_metadata

ROOT = Path(SPECPATH).resolve().parents[1]
datas, binaries, hidden = [], [], []
for name in ('webview', 'pythonnet', 'clr_loader'):
    more_data, more_binary, more_hidden = collect_all(name)
    datas += more_data
    binaries += more_binary
    hidden += more_hidden
for name in ('pywebview', 'pythonnet', 'python-docx', 'pypdf', 'Pillow'):
    datas += copy_metadata(name)
for resource in sorted((ROOT / 'app' / 'web').iterdir()):
    if resource.is_file() and resource.suffix in ('.js', '.css', '.html'):
        datas.append((str(resource), 'web'))
datas.append((str(ROOT / 'app/web/assets/synthetic-homework.png'), 'web/assets'))

a = Analysis([str(ROOT / 'app/desktop.py')], pathex=[str(ROOT / 'app')], binaries=binaries,
    datas=datas, hiddenimports=hidden, hookspath=[], hooksconfig={}, runtime_hooks=[],
    excludes=['PyQt5', 'PyQt6', 'PySide2', 'PySide6', 'gi', 'cefpython3', 'tkinter'], noarchive=False)
pyz = PYZ(a.pure)
exe = EXE(pyz, a.scripts, [], exclude_binaries=True, name='晋学智辅', debug=False,
    bootloader_ignore_signals=False, strip=False, upx=False, console=False,
    disable_windowed_traceback=True)
coll = COLLECT(exe, a.binaries, a.datas, strip=False, upx=False, name='晋学智辅')
