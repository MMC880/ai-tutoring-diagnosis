"""Build from previous explicit source allowlist; never scan local records/photos."""
from pathlib import Path
import hashlib
import json
import re
import zipfile

project = Path(__file__).resolve().parents[2]
delivery = project / 'docs/delivery'
old = delivery / 'jinxue-local-trial-v0.10.0.zip'
target = delivery / 'jinxue-local-trial-v0.11.0.zip'
with zipfile.ZipFile(old) as archive:
    names = [n for n in archive.namelist() if not n.endswith('/') and not n.endswith('MANIFEST.sha256') and '/evidence/' not in n]
prefix = 'Jinxue-Local/'
new_files = ['teaching.py', 'web/teaching-panel.js', '教学资料使用说明.md', 'tests/test_teaching.py', 'tests/check_teaching_switch.mjs']
names = sorted(set(names + [prefix + name for name in new_files]))
data = {}
for name in names:
    assert name.startswith(prefix), name
    relative = name[len(prefix):]
    assert not any(part.startswith('.') or part == '__pycache__' for part in Path(relative).parts), name
    source = project / 'app' / relative
    assert source.is_file(), str(source)
    raw = source.read_bytes()
    if source.suffix != '.png':
        assert not re.search(rb'sk-[A-Za-z0-9_-]{30,}', raw), 'Long key-like text in allowlist'
    data[name] = raw
evidence = {
    'automated-tests.txt': project/'docs/design/teaching-python-final.txt',
    'teaching-library-checks.json': project/'docs/design/teaching-library-browser/verification.json',
    'archive-regression-checks.json': project/'docs/design/student-archive-browser/verification.json',
    'teaching-switch-checks.txt': project/'docs/design/teaching-switch-green.txt',
    'teacher-review-checks.json': project/'docs/design/teacher-review-browser/verification.json',
}
for name, source in evidence.items():
    data[prefix+'evidence/'+name] = source.read_bytes()
manifest = '\n'.join(hashlib.sha256(raw).hexdigest()+'  '+name[len(prefix):] for name,raw in data.items())+'\n'
data[prefix+'MANIFEST.sha256'] = manifest.encode('utf-8')
with zipfile.ZipFile(target,'w',compression=zipfile.ZIP_DEFLATED) as archive:
    for name,raw in data.items(): archive.writestr(name,raw)
with zipfile.ZipFile(target) as archive:
    assert archive.testzip() is None
    assert len(archive.namelist()) == len(set(archive.namelist()))
    for line in archive.read(prefix+'MANIFEST.sha256').decode().splitlines():
        digest,relative = line.split('  ',1)
        assert hashlib.sha256(archive.read(prefix+relative)).hexdigest() == digest
result = dict(file=target.name,files=len(data),manifest_entries=len(data)-1,
              size=target.stat().st_size,sha256=hashlib.sha256(target.read_bytes()).hexdigest(),
              crc='PASS',verified=True,source_allowlist='v0.10 source allowlist plus 5 source files; current synthetic regression evidence',
              excluded=['.local-data','.qa-temp','real student photos','pilot reports','credentials','browser profiles'])
(delivery/'LOCAL_TRIAL_PACKAGE-v0.11.0.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps(result,ensure_ascii=False))
