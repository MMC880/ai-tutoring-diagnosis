"""User-selected local backup copy. No arbitrary-path or shell bridge."""
import hashlib
import os
from pathlib import Path
from urllib.parse import urlsplit


class BackupBridge:
    def __init__(self, service, dialog_type):
        self._service = service
        self._dialog_type = dialog_type
        self._window = None

    def choose_backup(self):
        try:
            current = urlsplit(self._window.get_current_url())
            expected = urlsplit(self._service.url)
            if (current.scheme, current.netloc) != (expected.scheme, expected.netloc):
                raise ValueError('仅能从本机教师工作台选择备份目录')
            folders = self._window.create_file_dialog(self._dialog_type)
            if not folders:
                return dict(cancelled=True)
            folder = Path(folders[0]).resolve(strict=True)
            if not folder.is_dir():
                raise ValueError('请选择已经存在的备份文件夹')
            backup = self._service.store.backup()
            source = self._service.store.backup_path(backup['id'])
            raw = source.read_bytes()
            if hashlib.sha256(raw).hexdigest() != backup['sha256']:
                raise ValueError('备份校验失败，未复制')
            destination = folder / backup['id']
            with destination.open('xb') as output:
                output.write(raw)
                output.flush()
                os.fsync(output.fileno())
            if hashlib.sha256(destination.read_bytes()).hexdigest() != backup['sha256']:
                raise ValueError('外部副本校验失败，请勿使用该文件')
            return dict(cancelled=False, path=str(destination), sha256=backup['sha256'])
        except Exception as exc:
            return dict(error='备份未完成：' + str(exc))
