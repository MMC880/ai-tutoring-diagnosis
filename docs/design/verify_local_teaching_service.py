"""Local release snapshot, counts/hashes only; never output student text or keys."""
import hashlib,json,sqlite3,sys,urllib.request
from datetime import datetime,timezone
from pathlib import Path

project=Path(__file__).resolve().parents[2];out=project/'docs/design';root=project/'app/.local-data'
TABLES=('students','papers','review_events','exercises','exercise_versions','retests','ai_jobs')
def snapshot():
    db=sqlite3.connect((root/'records.sqlite3').as_uri()+'?mode=ro',uri=True)
    try:
        content={}
        for name in TABLES:
            if db.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?",(name,)).fetchone():
                content[name]=db.execute('SELECT * FROM '+name+' ORDER BY rowid').fetchall()
        raw=json.dumps(content,ensure_ascii=False,separators=(',',':'),sort_keys=True).encode()
        return dict(counts={name:len(rows) for name,rows in content.items()},business_sha256=hashlib.sha256(raw).hexdigest())
    finally:db.close()
mode=sys.argv[1]
if mode=='before-offline':
    result=snapshot();folder=root/'backups';folder.mkdir(exist_ok=True)
    name='pre-v011-'+datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S')+'.sqlite3';target=folder/name
    source=sqlite3.connect((root/'records.sqlite3').as_uri()+'?mode=ro',uri=True);dest=sqlite3.connect(target)
    try:source.backup(dest);assert dest.execute('PRAGMA quick_check').fetchone()[0]=='ok'
    finally:dest.close();source.close()
    result.update(starting_service='OFFLINE',database_backup=name,backup_sha256=hashlib.sha256(target.read_bytes()).hexdigest())
    (out/'teaching-live-before.json').write_text(json.dumps(result,indent=2)+'\n',encoding='utf-8')
elif mode=='after':
    opener=urllib.request.build_opener(urllib.request.ProxyHandler({}));base='http://127.0.0.1:8765'
    def get(route):return json.load(opener.open(base+route,timeout=10))
    health,settings,boot,jobs=get('/api/health'),get('/api/ai/settings'),get('/api/bootstrap'),get('/api/ai/jobs')
    assert health['version']=='0.11.0' and not settings['key_loaded']
    assert not any(job['status'] in ('SENDING','RUNNING') for job in jobs)
    result=snapshot();before=json.loads((out/'teaching-live-before.json').read_text())
    assert result['business_sha256']==before['business_sha256'] and result['counts']==before['counts']
    assert get('/api/teaching/materials')==[] and get('/api/teaching/catalog')==[]
    assert opener.open(base+'/teaching-panel.js').read()==(project/'app/web/teaching-panel.js').read_bytes()
    request=urllib.request.Request(base+'/api/backups',data=b'{}',headers={'Content-Type':'application/json','X-Jinxue-Token':boot['csrf_token']})
    result.update(version=health['version'],key_loaded=False,library_materials=0,business_state_unchanged=True,
                  full_backup=json.load(opener.open(request,timeout=30)))
    (out/'teaching-live-after.json').write_text(json.dumps(result,indent=2)+'\n',encoding='utf-8')
else:raise SystemExit('before-offline or after')
print(json.dumps(result))
