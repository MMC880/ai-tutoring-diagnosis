"""Explicit opt-in deploy/probe with hidden local input or run authorized synthetic history.

No credential command-line argument, environment variable or plaintext file is supported.
--history reuses the already-encrypted exact configuration and the existing live runner.
"""
import argparse
from datetime import datetime, timezone
import getpass
import hashlib
import importlib.util
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from backend.provider import DEFAULT_BASE, DEFAULT_MODEL, ProviderConfig, ProviderService
from backend.provider_store import ProviderStore, default_path


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--history', action='store_true')
    args = parser.parse_args()
    spec = importlib.util.spec_from_file_location('history_live', ROOT / 'scripts/verify-history-live.py')
    history = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(history)
    store = ProviderStore(default_path())
    if args.history:
        provider = ProviderService(None, Path('unused'), store=store)
        if not provider._config or provider._config.base_url != DEFAULT_BASE or provider._config.model != DEFAULT_MODEL:
            raise SystemExit('没有与已授权地址和模型匹配的本机加密配置，停止')
        # Explicit harness only: no new production Key API, no plaintext export.
        # History runner remains store-free so its finally:clear() cannot erase saved settings.
        secret = provider._config.api_key
        sys.argv = [str(ROOT / 'scripts/verify-history-live.py'), '--prompt-key']
        history.secure_console = lambda: True
        history.getpass.getpass = lambda _prompt: secret
        return history.main()
    if not history.secure_console():
        raise SystemExit('需要真正的本机交互控制台隐藏输入；不接受参数/管道/环境Key')
    if store.path.exists():
        raise SystemExit('已有本机配置，停止以免覆盖；请在软件设置中明确更换')
    secret = getpass.getpass('Input authorized test Key (hidden, exact characters): ')
    if not secret:
        raise SystemExit('未输入Key')
    out = ROOT / '.qa-temp/provider-live' / datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')
    out.mkdir(parents=True)
    report = {'requested_endpoint': DEFAULT_BASE, 'requested_model': DEFAULT_MODEL,
              'credential_handling': 'exact hidden input; current-user DPAPI; no argv/env/plaintext file',
              'trailing_pipe_preserved': secret.endswith('|'), 'student_data_sent': False,
              'external_calls': 0, 'tests': []}
    provider = ProviderService(None, Path('unused'), store=store)
    try:
        report['save_settings'] = provider.configure(ProviderConfig(api_key=secret), remember=True)
        raw = store.path.read_bytes()
        report['ciphertext_bytes'] = len(raw)
        report['ciphertext_sha256'] = hashlib.sha256(raw).hexdigest()
        report['plaintext_absent_from_ciphertext'] = secret.encode() not in raw
        report['external_calls'] += 1
        try:
            report['connection'] = provider.test()
            report['status'] = 'SAVED_AND_REAL_CONNECTION_PASS'
        except Exception as error:
            report['status'] = 'SAVED_REAL_CONNECTION_FAILED'
            report['reason'] = str(error).replace(secret, '[REDACTED]')
        report['settings_after_probe'] = provider.settings()
    finally:
        # Deliberately leave the user-authorized saved configuration in place.
        text = json.dumps(report, ensure_ascii=False, indent=2).replace(secret, '[REDACTED]')
        (out / 'result.json').write_text(text, encoding='utf-8')
        print(json.dumps({'status': report.get('status', 'FAILED'), 'evidence': str(out),
                          'reason': report.get('reason', '')}, ensure_ascii=False))
    return 0 if report.get('status') == 'SAVED_AND_REAL_CONNECTION_PASS' else 1


if __name__ == '__main__':
    raise SystemExit(main())
