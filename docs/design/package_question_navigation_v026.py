"""Build the verified v0.26 source delivery from an explicit allowlist."""
from pathlib import Path
import hashlib
import json
import re
import zipfile

project = Path(__file__).resolve().parents[2]
delivery = project / 'docs/delivery'
evidence_root = project / 'docs/design'
log = (evidence_root/'question-navigation-python-final.txt').read_text(encoding='utf-8')
assert 'Ran 409 tests' in log and log.rstrip().endswith('OK')
browser = json.loads((evidence_root/'question-navigation-browser/verification.json').read_text(encoding='utf-8'))
assert browser['passed'] == browser['total'] == 21 and not browser['failure'] and not browser['pageErrors']
prefix = 'Jinxue-Local/'
with zipfile.ZipFile(delivery/'jinxue-local-trial-v0.25.0.zip') as previous:
    names = [n for n in previous.namelist() if not n.endswith('/') and not n.endswith('MANIFEST.sha256') and '/evidence/' not in n]
new_files = ['web/question-navigation.js','tests/check_question_navigation.mjs','整卷题目查找说明.md']
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
reports={'assignment-date-browser':20,'review-flow-browser':26,'teaching-search-browser':19,'student-archive-browser':14,'profile-report-browser':20,'continuation-preview':25,'v026-live-preview':41}
for folder, expected in reports.items():
    report=json.loads((evidence_root/folder/'verification.json').read_text(encoding='utf-8'))
    assert report['passed']==report['total']==expected and not report.get('failure') and not report.get('pageErrors'),folder
live=json.loads((evidence_root/'question-navigation-live-after.json').read_text(encoding='utf-8'))
assert live['version']=='0.26.0' and live['business_state_unchanged'] and live['question_navigation_static_matches'] and live['assignment_date_rows']==0
for target,source in {
 'automated-tests.txt':'question-navigation-python-final.txt',
 'new-question-navigation-browser.json':'question-navigation-browser/verification.json',
 'date-regression.json':'assignment-date-browser/verification.json',
 'review-flow-regression.json':'review-flow-browser/verification.json',
 'teaching-search-regression.json':'teaching-search-browser/verification.json',
 'archive-regression.json':'student-archive-browser/verification.json',
 'report-regression.json':'profile-report-browser/verification.json',
 'continuation-regression.json':'continuation-preview/verification.json',
 'local-node-checks.txt':'question-navigation-node-final.txt',
}.items():
    data[prefix+'evidence/'+target]=(evidence_root/source).read_bytes()
manifest = ''.join(hashlib.sha256(raw).hexdigest()+'  '+name[len(prefix):]+'\n' for name, raw in data.items())
data[prefix+'MANIFEST.sha256'] = manifest.encode()
target = delivery/'jinxue-local-trial-v0.26.0.zip'
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
(delivery/'LOCAL_TRIAL_PACKAGE-v0.26.0.json').write_text(
    json.dumps(result, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
print(json.dumps(result, ensure_ascii=False))
