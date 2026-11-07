"""Local-only update snapshot: counts/hashes, never secret or student content output."""
import hashlib
import json
from pathlib import Path
import sys
import urllib.request

OUT = Path(__file__).resolve().parent
BASE = 'http://127.0.0.1:8765'
opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))

def get(route):
    return json.load(opener.open(BASE+route, timeout=5))

health, settings, bootstrap, jobs = get('/api/health'), get('/api/ai/settings'), get('/api/bootstrap'), get('/api/ai/jobs')
assert not settings['key_loaded'], 'Key in memory: do not restart automatically'
assert not any(job['status'] in ('SENDING','RUNNING') for job in jobs), 'Active task: do not restart'
state = {key: bootstrap.get(key) for key in ('students','papers','event_count','exercises','exercise_versions','retests')}
fingerprint = hashlib.sha256(json.dumps(state,ensure_ascii=False,sort_keys=True,separators=(',',':')).encode()).hexdigest()
summary = dict(version=health['version'],key_loaded=settings['key_loaded'],papers=len(bootstrap['papers']),
               events=bootstrap['event_count'],exercises=len(bootstrap['exercises']),jobs=len(jobs),state_sha256=fingerprint)
mode = sys.argv[1]
if mode == 'before':
    assert health['version'] == '0.9.0', 'Unexpected starting version'
    request = urllib.request.Request(BASE+'/api/backups', data=b'{}',
                                    headers={'Content-Type':'application/json','X-Jinxue-Token':bootstrap['csrf_token']})
    backup = json.load(opener.open(request,timeout=15))
    summary['backup'] = backup
    (OUT/'archive-live-before.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
elif mode == 'after':
    before = json.loads((OUT/'archive-live-before.json').read_text(encoding='utf-8'))
    assert health['version'] == '0.10.0', health
    assert fingerprint == before['state_sha256'], 'Business snapshot differs'
    assert len(jobs) == before['jobs'], 'Unexpected AI jobs'
    script = opener.open(BASE+'/archive-panel.js',timeout=5).read()
    assert b'function archiveProfilePage' in script
    summary['business_state_unchanged'] = True
    summary['new_static_script_served'] = True
    (OUT/'archive-live-after.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
else:
    raise SystemExit('before or after required')
print(json.dumps(summary,ensure_ascii=False))
