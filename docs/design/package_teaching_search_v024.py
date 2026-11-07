"""Build the verified v0.24 source delivery from an explicit allowlist."""
from pathlib import Path
import hashlib
import json
import re
import zipfile

project = Path(__file__).resolve().parents[2]
delivery = project / 'docs/delivery'
evidence_root = project / 'docs/design'
log = (evidence_root/'teaching-search-python-final.txt').read_text(encoding='utf-8')
assert 'Ran 389 tests' in log and log.rstrip().endswith('OK')
browser = json.loads((evidence_root/'teaching-search-browser/verification.json').read_text(encoding='utf-8'))
assert browser['passed'] == browser['total'] == 19 and not browser['failure'] and not browser['pageErrors']
prefix = 'Jinxue-Local/'
with zipfile.ZipFile(delivery/'jinxue-local-trial-v0.23.0.zip') as previous:
    names = [n for n in previous.namelist() if not n.endswith('/') and not n.endswith('MANIFEST.sha256') and '/evidence/' not in n]
new_files = ['web/teaching-catalog.js','tests/check_teaching_catalog.mjs','知识条目查找说明.md']
names = sorted(set(names + [prefix + n for n in new_files]))
data = {}
for name in names:
    assert name.startswith(prefix)
    relative = name[len(prefix):]
    assert not any(part.startswith('.') or part == '__pycache__' for part in Path(relative).parts)
    source = project/'app'/relative
    raw = source.read_bytes()
    if source.suffix != '.png':
        assert not re.search(rb'sk-[A-Za-z0-9_-]{25,}', raw), 'Key-like text in source allowlist'
    data[name] = raw
reports={'teaching-library-browser':15,'student-archive-browser':14,'profile-report-browser':20,'practice-queue-browser':22,'review-flow-browser':26,'v024-live-preview':37}
for folder, expected in reports.items():
    report=json.loads((evidence_root/folder/'verification.json').read_text(encoding='utf-8'))
    assert report['passed']==report['total']==expected and not report.get('failure') and not report.get('pageErrors'),folder
live=json.loads((evidence_root/'teaching-search-live-after.json').read_text(encoding='utf-8'))
assert live['version']=='0.24.0' and live['business_state_unchanged'] and live['teaching_search_static_matches']
for target,source in {
 'automated-tests.txt':'teaching-search-python-final.txt',
 'new-teaching-search-browser.json':'teaching-search-browser/verification.json',
 'teaching-regression.json':'teaching-library-browser/verification.json',
 'archive-regression.json':'student-archive-browser/verification.json',
 'report-regression.json':'profile-report-browser/verification.json',
 'queue-regression.json':'practice-queue-browser/verification.json',
 'review-flow-regression.json':'review-flow-browser/verification.json',
 'local-node-checks.txt':'teaching-search-node-final.txt',
}.items():
    data[prefix+'evidence/'+target]=(evidence_root/source).read_bytes()
manifest = ''.join(hashlib.sha256(raw).hexdigest()+'  '+name[len(prefix):]+'\n' for name, raw in data.items())
data[prefix+'MANIFEST.sha256'] = manifest.encode()
target = delivery/'jinxue-local-trial-v0.24.0.zip'
with zipfile.ZipFile(target, 'w', compression=zipfile.ZIP_DEFLATED) as archive:
    for name, raw in data.items(): archive.writestr(name, raw)
with zipfile.ZipFile(target) as archive:
    assert archive.testzip() is None
    assert len(archive.namelist()) == len(set(archive.namelist()))
    for line in archive.read(prefix+'MANIFEST.sha256').decode().splitlines():
        digest, relative = line.split('  ', 1)
        assert hashlib.sha256(archive.read(prefix+relative)).hexdigest() == digest
    for name in names:
        assert archive.read(name) == (project/'app'/name[len(prefix):]).read_bytes()
result = dict(file=target.name, status='VERIFIED_LOCAL_TRIAL',
              files=len(data), source_files=len(names), manifest_entries=len(data)-1,
              size=target.stat().st_size, sha256=hashlib.sha256(target.read_bytes()).hexdigest(),
              crc='PASS', source_bytes_match=True,
              excludes=['student records','real photos','credentials','backups','browser profiles','Git'])
(delivery/'LOCAL_TRIAL_PACKAGE-v0.24.0.json').write_text(
    json.dumps(result, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
print(json.dumps(result, ensure_ascii=False))
