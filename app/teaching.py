"""Local, teacher-reviewed teaching references. No models, scripts or remote I/O."""
import hashlib
import json
import re
import uuid
from pathlib import Path

KINDS=('教案','复习资料','考试范围')


def _error(message):
    from store import ValidationError
    return ValidationError(message)


def _text(value,label,limit,required=False):
    from store import text_field
    return text_field(value,label,limit,required)


def _id(value):
    if not isinstance(value,str) or re.fullmatch('[a-f0-9]{32}',value) is None:
        raise _error('教学资料或条目编号无效')
    return value


def _version(value):
    if type(value) is not int or not 0 < value < 1000000:
        raise _error('教学资料版本无效')
    return value


def reference_shape(value):
    if value is None:return None
    if not isinstance(value,dict) or set(value)!={'material_id','version','entry_id'}:
        raise _error('教学引用格式无效')
    return dict(material_id=_id(value['material_id']),version=_version(value['version']),entry_id=_id(value['entry_id']))


def ensure_schema(db):
    db.execute('''CREATE TABLE IF NOT EXISTS teaching_materials(
        id TEXT PRIMARY KEY,document_id TEXT NOT NULL,document_sha256 TEXT NOT NULL UNIQUE,
        version INTEGER NOT NULL,body_json TEXT NOT NULL)''')
    db.execute('''CREATE TABLE IF NOT EXISTS teaching_material_versions(
        material_id TEXT NOT NULL REFERENCES teaching_materials(id),version INTEGER NOT NULL,
        body_json TEXT NOT NULL,PRIMARY KEY(material_id,version))''')


def _body(db,ident,version=None):
    _id(ident)
    if version is None:
        row=db.execute('SELECT body_json FROM teaching_materials WHERE id=?',(ident,)).fetchone()
    else:
        row=db.execute('SELECT body_json FROM teaching_material_versions WHERE material_id=? AND version=?',
                       (ident,_version(version))).fetchone()
    if not row:raise _error('教学资料或历史版本不存在')
    return json.loads(row['body_json'])


def _fields(payload,previous):
    kind=payload.get('kind',previous.get('kind','教案'))
    if kind not in KINDS:raise _error('资料类别须为教案、复习资料或考试范围')
    return dict(title=_text(payload.get('title',previous.get('title','')),'资料名称',160,True),kind=kind,
                scope=_text(payload.get('scope',previous.get('scope','')),'适用范围',300),
                edition=_text(payload.get('edition',previous.get('edition','')),'版本说明',160))


def _entries(values,previous=None):
    if not isinstance(values,list) or len(values)>100:raise _error('每份资料最多100个知识条目')
    old_ids=None if previous is None else {item['id'] for item in previous}
    result=[];seen=set()
    for value in values:
        if not isinstance(value,dict):raise _error('知识条目格式无效')
        ident=value.get('id') or uuid.uuid4().hex
        _id(ident)
        if ident in seen or value.get('id') and old_ids is not None and ident not in old_ids:
            raise _error('知识条目编号重复或不属于本份资料')
        seen.add(ident)
        result.append(dict(id=ident,knowledge=_text(value.get('knowledge',''),'知识点名称',200),
                           locator=_text(value.get('locator',''),'资料出处',300),
                           content=_text(value.get('content',''),'知识内容',4000),
                           question_type=_text(value.get('question_type',''),'题型',200)))
    return result


def _approval_ready(body):
    if not body['scope'] or not body['entries']:
        raise _error('请先填写适用范围和至少一个知识条目')
    if any(not all(entry.get(k,'').strip() for k in ('knowledge','locator','content')) for entry in body['entries']):
        raise _error('每个知识条目须填写名称、内容及页码或章节出处')


def _reference(db,ref):
    ref=reference_shape(ref)
    if ref is None:raise _error('未选择教学引用')
    body=_body(db,ref['material_id'],ref['version'])
    if body['status']!='APPROVED':raise _error('只能关联老师已审核的教学资料版本')
    entry=next((item for item in body['entries'] if item['id']==ref['entry_id']),None)
    if not entry:raise _error('知识条目不属于所选资料版本')
    current=_body(db,body['id'])
    return dict(entry,reference=ref,source_title=body['title'],kind=body['kind'],scope=body['scope'],edition=body['edition'],
                document_id=body['document_id'],document_filename=body['document_filename'],
                document_sha256=body['document_sha256'],is_current=current['version']==ref['version'],
                current_version=current['version'],source_version=ref['version'])


def validate_questions(db,questions):
    for question in questions:
        if question.get('teaching_ref'):
            entry=_reference(db,question['teaching_ref'])
            if question.get('knowledge','').strip()!=entry['knowledge']:
                raise _error('知识点与教学引用不一致，请重新关联或明确解除引用')


def validate_restored(db,files):
    for row in db.execute('SELECT * FROM teaching_materials'):
        current=json.loads(row['body_json'])
        _id(row['document_id']);_version(row['version'])
        if not isinstance(row['document_sha256'],str) or re.fullmatch('[a-f0-9]{64}',row['document_sha256']) is None:
            raise _error('教学原件索引校验值无效')
        if current['id']!=row['id'] or current['version']!=row['version']:
            raise _error('教学资料当前版本索引损坏')
        versions=db.execute('SELECT * FROM teaching_material_versions WHERE material_id=?',(row['id'],)).fetchall()
        found=False
        for version in versions:
            body=json.loads(version['body_json'])
            _version(body['version']);_version(version['version'])
            if (body.get('subject')!='数学' or body.get('document_id')!=row['document_id']
                    or body.get('document_sha256')!=row['document_sha256']):
                raise _error('教学资料学科或原件归属与索引不一致')
            if body['id']!=row['id'] or body['version']!=version['version'] or body['status'] not in ('DRAFT','APPROVED'):
                raise _error('教学资料历史版本损坏')
            _fields(body,{});_entries(body['entries'])
            if body['status']=='APPROVED':
                _approval_ready(body)
                if not isinstance(body.get('approved_at'),str) or not body['approved_at']:
                    raise _error('教学资料缺少审核时间')
            ident=_id(body['document_id']);meta_name='documents/'+ident+'.json'
            if meta_name not in files:raise _error('备份缺少教学资料原件索引')
            meta=json.loads(files[meta_name]);storage=meta.get('storage_name','')
            filename=body.get('document_filename')
            if (not isinstance(filename,str) or not filename or any(c in filename for c in '/\\\x00:')
                    or meta.get('id')!=ident or meta.get('filename')!=filename
                    or Path(filename).suffix.lower() not in ('.docx','.pdf','.png','.jpg','.jpeg','.webp')
                    or storage!=ident+Path(filename).suffix.lower()):
                raise _error('教学原件元数据与资料归属不一致')
            if not storage.startswith(ident+'.') or '/' in storage or '\\' in storage:
                raise _error('教学原件路径无效')
            raw=files.get('documents/'+storage)
            if raw is None or hashlib.sha256(raw).hexdigest()!=body['document_sha256'] or meta.get('sha256')!=body['document_sha256']:
                raise _error('备份缺少教学原件或原件校验不符')
            if version['version']==row['version']:
                if body!=current:raise _error('教学资料当前内容与快照不一致')
                found=True
        if not found:raise _error('教学资料缺少当前版本快照')
    for table,column in (('papers','questions_json'),('review_events','body_json')):
        for row in db.execute('SELECT '+column+' FROM '+table):
            parsed=json.loads(row[0]);validate_questions(db,parsed if isinstance(parsed,list) else [parsed])


class Library:
    def __init__(self,store):self.store=store

    def create(self,payload):
        from files import get_document
        from store import dump,now
        meta,path=get_document(self.store.root,payload.get('document_id'))
        if hashlib.sha256(path.read_bytes()).hexdigest()!=meta['sha256']:
            raise _error('教学原件校验不符，请重新导入')
        with self.store.lock,self.store.db() as db:
            old=db.execute('SELECT id FROM teaching_materials WHERE document_sha256=?',(meta['sha256'],)).fetchone()
            if old:return self._get(db,old['id'])
            if db.execute('SELECT COUNT(*) FROM teaching_materials').fetchone()[0]>=200:
                raise _error('本地试用最多200份教学资料')
            ident=uuid.uuid4().hex
            fields=_fields(payload,dict(title=meta['filename']))
            body=dict(id=ident,version=1,status='DRAFT',subject='数学',entries=[],approved_at=None,
                      document_id=meta['id'],document_filename=meta['filename'],document_sha256=meta['sha256'],
                      created_at=now(),updated_at=now(),**fields)
            db.execute('INSERT INTO teaching_materials VALUES(?,?,?,?,?)',(ident,meta['id'],meta['sha256'],1,dump(body)))
            db.execute('INSERT INTO teaching_material_versions VALUES(?,?,?)',(ident,1,dump(body)))
            return self._get(db,ident)

    def _get(self,db,ident,version=None):
        from files import get_document
        body=_body(db,ident,version)
        meta,path=get_document(self.store.root,body['document_id'])
        if meta['sha256']!=body['document_sha256'] or hashlib.sha256(path.read_bytes()).hexdigest()!=body['document_sha256']:
            raise _error('教学原件校验不符，请重新导入或从有效备份恢复')
        return body|dict(document=meta,current_version=_body(db,ident)['version'])

    def get(self,ident,version=None):
        with self.store.lock,self.store.db() as db:return self._get(db,ident,version)

    def list(self):
        with self.store.lock,self.store.db() as db:
            result=[]
            for row in db.execute('SELECT body_json FROM teaching_materials ORDER BY rowid DESC'):
                body=json.loads(row[0]);result.append({k:body[k] for k in ('id','title','kind','scope','edition','version','status','document_filename')}|dict(entry_count=len(body['entries'])))
            return result

    def save(self,ident,version,payload):
        from store import ConflictError,dump,now
        _version(version)
        with self.store.lock,self.store.db() as db:
            old=_body(db,ident)
            if old['version']!=version:raise ConflictError('教学资料已更新，请重新读取后核对')
            fields=_fields(payload,old)
            entries=_entries(payload.get('entries',old['entries']),old['entries'])
            if entries==old['entries'] and all(fields[k]==old[k] for k in fields):return self._get(db,ident)
            body=old|fields|dict(entries=entries,version=version+1,status='DRAFT',approved_at=None,updated_at=now())
            db.execute('UPDATE teaching_materials SET version=?,body_json=? WHERE id=?',(body['version'],dump(body),ident))
            db.execute('INSERT INTO teaching_material_versions VALUES(?,?,?)',(ident,body['version'],dump(body)))
            return self._get(db,ident)

    def approve(self,ident,version,consent):
        from store import ConflictError,dump,now
        _version(version)
        if consent is not True:raise _error('须由老师明确核对正文、公式、适用范围及出处')
        with self.store.lock,self.store.db() as db:
            body=_body(db,ident)
            if body['version']!=version:raise ConflictError('教学资料版本已变化，请重新审核')
            _approval_ready(body)
            if body['status']=='APPROVED':return self._get(db,ident)
            body=body|dict(status='APPROVED',approved_at=now(),updated_at=now())
            db.execute('UPDATE teaching_materials SET body_json=? WHERE id=?',(dump(body),ident))
            db.execute('UPDATE teaching_material_versions SET body_json=? WHERE material_id=? AND version=?',(dump(body),ident,version))
            return self._get(db,ident)

    def reference(self,ref):
        with self.store.lock,self.store.db() as db:return _reference(db,ref)

    def catalog(self):
        with self.store.lock,self.store.db() as db:
            result=[];seen=set()
            for row in db.execute('SELECT * FROM teaching_material_versions ORDER BY material_id,version DESC'):
                body=json.loads(row['body_json'])
                if body['id'] in seen or body['status']!='APPROVED':continue
                seen.add(body['id'])
                for entry in body['entries']:
                    result.append(_reference(db,dict(material_id=body['id'],version=body['version'],entry_id=entry['id'])))
            return result

    def paper_links(self,paper_id):
        with self.store.lock,self.store.db() as db:
            paper=self.store._paper(db,paper_id)
            return dict(paper_id=paper_id,version=paper['version'],links={q['id']:_reference(db,q['teaching_ref']) for q in paper['questions'] if q.get('teaching_ref')})
