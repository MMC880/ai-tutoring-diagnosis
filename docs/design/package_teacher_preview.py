"""Wrap the existing verified v0.26 package for a first teacher preview; no app edits."""
from pathlib import Path
import hashlib
import json
import re
import zipfile

project=Path(__file__).resolve().parents[2]
delivery=project/'docs/delivery'
previous=delivery/'jinxue-local-trial-v0.26.0.zip'
metadata=json.loads((delivery/'LOCAL_TRIAL_PACKAGE-v0.26.0.json').read_text(encoding='utf-8'))
assert hashlib.sha256(previous.read_bytes()).hexdigest()==metadata['sha256']
prefix='Jinxue-Local/'
data={}
with zipfile.ZipFile(previous) as archive:
    assert archive.testzip() is None
    for line in archive.read(prefix+'MANIFEST.sha256').decode().splitlines():
        expected,relative=line.split('  ',1)
        assert hashlib.sha256(archive.read(prefix+relative)).hexdigest()==expected
    for name in archive.namelist():
        if name.endswith('/') or name==prefix+'MANIFEST.sha256':continue
        assert name.startswith(prefix) and '..' not in Path(name).parts
        raw=archive.read(name)
        relative=name[len(prefix):]
        if not relative.startswith('evidence/'):
            assert raw==(project/'app'/relative).read_bytes(),relative
        data[name]=raw

for destination,source in {
    '先看这里.md':'docs/pilot/TEACHER_PREVIEW_QUICKSTART.md',
    '第一版范围与待补项.md':'docs/pilot/TEACHER_PREVIEW_SCOPE.md',
}.items():data[prefix+destination]=(project/source).read_bytes()
for name,raw in data.items():
    assert not any(part.startswith('.') or part in ('__pycache__','backups','uploads') for part in Path(name).parts)
    assert Path(name).suffix.lower() not in ('.db','.sqlite3','.key','.pem','.env')
    if not name.endswith('.png'):assert not re.search(rb'sk-[A-Za-z0-9_-]{25,}',raw),name

data[prefix+'MANIFEST.sha256']=''.join(hashlib.sha256(raw).hexdigest()+'  '+name[len(prefix):]+'\n' for name,raw in data.items()).encode()
target=delivery/'jinxue-teacher-preview-v0.26.0-20261108.zip'
assert not target.exists(), 'Do not overwrite an earlier preview release'
with zipfile.ZipFile(target,'w',compression=zipfile.ZIP_DEFLATED) as archive:
    for name,raw in data.items():archive.writestr(name,raw)
with zipfile.ZipFile(target) as archive:
    assert archive.testzip() is None
    assert len(archive.namelist())==len(set(archive.namelist()))
    for line in archive.read(prefix+'MANIFEST.sha256').decode().splitlines():
        expected,relative=line.split('  ',1)
        assert hashlib.sha256(archive.read(prefix+relative)).hexdigest()==expected
result=dict(file=target.name,kind='FIRST_TEACHER_PREVIEW',engine_version='0.26.0',
    files=len(data),manifest_entries=len(data)-1,size=target.stat().st_size,
    sha256=hashlib.sha256(target.read_bytes()).hexdigest(),crc='PASS',source_matches=True,
    requires_existing_python=True,standalone_exe=False,
    historical_engine_tests='Existing v0.26 evidence retained; not rerun by package creation',
    new_direction_mvp_complete=False,real_student_data_included=False,credentials_included=False)
(delivery/'TEACHER_PREVIEW-20261108.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps(result,ensure_ascii=False))
