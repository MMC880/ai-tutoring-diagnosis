"""Build from previous explicit source allowlist; never scan local records/photos."""
from pathlib import Path
import hashlib
import json
import re
import zipfile

project = Path(__file__).resolve().parents[2]
delivery = project / 'docs/delivery'
old = delivery / 'jinxue-local-trial-v0.11.0.zip'
target = delivery / 'jinxue-local-trial-v0.12.0.zip'
with zipfile.ZipFile(old) as archive:
    names = [n for n in archive.namelist() if not n.endswith('/') and not n.endswith('MANIFEST.sha256') and '/evidence/' not in n]
prefix = 'Jinxue-Local/'
new_files = ['tests/test_knowledge_patterns.py', 'tests/check_knowledge_patterns.mjs', '知识问题归组使用说明.md']
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
    'automated-tests.txt': project/'docs/design/patterns-python-final.txt',
    'knowledge-patterns-checks.json': project/'docs/design/knowledge-patterns-browser/verification.json',
    'learning-regression-checks.json': project/'docs/design/learning-evidence-preview/verification.json',
    'archive-regression-checks.json': project/'docs/design/student-archive-browser/verification.json',
    'teaching-regression-checks.json': project/'docs/design/teaching-library-browser/verification.json',
    'patterns-ui-checks.txt': project/'docs/design/patterns-ui-green.txt',
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
              crc='PASS',verified=True,source_allowlist='v0.11 source allowlist plus 3 source files; current synthetic grouping and regression evidence',
              excluded=['.local-data','.qa-temp','real student photos','pilot reports','credentials','browser profiles'])
(delivery/'LOCAL_TRIAL_PACKAGE-v0.12.0.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps(result,ensure_ascii=False))
