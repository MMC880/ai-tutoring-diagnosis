"""Read/backup only: compare local business rows across the v0.24 update."""
import hashlib,json,sqlite3,sys,urllib.request,urllib.parse
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
    result=snapshot();target=root/'backups'/('pre-v024-'+datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S')+'.sqlite3')
    source=sqlite3.connect((root/'records.sqlite3').as_uri()+'?mode=ro',uri=True);dest=sqlite3.connect(target)
    try:source.backup(dest);assert dest.execute('PRAGMA quick_check').fetchone()[0]=='ok'
    finally:dest.close();source.close()
    result.update(version='OFFLINE',database_backup=target.name,backup_sha256=hashlib.sha256(target.read_bytes()).hexdigest())
    (out/'teaching-search-live-before.json').write_text(json.dumps(result,indent=2)+'\n',encoding='utf-8')
    print(json.dumps(result));raise SystemExit()
health,settings,boot,jobs=get('/api/health'),get('/api/ai/settings'),get('/api/bootstrap'),get('/api/ai/jobs')
assert not settings['key_loaded'],'Key loaded: do not restart'
assert not any(job['status'] in ('SENDING','RUNNING') for job in jobs),'Active job: do not restart'
result=snapshot();result.update(version=health['version'],key_loaded=False,pilot_records=len(get('/api/pilot/runs')))
db=sqlite3.connect((root/'records.sqlite3').as_uri()+'?mode=ro',uri=True)
try:result['material_snapshots']=db.execute('SELECT count(*) FROM paper_document_versions').fetchone()[0]
finally:db.close()
if mode=='before':
    assert health['version']=='0.23.0'
    request=urllib.request.Request(base+'/api/backups',data=b'{}',headers={'Content-Type':'application/json','X-Jinxue-Token':boot['csrf_token']})
    result['backup']=json.load(opener.open(request,timeout=30))
elif mode=='after':
    assert health['version']=='0.24.0'
    before=json.loads((out/'teaching-search-live-before.json').read_text())
    assert result['business_sha256']==before['business_sha256'] and result['counts']==before['counts']
    assert opener.open(base+'/app.js').read()==(project/'app/web/app.js').read_bytes()
    assert result['pilot_records']==before['pilot_records']
    assert opener.open(base+'/intake-panel.js').read()==(project/'app/web/intake-panel.js').read_bytes()
    batches=get('/api/intake')['batches'];assert sum(b['paper_count'] for b in batches)==result['counts']['papers']
    assert opener.open(base+'/materials-panel.js').read()==(project/'app/web/materials-panel.js').read_bytes()
    db=sqlite3.connect((root/'records.sqlite3').as_uri()+'?mode=ro',uri=True)
    try:assert db.execute('SELECT count(*) FROM paper_document_versions').fetchone()[0]==before['material_snapshots']
    finally:db.close()
    assert opener.open(base+'/queue-panel.js').read()==(project/'app/web/queue-panel.js').read_bytes()
    result['queue_panel_static_matches']=True
    assert opener.open(base+'/report-panel.js').read()==(project/'app/web/report-panel.js').read_bytes()
    result['report_panel_static_matches']=True
    assert opener.open(base+'/teaching-catalog.js').read()==(project/'app/web/teaching-catalog.js').read_bytes()
    result['teaching_search_static_matches']=True
    assert get('/api/teaching/catalog')==[]
    result['no_invented_teaching_entries']=True
    for student in boot['students']:
        report=get('/api/profiles/'+student['id']+'/report')
        assert report['record_count']==0 and report['history_count']==0
    result['reports_readonly_no_invented_records']=True
    for batch in batches:
        summary=get('/api/summary?batch='+urllib.parse.quote(batch['batch_id']))
        assert 'class_analysis' in summary
        if not summary['confirmed_students']:assert summary['class_analysis']['groups']==[]
    result['intake_metadata_matches']=True
    assert get('/api/launch-info')==dict(application_directory=str((project/'app').resolve()),data_directory=str(root.resolve()))
    result['launch_identity_matches']=True
    result['business_state_unchanged']=True
    queue=get('/api/practice-queue')
    assert len(queue['items'])==result['counts']['exercises']
    assert sum(queue['counts'].values())==len(queue['items'])
    for student in boot['students']:
        profile=get('/api/profiles/'+student['id'])
        assert 'unmatched_followup_count' in profile['learning_analysis']
        assert all('followup' in g for g in profile['learning_analysis']['groups'])
else:raise SystemExit('before or after required')
(out/('teaching-search-live-'+mode+'.json')).write_text(json.dumps(result,indent=2)+'\n',encoding='utf-8')
print(json.dumps(result))
