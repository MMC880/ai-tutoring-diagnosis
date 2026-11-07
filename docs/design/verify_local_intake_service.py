"""Read/backup only: compare local business rows across the v0.17 update."""
import hashlib,json,sqlite3,sys,urllib.request
from pathlib import Path
project=Path(__file__).resolve().parents[2];out=project/'docs/design';root=project/'app/.local-data'
opener=urllib.request.build_opener(urllib.request.ProxyHandler({}));base='http://127.0.0.1:8765'
def get(route):return json.load(opener.open(base+route,timeout=10))
def snapshot():
    db=sqlite3.connect((root/'records.sqlite3').as_uri()+'?mode=ro',uri=True)
    try:
        tables=('students','papers','review_events','exercises','exercise_versions','retests','ai_jobs','teaching_materials','teaching_material_versions')
        content={name:db.execute('SELECT * FROM '+name+' ORDER BY rowid').fetchall() for name in tables}
        digest=hashlib.sha256(json.dumps(content,sort_keys=True,ensure_ascii=False,separators=(',',':')).encode()).hexdigest()
        return dict(counts={name:len(rows) for name,rows in content.items()},business_sha256=digest)
    finally:db.close()
mode=sys.argv[1]
if mode=='before-offline':
    from datetime import datetime,timezone
    result=snapshot();target=root/'backups'/('pre-v017-'+datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S')+'.sqlite3')
    source=sqlite3.connect((root/'records.sqlite3').as_uri()+'?mode=ro',uri=True);dest=sqlite3.connect(target)
    try:source.backup(dest);assert dest.execute('PRAGMA quick_check').fetchone()[0]=='ok'
    finally:dest.close();source.close()
    result.update(version='OFFLINE',database_backup=target.name,backup_sha256=hashlib.sha256(target.read_bytes()).hexdigest())
    (out/'intake-live-before.json').write_text(json.dumps(result,indent=2)+'\n',encoding='utf-8')
    print(json.dumps(result));raise SystemExit()
health,settings,boot,jobs=get('/api/health'),get('/api/ai/settings'),get('/api/bootstrap'),get('/api/ai/jobs')
assert not settings['key_loaded'],'Key loaded: do not restart'
assert not any(job['status'] in ('SENDING','RUNNING') for job in jobs),'Active job: do not restart'
result=snapshot();result.update(version=health['version'],key_loaded=False,pilot_records=len(get('/api/pilot/runs')))
if mode=='before':
    assert health['version']=='0.16.0'
    request=urllib.request.Request(base+'/api/backups',data=b'{}',headers={'Content-Type':'application/json','X-Jinxue-Token':boot['csrf_token']})
    result['backup']=json.load(opener.open(request,timeout=30))
elif mode=='after':
    assert health['version']=='0.17.0'
    before=json.loads((out/'intake-live-before.json').read_text())
    assert result['business_sha256']==before['business_sha256'] and result['counts']==before['counts']
    assert opener.open(base+'/app.js').read()==(project/'app/web/app.js').read_bytes()
    assert result['pilot_records']==before['pilot_records']
    assert opener.open(base+'/intake-panel.js').read()==(project/'app/web/intake-panel.js').read_bytes()
    batches=get('/api/intake')['batches'];assert sum(b['paper_count'] for b in batches)==result['counts']['papers']
    result['intake_metadata_matches']=True
    assert get('/api/launch-info')==dict(application_directory=str((project/'app').resolve()),data_directory=str(root.resolve()))
    result['launch_identity_matches']=True
    result['business_state_unchanged']=True
else:raise SystemExit('before or after required')
(out/('intake-live-'+mode+'.json')).write_text(json.dumps(result,indent=2)+'\n',encoding='utf-8')
print(json.dumps(result))
