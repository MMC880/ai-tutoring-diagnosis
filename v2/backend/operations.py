"""Single-process consistent backups; restoration never overwrites live data."""
import hashlib
import json
import os
import sqlite3
import stat
import re
import tempfile
import zipfile
from pathlib import Path, PurePosixPath
from uuid import uuid4
from contextlib import closing


class Operations:
    def __init__(self, intake):
        self.intake = intake
        self.archive = intake.archive

    def status(self):
        with self.intake._connect() as db:
            pending = [dict(json.loads(row['response']), created_at=row['created_at']) for row in db.execute(
                "SELECT response,created_at FROM flows WHERE status='NEEDS_STUDENT' ORDER BY created_at")]
        return {'data_directory': str(self.archive.root.resolve()), 'pending': pending,
                'notice': '未确认学生的材料已暂存。备份含学生资料，仅在本地保管；恢复只到新空目录。'}

    def backup(self, destination: Path):
        destination = destination.resolve()
        source = self.archive.root.resolve()
        if destination == source or source in destination.parents:
            raise ValueError('备份目录需在工作资料目录之外，避免把备份再打进备份')
        destination.mkdir(parents=True, exist_ok=True)
        name = 'backup-' + uuid4().hex + '.zip'
        target = destination / name
        temporary = destination / (name + '.tmp')
        try:
            with self.archive._index_lock, tempfile.TemporaryDirectory(dir=destination) as scratch:
                # Opening the schema also handles a previously empty archive.
                with self.intake._connect() as db:
                    snapshot = Path(scratch) / 'intake.sqlite3'
                    with closing(sqlite3.connect(snapshot)) as copy:
                        db.backup(copy)
                entries = {}
                with zipfile.ZipFile(temporary, 'x', zipfile.ZIP_DEFLATED) as bundle:
                    for file in sorted(source.rglob('*')):
                        if file.is_symlink() or file.is_junction():
                            raise ValueError('资料目录含链接，停止备份，请先核对目录')
                        if not file.is_file() or file.name.startswith('intake.sqlite3') or file.suffix == '.tmp':
                            continue
                        raw = file.read_bytes()
                        rel = file.relative_to(source).as_posix()
                        entries[rel] = hashlib.sha256(raw).hexdigest()
                        bundle.writestr(rel, raw)
                    raw = snapshot.read_bytes()
                    entries['intake.sqlite3'] = hashlib.sha256(raw).hexdigest()
                    bundle.writestr('intake.sqlite3', raw)
                    bundle.writestr('MANIFEST.json', json.dumps({'format': 1, 'files': entries}, ensure_ascii=False))
                self.verify(temporary)
                with temporary.open('r+b') as stream:
                    os.fsync(stream.fileno())
                temporary.replace(target)
            return {'path': str(target), 'sha256': hashlib.sha256(target.read_bytes()).hexdigest(), 'files': len(entries)}
        finally:
            if temporary.exists():
                temporary.unlink()

    @staticmethod
    def verify(path):
        try:
            with zipfile.ZipFile(path) as bundle:
                infos = bundle.infolist()
                names = [i.filename for i in infos]
                if len(names) != len(set(n.casefold() for n in names)) or len(names) > 100000:
                    raise ValueError('重复文件或文件过多')
                total = 0
                for info in infos:
                    parts = PurePosixPath(info.filename).parts
                    if not parts or any(p in {'.', '..'} or re.search(r'[<>:"|?*\x00-\x1f]', p) or p.endswith(('.', ' ')) or re.fullmatch(r'(?i)(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\..*)?', p) for p in parts) or '\\' in info.filename or info.filename.startswith('/') or stat.S_ISLNK(info.external_attr >> 16):
                        raise ValueError('备份包含非法路径或链接')
                    total += info.file_size
                    if info.file_size > 512 * 1024 * 1024 or total > 4 * 1024**3:
                        raise ValueError('备份超出恢复容量限制')
                manifest = json.loads(bundle.read('MANIFEST.json'))
                entries = manifest['files']
                if manifest['format'] != 1 or set(names) != set(entries) | {'MANIFEST.json'} or 'intake.sqlite3' not in entries:
                    raise ValueError('备份清单不完整')
                for name, digest in entries.items():
                    if hashlib.sha256(bundle.read(name)).hexdigest() != digest:
                        raise ValueError('备份哈希不一致')
                return entries
        except (zipfile.BadZipFile, KeyError, TypeError, json.JSONDecodeError, RuntimeError) as error:
            raise ValueError('备份损坏或格式无效') from error

    def restore(self, backup: Path, target: Path):
        target = target.resolve()
        if target == self.archive.root.resolve() or self.archive.root.resolve() in target.parents:
            raise ValueError('不能恢复到当前工作资料目录')
        if target.exists() and (not target.is_dir() or any(target.iterdir())):
            raise ValueError('恢复仅允许选择空目录，不覆盖任何现有档案')
        self.verify(backup)
        target.parent.mkdir(parents=True, exist_ok=True)
        with tempfile.TemporaryDirectory(prefix='jinxue-restore-', dir=target.parent) as scratch:
            staged = Path(scratch) / 'data'
            staged.mkdir()
            with zipfile.ZipFile(backup) as bundle:
                for name in self.verify(backup):
                    path = staged / name
                    path.parent.mkdir(parents=True, exist_ok=True)
                    path.write_bytes(bundle.read(name))
            with closing(sqlite3.connect(staged / 'intake.sqlite3')) as db:
                if db.execute('PRAGMA integrity_check').fetchone()[0] != 'ok':
                    raise ValueError('恢复数据库完整性检查失败')
                records = db.execute('SELECT receipt FROM assignments').fetchall()
                ids = {s['id'] for s in json.loads((staged / 'index.json').read_text('utf-8'))['students']} if (staged / 'index.json').exists() else set()
                for row in records:
                    record = json.loads(row[0])
                    if record['student']['id'] not in ids:
                        raise ValueError('学生索引与作业不一致')
                    for file in record['files']:
                        if not re.fullmatch('[a-f0-9]{64}', file['sha256']):
                            raise ValueError('备份原件编号无效')
                        if hashlib.sha256((staged / 'objects' / file['sha256']).read_bytes()).hexdigest() != file['sha256']:
                            raise ValueError('恢复原件核验失败')
            if target.exists():
                target.rmdir()  # only a verified empty user-selected directory
            staged.rename(target)
        return {'path': str(target), 'status': 'VERIFIED_RESTORED', 'notice': '已恢复到新目录，当前资料未切换；可选为下次启动资料目录'}
