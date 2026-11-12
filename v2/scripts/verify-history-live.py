"""Opt-in REAL provider check using the prior synthetic pair, never private records.

Prepare: python -X utf8 -B scripts/verify-history-live.py --prepare-only
Live:    python -X utf8 -B scripts/verify-history-live.py --prompt-key
The live command requires hidden console input; no environment/session key lookup.
It delegates every model request to the unchanged production ProviderService.
"""
from __future__ import annotations

import argparse
import base64
import getpass
import hashlib
import io
import json
import os
import re
import shutil
import sqlite3
import sys
import time
from contextlib import closing
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from PIL import Image
from backend.archive import ArchiveStore
from backend.intake import IntakeService, analysis_image
from backend.learning import LearningService
from backend.main import ChatInput
from backend.provider import DEFAULT_BASE, DEFAULT_MODEL, ProviderConfig, ProviderService

FIXTURES = ROOT / '.qa-temp/agent-history/1794473690001'
EXPECTED_IMAGES = {
    'old': '874e166135c0eb5894c402cce95550b4296346688629161c53ba488f66854b37',
    'new': '58c91fc53611adcd7024c76565b518f7d08eef735ab9f30dca35c466849a1a6a',
}
PROMPT = ('请分析当前作业第5题，按需要查看这名学生以前的数学错题。'
          '核对题目和学生原答，指出与以前哪次作业哪道题可能有关，引用实际依据；'
          '区分相同知识点与相同错因，说明不能确定的内容。'
          '请保存为待老师确认的学习笔记，不修改正式记录，不生成练习题。')


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def snapshot(folder):
    return {p.relative_to(folder).as_posix(): sha(p.read_bytes())
            for p in sorted(folder.rglob('*')) if p.is_file()}


def secure_console():
    if not sys.stdin.isatty():
        return False
    if os.name == 'nt':
        import ctypes
        from ctypes import wintypes
        kernel = ctypes.WinDLL('kernel32', use_last_error=True)
        kernel.GetStdHandle.argtypes = [wintypes.DWORD]
        kernel.GetStdHandle.restype = wintypes.HANDLE
        kernel.GetConsoleMode.argtypes = [wintypes.HANDLE, ctypes.POINTER(wintypes.DWORD)]
        kernel.GetConsoleMode.restype = wintypes.BOOL
        mode = wintypes.DWORD()
        return bool(kernel.GetConsoleMode(kernel.GetStdHandle(-10 & 0xffffffff), ctypes.byref(mode)))
    return True


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--prepare-only', action='store_true')
    parser.add_argument('--prompt-key', action='store_true', help='在本机交互终端隐藏输入凭据')
    args = parser.parse_args()
    out = ROOT / '.qa-temp/history-live' / datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')
    out.mkdir(parents=True)
    secret = ''
    report = {
        'started_at': datetime.now(timezone.utc).isoformat(),
        'status': 'NOT_RUN', 'requested_endpoint': DEFAULT_BASE, 'requested_model': DEFAULT_MODEL,
        'material_kind': 'PRIOR_SYNTHETIC_PAIR_NOT_AUTHENTIC_STUDENT_PHOTOS',
        'source_fixture': str(FIXTURES), 'prompt': PROMPT,
        'tool_choice': 'NOT_FORCED', 'production_model_round_limit': 4,
        'external_calls': 0, 'local_checks': [], 'live_checks': {}, 'limitations': [
            '仅复用先前两次合成作业；不能代替真实手写或批改准确率验收。',
            '两份知识点关联和证据摘录已在样例中给出，不能算从零诊断。',
            '直接运行生产ProviderService与本地存储；本脚本不验证Electron或真人操作。',
            '无自动重试、无备选模型、无模拟响应；人工核查内容后才能判教学分析通过。',
        ],
    }

    def write(name, data):
        text = json.dumps(data, ensure_ascii=False, indent=2) if not isinstance(data, str) else data
        if secret:
            text = text.replace(secret, '[REDACTED]')
        (out / name).write_text(text, encoding='utf-8')

    def event(data):
        text = json.dumps(data, ensure_ascii=False)
        if secret:
            text = text.replace(secret, '[REDACTED]')
        with (out / 'model-calls.jsonl').open('a', encoding='utf-8') as handle:
            handle.write(text + '\n')

    def redact_images(value):
        if isinstance(value, str):
            if value.startswith('data:image/'):
                prefix, encoded = value.split(',', 1)
                raw = base64.b64decode(encoded, validate=True)
                ident = sha(raw)
                (out / ('sent-image-' + ident + '.bin')).write_bytes(raw)
                with Image.open(io.BytesIO(raw)) as image:
                    return {'image_omitted_from_log': True, 'mime': prefix.split(';')[0][5:],
                            'sha256': ident, 'bytes': len(raw), 'size': list(image.size)}
            return value.replace(secret, '[REDACTED]') if secret else value
        if isinstance(value, list):
            return [redact_images(v) for v in value]
        if isinstance(value, dict):
            return {k: redact_images(v) for k, v in value.items()}
        return value

    class ObservedProvider(ProviderService):
        def _request(self, config, payload):
            report['external_calls'] += 1
            number = report['external_calls']
            start = time.monotonic()
            event({'event': 'request', 'call': number, 'at': datetime.now(timezone.utc).isoformat(),
                   'payload': redact_images(payload)})
            try:
                # No custom transport, no replacement responses, no forced tool_choice.
                message, model, usage = super()._request(config, payload)
            except Exception as error:
                safe_error = str(error).replace(secret, '[REDACTED]')
                status = re.search(r'HTTP\s*(\d{3})', safe_error)
                event({'event': 'failure', 'call': number, 'elapsed_seconds': time.monotonic() - start,
                       'http_status': int(status[1]) if status else None, 'error': safe_error})
                raise
            event({'event': 'response', 'call': number, 'http_status': 200,
                   'elapsed_seconds': time.monotonic() - start, 'returned_model': model,
                   'usage': usage, 'message': redact_images(message)})
            return message, model, usage

    source = archive = provider = None
    source_before = formal_before = None
    try:
        fixtures = json.loads((FIXTURES / 'fixtures.json').read_text(encoding='utf-8'))
        source = Path(fixtures['archive']).resolve()
        if not source.is_relative_to(FIXTURES.resolve()) or not source.is_dir():
            raise ValueError('先前合成样例库不存在或路径越界；未改用真实资料')
        source_before = snapshot(source)
        report['student_scope'] = {'student_id': fixtures['student']['id'], 'subject': 'math',
                                   'assignment_id': fixtures['new']['assignment_id']}
        archive = out / 'archive'
        archive.mkdir()
        shutil.copy2(source / 'index.json', archive / 'index.json')
        # SQLite backup avoids copying a partially written database. Read-only source.
        with closing(sqlite3.connect((source / 'intake.sqlite3').as_uri() + '?mode=ro', uri=True)) as src:
            with closing(sqlite3.connect(archive / 'intake.sqlite3')) as dst:
                src.backup(dst)
        for path in list((source / 'objects').iterdir()) + list((source / 'students').glob('*/subjects/*/history/*.md')):
            target = archive / path.relative_to(source)
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(path, target)
        report['local_checks'].append('隔离复制既有合成库，未复制旧模拟AI笔记')
        images = {}
        for key, expected in EXPECTED_IMAGES.items():
            record = fixtures[key]
            if record['files'][0]['sha256'] != expected:
                raise ValueError('合成材料不匹配，停止外发')
            raw = (archive / 'objects' / expected).read_bytes()
            if sha(raw) != expected:
                raise ValueError('合成原图哈希不符')
            with Image.open(io.BytesIO(raw)) as image:
                image.load()
                images[key] = {'assignment_id': record['assignment_id'], 'date': record['assignment_date'],
                               'original_sha256': expected, 'size': list(image.size)}
            copy = analysis_image(raw)
            images[key]['analysis_bytes'] = copy['bytes']
        write('materials.json', images)
        store = ArchiveStore(archive)
        learning = LearningService(IntakeService(store))
        formal_before = snapshot(archive)
        before = learning.workspace(fixtures['student']['id'], 'math')
        write('workspace-before.json', before)
        report['local_checks'].extend(['两次合成原图真实解码及分析副本生成', '既有结构化历史可读'])
        if args.prepare_only:
            report['reason'] = '仅准备；未读取凭据、未向供应商发送请求'
            return 2
        if not args.prompt_key or not secure_console():
            report['reason'] = '无活动配置会话且无隐藏本机凭据输入；未执行外部调用'
            return 2
        print('仅发送先前两份合成数学样例到 ' + DEFAULT_BASE + '，模型 ' + DEFAULT_MODEL)
        secret = getpass.getpass('本机输入测试API Key（不显示、不保存；不要发到聊天）：').strip()
        if not secret:
            report['reason'] = '本机未输入凭据；未执行外部调用'
            return 2
        provider = ObservedProvider(store, ROOT / 'skills/math-error-review/SKILL.md', learning=learning)
        provider.configure(ProviderConfig(api_key=secret, base_url=DEFAULT_BASE, model=DEFAULT_MODEL))
        payload = ChatInput(text=PROMPT, **report['student_scope'],
                            allow_history=True, allow_originals=True, allow_save=True)
        if payload.student_id != fixtures['student']['id'] or payload.assignment_id != fixtures['new']['assignment_id']:
            raise ValueError('测试学生或作业范围未正确绑定，停止外发')
        result = provider.chat(payload)
        write('provider-result.json', result)
        if not result or result.get('mode') != 'provider':
            raise RuntimeError('非真实provider结果；拒绝按成功计')
        events = result.get('tool_events', [])
        names = {e['name'] for e in events if e['status'] in {'READ', 'READ_IMAGE', 'SAVED_PENDING'}}
        report['live_checks'] = {
            'model_chose_history_search': 'search_student_history' in names,
            'model_chose_assignment_read': 'read_assignment' in names,
            'model_chose_image_read': 'read_assignment_image' in names,
            'model_chose_save': 'save_learning_note' in names,
            'analysis_quality': 'MANUAL_REVIEW_REQUIRED',
        }
        receipts = result.get('receipts', [])
        readback_ok = bool(receipts)
        for receipt in receipts:
            path = (archive / receipt['relative_path']).resolve()
            if not path.is_relative_to(archive.resolve()):
                raise ValueError('回执路径越界')
            raw = path.read_bytes()
            fresh = ProviderService(ArchiveStore(archive), ROOT / 'skills/math-error-review/SKILL.md')
            saved = fresh.notes(fixtures['student']['id'], 'math')
            readback_ok &= (sha(raw) == receipt['sha256'] and len(raw) == receipt['bytes'] and
                            any(n['id'] == receipt['id'] and n['markdown'] == raw.decode('utf-8') for n in saved))
            write(receipt['id'] + '.md', raw.decode('utf-8'))
        report['live_checks']['pending_md_reopened_readback'] = readback_ok
        report['tool_events'] = events
        report['status'] = 'LIVE_COMPLETED_REQUIRES_CONTENT_REVIEW'
        if not all(v is True for k, v in report['live_checks'].items() if k != 'analysis_quality'):
            report['status'] = 'LIVE_PARTIAL'
        after = learning.workspace(fixtures['student']['id'], 'math')
        write('workspace-after.json', after)
        report['workspace_unchanged'] = before == after
        return 0 if report['status'] != 'LIVE_PARTIAL' else 1
    except Exception as error:
        report['status'] = 'LIVE_FAILED' if report['external_calls'] else 'PREPARATION_FAILED'
        report['reason'] = (type(error).__name__ + ': ' + str(error)).replace(secret, '[REDACTED]') if secret else type(error).__name__ + ': ' + str(error)
        return 1
    finally:
        if provider:
            provider.clear()
        if archive and formal_before is not None:
            after = snapshot(archive)
            baseline_after = {p: h for p, h in after.items() if '/agent-notes/' not in p}
            report['formal_files_unchanged'] = formal_before == baseline_after
            report['new_files'] = [p for p in after if p not in formal_before]
            if not report['formal_files_unchanged']:
                report['status'] = 'FAIL_FORMAL_RECORD_CHANGED'
        if source and source_before is not None:
            report['source_fixture_unchanged'] = source_before == snapshot(source)
            if not report['source_fixture_unchanged']:
                report['status'] = 'FAIL_SOURCE_CHANGED'
        report['finished_at'] = datetime.now(timezone.utc).isoformat()
        write('result.json', report)
        print(json.dumps({'status': report['status'], 'external_calls': report['external_calls'],
                          'evidence': str(out), 'reason': report.get('reason', '')}, ensure_ascii=False, indent=2))
        secret = ''
        if report['status'].startswith('FAIL_'):
            raise SystemExit(1)


if __name__ == '__main__':
    raise SystemExit(main())
