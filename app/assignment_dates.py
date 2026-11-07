"""Teacher-supplied calendar date effective from a paper revision, no inference."""
import re
from datetime import date


def validate_date(value):
    from store import ValidationError
    if value=='':return ''
    if not isinstance(value,str) or not re.fullmatch(r'[0-9]{4}-[0-9]{2}-[0-9]{2}',value):
        raise ValidationError('作业日期须为YYYY-MM-DD，未提供请留空')
    try:date.fromisoformat(value)
    except ValueError as exc:raise ValidationError('作业日期不是有效日历日期') from exc
    return value


def ensure_schema(db):
    db.execute('''CREATE TABLE IF NOT EXISTS paper_assignment_dates(
        paper_id TEXT NOT NULL REFERENCES papers(id),version INTEGER NOT NULL,
        assignment_date TEXT NOT NULL,PRIMARY KEY(paper_id,version))''')


def date_at(db,paper_id,version):
    row=db.execute('''SELECT assignment_date FROM paper_assignment_dates
        WHERE paper_id=? AND version<=? ORDER BY version DESC LIMIT 1''',(paper_id,version)).fetchone()
    return row[0] if row else ''


def attach_events(db,events):
    for event in events:event['assignment_date']=date_at(db,event['paper_id'],event['revision'])
    return events


def update(store,paper_id,payload):
    from store import ValidationError,ConflictError,now
    version=payload.get('version')
    if type(version) is not int or not 1<=version<1000000:raise ValidationError('原卷日期版本无效')
    value=validate_date(payload.get('assignment_date'))
    with store.lock,store.db() as db:
        p=store._paper(db,paper_id)
        if p['version']!=version:raise ConflictError('原卷已更新，请重新读取后核对作业日期')
        if value==p['assignment_date']:return p
        changed=db.execute('UPDATE papers SET version=version+1,updated_at=? WHERE id=? AND version=?',(now(),paper_id,version))
        if changed.rowcount!=1:raise ConflictError('原卷已更新，请重新读取后核对作业日期')
        db.execute('INSERT INTO paper_assignment_dates VALUES(?,?,?)',(paper_id,version+1,value))
        return store._paper(db,paper_id)


def validate_restored(db):
    from store import ValidationError
    columns={r['name']:(r['type'].upper(),r['notnull'],r['pk']) for r in db.execute('PRAGMA table_info(paper_assignment_dates)')}
    expected=dict(paper_id=('TEXT',1,1),version=('INTEGER',1,2),assignment_date=('TEXT',1,0))
    foreign=[r for r in db.execute('PRAGMA foreign_key_list(paper_assignment_dates)')
             if r['table']=='papers' and r['from']=='paper_id' and r['to']=='id']
    if columns!=expected or len(foreign)!=1:
        raise ValidationError('作业日期历史表结构或约束无效')
    if db.execute('SELECT 1 FROM paper_assignment_dates GROUP BY paper_id,version HAVING count(*)>1').fetchone():
        raise ValidationError('作业日期存在重复生效版本')
    for row in db.execute('''SELECT d.*,p.version current_version FROM paper_assignment_dates d
            LEFT JOIN papers p ON p.id=d.paper_id'''):
        if row['current_version'] is None or type(row['version']) is not int or not 1<=row['version']<=row['current_version']:
            raise ValidationError('作业日期历史归属或生效版本无效')
        validate_date(row['assignment_date'])
