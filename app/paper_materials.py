"""Teacher-authorized material revision with historical attachment snapshots."""
import json

def ensure_schema(db):
    if 'material_history_papers' not in {r[1] for r in db.execute('PRAGMA table_info(meta)')}:
        db.execute("ALTER TABLE meta ADD COLUMN material_history_papers TEXT NOT NULL DEFAULT '[]'")
    db.execute('''CREATE TABLE IF NOT EXISTS paper_document_versions(
        paper_id TEXT NOT NULL REFERENCES papers(id),version INTEGER NOT NULL,
        documents_json TEXT NOT NULL,PRIMARY KEY(paper_id,version))''')

def registered_papers(db):
    from store import ValidationError
    rows=db.execute('SELECT material_history_papers FROM meta').fetchall()
    if len(rows)!=1:raise ValidationError('材料历史登记无效')
    ids=json.loads(rows[0][0])
    if (not isinstance(ids,list) or any(not isinstance(p,str) or len(p)!=32 or any(c not in '0123456789abcdef' for c in p) for p in ids)
        or len(ids)!=len(set(ids))):raise ValidationError('材料历史登记损坏')
    return set(ids)

def documents_at(db,paper_id,revision,fallback):
    if paper_id in registered_papers(db) and not db.execute('SELECT 1 FROM paper_document_versions WHERE paper_id=? AND version=0',(paper_id,)).fetchone():
        from store import ValidationError
        raise ValidationError('材料历史缺失，不能用当前附件代替历史原件')
    row=db.execute('''SELECT documents_json FROM paper_document_versions
        WHERE paper_id=? AND version>=? ORDER BY version LIMIT 1''',(paper_id,revision)).fetchone()
    return json.loads(row[0]) if row else fallback

def update_documents(store,paper_id,payload):
    from store import ValidationError,ConflictError,dump,now
    if payload.get('consent') is not True:raise ValidationError('需要明确确认材料属于本卷并保存待审')
    version=payload.get('version')
    if type(version) is not int or version<1:raise ValidationError('材料来源版本须为正整数')
    with store.lock,store.db() as db:
        paper=store._paper(db,paper_id)
        if payload.get('student_id')!=paper['student_id']:raise ConflictError('材料目标学生不匹配，请重新打开正确整卷')
        if version!=paper['version']:raise ConflictError('原卷已更新，请重新核对当前版本材料')
        docs=store._documents(payload.get('documents'))
        by_id={d['id']:d for d in docs}
        if len(by_id)!=len(docs):raise ValidationError('同一附件编号不能重复挂到本卷')
        if any(d['id'] not in by_id or by_id[d['id']]['role']!=d.get('role','作业') for d in paper['documents']):
            raise ValidationError('必须保留已有原件及用途；本入口不删除或替换原件')
        if docs==paper['documents']:return paper
        registered=registered_papers(db)
        if paper_id in registered and not db.execute('SELECT 1 FROM paper_document_versions WHERE paper_id=? AND version=0',(paper_id,)).fetchone():raise ConflictError('材料历史缺失，已停止保存')
        anchor=db.execute('SELECT 1 FROM paper_document_versions WHERE paper_id=? AND version=0',(paper_id,)).fetchone()
        if not anchor:
            if db.execute('SELECT 1 FROM paper_document_versions WHERE paper_id=?',(paper_id,)).fetchone():raise ConflictError('材料原始历史缺失，已停止保存')
            db.execute('INSERT INTO paper_document_versions VALUES(?,?,?)',(paper_id,0,dump(paper['documents'])))
        for v,items in ((version,paper['documents']),(version+1,docs)):
            old=db.execute('SELECT documents_json FROM paper_document_versions WHERE paper_id=? AND version=?',(paper_id,v)).fetchone()
            if old and json.loads(old[0])!=items:raise ConflictError('材料历史与当前卷不一致，已停止保存')
            if not old:db.execute('INSERT INTO paper_document_versions VALUES(?,?,?)',(paper_id,v,dump(items)))
        db.execute('UPDATE papers SET documents_json=?,version=version+1,updated_at=? WHERE id=?',(dump(docs),now(),paper_id))
        db.execute('UPDATE meta SET material_history_papers=?',(dump(sorted(registered|{paper_id})),))
        return store._paper(db,paper_id)

def validate_restored(db):
    from store import ValidationError
    registered=registered_papers(db)
    if registered!={r[0] for r in db.execute('SELECT DISTINCT paper_id FROM paper_document_versions')}:
        raise ValidationError('备份材料历史与变更登记不一致，不能按旧备份处理')
    for paper in db.execute('SELECT id,version,documents_json FROM papers').fetchall():
        current=json.loads(paper['documents_json']);canonical={d['id']:d for d in current}
        rows=db.execute('SELECT * FROM paper_document_versions WHERE paper_id=? ORDER BY version',(paper['id'],)).fetchall()
        if rows and (len(rows)<3 or rows[0]['version']!=0):raise ValidationError('备份缺少材料原始历史')
        previous=None
        for row in rows:
            docs=json.loads(row['documents_json']);version=row['version']
            if type(version) is not int or not 0<=version<=paper['version'] or not isinstance(docs,list) or len(docs)>20:
                raise ValidationError('备份材料历史版本或数量损坏')
            if any(not isinstance(d,dict) or d.get('id') not in canonical or d!=canonical[d['id']] for d in docs):
                raise ValidationError('备份材料历史不属于本卷原件')
            if len({d['id'] for d in docs})!=len(docs):raise ValidationError('备份材料历史编号重复')
            if previous:
                old_version,old_docs=previous
                if (docs!=old_docs and version!=old_version+1) or not {d['id'] for d in old_docs}.issubset(d['id'] for d in docs):
                    raise ValidationError('备份材料历史缺少变化前版本或丢失原件')
            previous=(version,docs)
        if rows and previous[1]!=current:raise ValidationError('备份当前材料与最新历史不一致')
