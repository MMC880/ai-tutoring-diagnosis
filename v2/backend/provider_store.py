"""One current-user DPAPI encrypted configuration, separate from student data."""
from __future__ import annotations

import ctypes
from ctypes import wintypes
import hashlib
import json
import os
from pathlib import Path
import tempfile
import uuid


class StoreError(Exception):
    """Safe for display: never include secret values, OS error strings or paths."""


class DataBlob(ctypes.Structure):
    _fields_ = [('size', wintypes.DWORD), ('data', ctypes.POINTER(ctypes.c_ubyte))]


def crypt(data: bytes, *, decrypt=False) -> bytes:
    if os.name != 'nt' or not 1 <= len(data) <= 65536:
        raise StoreError('Windows安全存储不可用或配置大小无效；未使用明文保存')
    crypt32 = ctypes.WinDLL('crypt32', use_last_error=True)
    kernel32 = ctypes.WinDLL('kernel32', use_last_error=True)
    kernel32.LocalFree.argtypes = [ctypes.c_void_p]
    kernel32.LocalFree.restype = ctypes.c_void_p
    fn = crypt32.CryptUnprotectData if decrypt else crypt32.CryptProtectData
    fn.argtypes = [ctypes.POINTER(DataBlob), ctypes.c_void_p, ctypes.POINTER(DataBlob),
                   ctypes.c_void_p, ctypes.c_void_p, wintypes.DWORD, ctypes.POINTER(DataBlob)]
    fn.restype = wintypes.BOOL
    buffer = (ctypes.c_ubyte * len(data)).from_buffer_copy(data)
    source, target = DataBlob(len(data), buffer), DataBlob()
    try:
        # 0x1 = UI_FORBIDDEN; deliberately NOT LOCAL_MACHINE (0x4).
        if not fn(ctypes.byref(source), None, None, None, None, 1, ctypes.byref(target)):
            raise StoreError('Windows无法解密本机配置' if decrypt else 'Windows无法加密配置；未使用明文保存')
        if not 1 <= target.size <= 65536:
            raise StoreError('Windows安全存储返回大小无效')
        return ctypes.string_at(target.data, target.size)
    finally:
        if target.data:
            kernel32.LocalFree(ctypes.cast(target.data, ctypes.c_void_p))
        ctypes.memset(buffer, 0, len(data))


def default_path() -> Path:
    if os.name != 'nt':
        raise StoreError('当前系统不支持Windows本机安全存储')
    # FOLDERID_LocalAppData; resolves the current user's system known folder.
    guid = (ctypes.c_ubyte * 16).from_buffer_copy(uuid.UUID('F1B32785-6FBA-4FCF-9D55-7B8E7F157091').bytes_le)
    shell = ctypes.WinDLL('shell32', use_last_error=True)
    ole = ctypes.WinDLL('ole32')
    shell.SHGetKnownFolderPath.argtypes = [ctypes.c_void_p, wintypes.DWORD, wintypes.HANDLE,
                                          ctypes.POINTER(ctypes.c_void_p)]
    shell.SHGetKnownFolderPath.restype = ctypes.c_long
    ole.CoTaskMemFree.argtypes = [ctypes.c_void_p]
    pointer = ctypes.c_void_p()
    try:
        if shell.SHGetKnownFolderPath(ctypes.byref(guid), 0, None, ctypes.byref(pointer)) != 0:
            raise StoreError('无法确定当前Windows用户的安全配置目录')
        return Path(ctypes.wstring_at(pointer)) / 'JinxueStudentFirst' / 'provider-config.dpapi'
    finally:
        if pointer:
            ole.CoTaskMemFree(pointer)


class ProviderStore:
    def __init__(self, path: Path):
        self.path = Path(path)

    @staticmethod
    def validate(value):
        if (not isinstance(value, dict) or set(value) != {'base_url', 'model', 'api_key'}
                or not all(isinstance(v, str) for v in value.values())
                or not 1 <= len(value['base_url']) <= 400
                or not 1 <= len(value['model']) <= 160
                or not 1 <= len(value['api_key']) <= 4096):
            raise StoreError('保存的模型配置结构无效')
        return value

    def load(self):
        try:
            with self.path.open('rb') as file:
                raw = file.read(65537)
        except FileNotFoundError:
            return None
        except OSError:
            raise StoreError('无法读取本机安全配置；保存项未删除') from None
        try:
            payload = json.loads(crypt(raw, decrypt=True))
            if not isinstance(payload, dict) or set(payload) != {'version', 'config', 'sha256'} or payload['version'] != 1:
                raise StoreError('本机安全配置版本或结构无效')
            config = self.validate(payload['config'])
            encoded = json.dumps(config, sort_keys=True, ensure_ascii=False).encode('utf-8')
            if hashlib.sha256(encoded).hexdigest() != payload['sha256']:
                raise StoreError('本机安全配置校验失败')
            return config
        except (ValueError, TypeError, KeyError, UnicodeError):
            raise StoreError('本机安全配置损坏；保存项未删除') from None

    def save(self, config):
        config = self.validate(config)
        encoded = json.dumps(config, sort_keys=True, ensure_ascii=False).encode('utf-8')
        payload = json.dumps({'version': 1, 'config': config,
                              'sha256': hashlib.sha256(encoded).hexdigest()}, ensure_ascii=False).encode('utf-8')
        encrypted = crypt(payload)
        temporary = None
        try:
            self.path.parent.mkdir(parents=True, exist_ok=True)
            with tempfile.NamedTemporaryFile(prefix='.provider-', suffix='.tmp', dir=self.path.parent,
                                             delete=False) as file:
                temporary = Path(file.name)
                file.write(encrypted)
                file.flush()
                os.fsync(file.fileno())
            os.replace(temporary, self.path)
        except OSError:
            raise StoreError('本机安全配置写入失败；原配置保留，未使用明文保存') from None
        finally:
            if temporary is not None:
                temporary.unlink(missing_ok=True)

    def delete(self):
        try:
            self.path.unlink(missing_ok=True)
        except OSError:
            raise StoreError('当前连接已停用，但本机保存项未能删除；重新打开仍可能恢复') from None
