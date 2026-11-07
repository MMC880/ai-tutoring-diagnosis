"""Exact original confirmation -> exercise versions -> observed retests, no mastery inference."""
import json

def ensure_schema(db):
    db.execute('''CREATE TABLE IF NOT EXISTS exercise_origins(
        exercise_id TEXT PRIMARY KEY REFERENCES exercises(id),
        source_event_id INTEGER NOT NULL REFERENCES review_events(id))''')

def validate_restored(db):
    from store import ValidationError
    for row in db.execute('''SELECT v.version,v.body_json,e.id,e.paper_id,e.question_id,p.student_id
        FROM exercise_versions v JOIN exercises e ON e.id=v.exercise_id JOIN papers p ON p.id=e.paper_id'''):
        body=json.loads(row['body_json'])
        if (not isinstance(body,dict) or type(body.get('version')) is not int
                or any(body.get(k)!=row[k] for k in ('id','version','paper_id','question_id','student_id'))):
            raise ValidationError('练习历史版本归属不一致')
    for row in db.execute('''SELECT r.*,v.body_json FROM retests r
        JOIN exercise_versions v ON v.exercise_id=r.exercise_id AND v.version=r.version'''):
        body=json.loads(row['snapshot_json']);version=json.loads(row['body_json'])
        if (body.get('id')!=row['exercise_id'] or body.get('student_id')!=row['student_id']
                or body.get('version')!=row['version'] or body.get('status')!='APPROVED'
                or any(body.get(k)!=version.get(k) for k in ('id','student_id','paper_id','question_id','version','level','stem','answer','explanation','status','approved_at'))):
            raise ValidationError('复测题面快照与练习历史版本不一致')
    for row in db.execute('''SELECT o.*,e.paper_id,e.question_id,p.student_id,r.paper_id rp,r.question_id rq,
        r.student_id rs,r.revision,r.result FROM exercise_origins o
        JOIN exercises e ON e.id=o.exercise_id JOIN papers p ON p.id=e.paper_id
        LEFT JOIN review_events r ON r.id=o.source_event_id'''):
        if row['rp']!=row['paper_id'] or row['rq']!=row['question_id'] or row['rs']!=row['student_id'] or row['result'] not in ('INCORRECT','PARTIAL'):
            raise ValidationError('补练原题确认归属不一致')
        for version in db.execute('SELECT body_json FROM exercise_versions WHERE exercise_id=?',(row['exercise_id'],)):
            body=json.loads(version[0])
            if body.get('source_event_id')!=row['source_event_id'] or body.get('source_revision')!=row['revision']:
                raise ValidationError('补练版本的原题依据不一致')
        for retest in db.execute('SELECT snapshot_json FROM retests WHERE exercise_id=?',(row['exercise_id'],)):
            body=json.loads(retest[0])
            if body.get('source_event_id')!=row['source_event_id'] or body.get('source_revision')!=row['revision']:
                raise ValidationError('复测快照的原题依据不一致')

def retest_observation(retests,approved):
    if not retests:return 'WAITING_RETEST' if approved else 'WAITING_APPROVAL'
    last=retests[-1]
    if last['result'] in ('PENDING','MISSING') or not last['answer'].strip():return 'RETEST_UNRESOLVED'
    if last['condition']=='完成条件待核实':return 'CONDITION_UNCONFIRMED'
    if last['result'] in ('INCORRECT','PARTIAL'):return 'NEEDS_REVIEW'
    if last['condition']!='独立完成':return 'NEEDS_INDEPENDENT_RETEST'
    return 'INDEPENDENT_CORRECT_OBSERVE'


def build(store,db,student_id,events):
    by_event={e['id']:e for e in events};latest={}
    for event in events:latest[(event['paper_id'],event['question_id'])]=event['id']
    result=[]
    for row in db.execute('SELECT e.id FROM exercises e JOIN papers p ON p.id=e.paper_id WHERE p.student_id=? ORDER BY e.rowid DESC',(student_id,)).fetchall():
        e=store._exercise(db,row[0]);source=by_event.get(e.get('source_event_id'))
        versions=[json.loads(r[0]) for r in db.execute('SELECT body_json FROM exercise_versions WHERE exercise_id=? ORDER BY version',(e['id'],))]
        retests=[]
        for r in db.execute('SELECT * FROM retests WHERE exercise_id=? AND student_id=? ORDER BY rowid',(e['id'],student_id)):
            retests.append(dict(r)|dict(exercise_snapshot=json.loads(r['snapshot_json'])))
        observation=retest_observation(retests,any(v['status']=='APPROVED' for v in versions))
        result.append(dict(exercise=e,versions=versions,source=source,retests=retests,observation=observation,
            current_draft=e['status']!='APPROVED',
            source_has_later_confirmation=bool(source and latest.get((e['paper_id'],e['question_id']))!=source['id'])))
    return result
