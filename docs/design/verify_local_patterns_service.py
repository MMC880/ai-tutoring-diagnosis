"""Read/backup only: compare local business rows across the v0.12 update."""
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
mode=sys.argv[1];health,settings,boot,jobs=get('/api/health'),get('/api/ai/settings'),get('/api/bootstrap'),get('/api/ai/jobs')
assert not settings['key_loaded'],'Key loaded: do not restart'
assert not any(job['status'] in ('SENDING','RUNNING') for job in jobs),'Active job: do not restart'
result=snapshot();result.update(version=health['version'],key_loaded=False)
if mode=='before':
    assert health['version']=='0.11.0'
    request=urllib.request.Request(base+'/api/backups',data=b'{}',headers={'Content-Type':'application/json','X-Jinxue-Token':boot['csrf_token']})
    result['backup']=json.load(opener.open(request,timeout=30))
elif mode=='after':
    assert health['version']=='0.12.0'
    before=json.loads((out/'patterns-live-before.json').read_text())
    assert result['business_sha256']==before['business_sha256'] and result['counts']==before['counts']
    assert opener.open(base+'/learning-panel.js').read()==(project/'app/web/learning-panel.js').read_bytes()
    result['business_state_unchanged']=True
else:raise SystemExit('before or after required')
(out/('patterns-live-'+mode+'.json')).write_text(json.dumps(result,indent=2)+'\n',encoding='utf-8')
print(json.dumps(result))
