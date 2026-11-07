"""Local, versioned teacher review records. Public methods serialize writes."""
from contextlib import contextmanager
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import sqlite3
import threading
import uuid
import zipfile
import grading
import teaching
import learning_journey
import pilot
import paper_materials


class ValidationError(ValueError):
    pass


class ConflictError(ValidationError):
    pass


RESULTS = ('CORRECT', 'INCORRECT', 'PARTIAL', 'PENDING', 'MISSING')
LEVELS = ('基础巩固', '综合运用', '迁移挑战')


def now():
    return datetime.now(timezone.utc).isoformat(timespec='seconds')


def dump(x):
    return json.dumps(x, ensure_ascii=False, sort_keys=True, separators=(',', ':'))


def text_field(value, name, limit=10000, required=False):
    if not isinstance(value, str) or len(value) > limit or (required and not value.strip()):
        raise ValidationError(name + '格式或长度不符合要求')
    return value.strip()


def checked_questions(items):
    if not isinstance(items, list) or not 1 <= len(items) <= 100:
        raise ValidationError('每份试卷需要1至100题')
    checked, ids = [], set()
    for q in items:
        if not isinstance(q, dict):
            raise ValidationError('题目格式错误')
        row = {k: text_field(q.get(k, ''), k, 12000 if k in ('stem', 'answer', 'correct_answer') else 1000)
               for k in ('id', 'stem', 'answer', 'correct_answer', 'knowledge', 'cause')}
        if not row['id'] or len(row['id']) > 40 or row['id'] in ids or not row['stem']:
            raise ValidationError('题号须唯一且题干不能为空')
        ids.add(row['id'])
        result = q.get('result', 'PENDING')
        if result not in RESULTS:
            raise ValidationError('判定状态无效')
        if '[不清]' in row['stem']+row['answer'] and result not in ('PENDING','MISSING'):
            raise ValidationError('作答仍有[不清]占位，请先补拍或核清转写，不能直接判对错')
        row['result'] = result
        if 'teaching_ref' in q:
            row['teaching_ref']=teaching.reference_shape(q['teaching_ref'])
        for key, label in (('teacher_result', '老师原批改'), ('ai_result', 'AI候选判定')):
            if key in q:
                if not isinstance(q[key], str) or q[key] not in ('',) + RESULTS:
                    raise ValidationError(label + '状态无效')
                row[key] = q[key]
        for key, label in (('teacher_mark', '老师原批注'), ('grading_note', '批改分歧核对说明')):
            if key in q:
                row[key] = text_field(q[key], label, 1500)
        if 'grading_resolved' in q:
            if type(q['grading_resolved']) is not bool:
                raise ValidationError('批改分歧核清须为勾选状态')
            row['grading_resolved'] = q['grading_resolved']
        if 'question_type' in q:
            kind=text_field(q['question_type'],'题型',200)
            if kind:row['question_type']=kind
        if 'recognition_notes' in q or 'recognition_resolved' in q or 'recognition_notice' in q:
            row['recognition_notes']=text_field(q.get('recognition_notes',''),'识别疑点',1500)
            if 'recognition_notice' in q: row['recognition_notice']=text_field(q['recognition_notice'],'识别过程补充',500)
            resolved=q.get('recognition_resolved',not bool(row['recognition_notes'] or row.get('recognition_notice')))
            if type(resolved) is not bool: raise ValidationError('识别核对状态须为勾选状态')
            row['recognition_resolved']=resolved
            if not resolved and result not in ('PENDING','MISSING'):
                raise ValidationError('识别疑点未解决，不能把题目记为对错；请先对照原图核对')
        if result in ('MISSING', 'PENDING'):
            row['cause'] = ''
        elif result in ('INCORRECT', 'PARTIAL') and not row['cause']:
            row['cause'] = '待核实'
        checked.append(row)
    return checked


def checked_question_ids(items):
    if not isinstance(items,list) or len(items)>100:
        raise ValidationError('应有题号清单须为最多100项的数组')
    result=[text_field(v,'应有题号',40,True) for v in items]
    if len(set(result))!=len(result): raise ValidationError('应有题号清单不能重复')
    return result


class Store:
    def __init__(self, root):
        self.root = Path(root).resolve()
        self.root.mkdir(parents=True, exist_ok=True)
        self.db_path = self.root / 'records.sqlite3'
        self.lock = threading.RLock()
        with self.db() as db:
            db.executescript('''
                CREATE TABLE IF NOT EXISTS meta(version INTEGER NOT NULL);
                INSERT INTO meta(version) SELECT 1 WHERE NOT EXISTS(SELECT 1 FROM meta);
                CREATE TABLE IF NOT EXISTS students(id TEXT PRIMARY KEY,ref TEXT UNIQUE NOT NULL,name TEXT NOT NULL);
                CREATE TABLE IF NOT EXISTS papers(id TEXT PRIMARY KEY,batch_id TEXT NOT NULL,title TEXT NOT NULL,
                    student_id TEXT NOT NULL REFERENCES students(id),version INTEGER NOT NULL DEFAULT 1,
                    confirmed_version INTEGER NOT NULL DEFAULT 0,questions_json TEXT NOT NULL,documents_json TEXT NOT NULL,
                    created_at TEXT NOT NULL,updated_at TEXT NOT NULL,UNIQUE(batch_id,student_id));
                CREATE TABLE IF NOT EXISTS review_events(id INTEGER PRIMARY KEY,event_key TEXT UNIQUE NOT NULL,
                    paper_id TEXT NOT NULL REFERENCES papers(id),student_id TEXT NOT NULL,question_id TEXT NOT NULL,
                    revision INTEGER NOT NULL,result TEXT NOT NULL,body_json TEXT NOT NULL,created_at TEXT NOT NULL);
                CREATE TABLE IF NOT EXISTS exercises(id TEXT PRIMARY KEY,paper_id TEXT NOT NULL REFERENCES papers(id),
                    question_id TEXT NOT NULL,level TEXT NOT NULL,stem TEXT NOT NULL,answer TEXT NOT NULL,explanation TEXT NOT NULL,
                    version INTEGER NOT NULL,status TEXT NOT NULL,approved_at TEXT,created_at TEXT NOT NULL);
                CREATE TABLE IF NOT EXISTS retests(id TEXT PRIMARY KEY,exercise_id TEXT NOT NULL REFERENCES exercises(id),
                    student_id TEXT NOT NULL,version INTEGER NOT NULL,answer TEXT NOT NULL,condition TEXT NOT NULL,
                    result TEXT NOT NULL,request_id TEXT UNIQUE NOT NULL,payload_hash TEXT NOT NULL,created_at TEXT NOT NULL,
                    snapshot_json TEXT NOT NULL);
            ''')
            self._migrate_versions(db)

    def _migrate_versions(self, db):
        paper_materials.ensure_schema(db)
        pilot.ensure_schema(db)
        teaching.ensure_schema(db)
        learning_journey.ensure_schema(db)
        db.execute('''CREATE TABLE IF NOT EXISTS exercise_versions(exercise_id TEXT NOT NULL REFERENCES exercises(id),
            version INTEGER NOT NULL,body_json TEXT NOT NULL,PRIMARY KEY(exercise_id,version))''')
        for row in db.execute('SELECT id FROM exercises').fetchall():
            e = self._exercise(db, row[0])
            db.execute('INSERT OR IGNORE INTO exercise_versions VALUES(?,?,?)', (e['id'], e['version'], dump(e)))
        # v0.1 may already have lost earlier editor rows. Only recover snapshots actually recorded in retests.
        for row in db.execute('SELECT exercise_id,version,snapshot_json FROM retests').fetchall():
            e = json.loads(row['snapshot_json'])
            current = self._exercise(db,row['exercise_id'])
            if (not isinstance(e,dict) or e.get('id')!=row['exercise_id'] or type(e.get('version')) is not int
                or e['version']!=row['version'] or e.get('status')!='APPROVED'
                or any(e.get(k)!=current[k] for k in ('paper_id','question_id','student_id'))
                or not isinstance(e.get('approved_at'),str) or not e['approved_at']):
                raise ValidationError('复测历史中的练习快照损坏')
            self._exercise_fields(e)
            db.execute('INSERT OR IGNORE INTO exercise_versions VALUES(?,?,?)', (row['exercise_id'], row['version'], dump(e)))

    def _snapshot_exercise(self, db, ident):
        e = self._exercise(db, ident)
        db.execute('INSERT INTO exercise_versions VALUES(?,?,?) ON CONFLICT(exercise_id,version) DO UPDATE SET body_json=excluded.body_json', (ident, e['version'], dump(e)))
        return e

    @contextmanager
    def db(self):
        conn = sqlite3.connect(self.db_path, timeout=15)
        conn.row_factory = sqlite3.Row
        conn.execute('PRAGMA foreign_keys=ON')
        try:
            with conn:
                yield conn
        finally:
            conn.close()

    def _paper(self, db, ident):
        row = db.execute('SELECT p.*,s.ref student_ref,s.name student_name FROM papers p JOIN students s ON s.id=p.student_id WHERE p.id=?', (ident,)).fetchone()
        if row is None:
            raise ValidationError('试卷不存在')
        out = dict(row)
        out['questions'] = json.loads(out.pop('questions_json'))
        out['documents'] = json.loads(out.pop('documents_json'))
        return out

    def _documents(self, docs):
        from files import get_document
        if not isinstance(docs, list) or len(docs) > 20:
            raise ValidationError('附件数量超限')
        out = []
        for item in docs:
            ident = item.get('id') if isinstance(item, dict) else item
            meta, _ = get_document(self.root, ident)
            meta['role'] = item.get('role', '作业') if isinstance(item, dict) else '作业'
            if meta['role'] not in ('作业', '参考答案'):
                raise ValidationError('附件用途无效')
            out.append(meta)
        return out

    def create_paper(self, payload):
        q = checked_questions(payload.get('questions'))
        ref = text_field(payload.get('student_ref'), '学生编号', 60, True)
        name = text_field(payload.get('student_name', ''), '学生称呼', 100) or ref
        batch = text_field(payload.get('batch_id'), '作业批次', 100, True)
        title = text_field(payload.get('title'), '作业标题', 160, True)
        docs = self._documents(payload.get('documents', []))
        with self.lock, self.db() as db:
            teaching.validate_questions(db,q)
            s = db.execute('SELECT * FROM students WHERE ref=?', (ref,)).fetchone()
            if s and s['name'] != name:
                raise ConflictError('此学生编号已有不同称呼，请核对归属；不能自动覆盖姓名')
            sid = s['id'] if s else uuid.uuid4().hex
            if db.execute('SELECT 1 FROM papers WHERE student_id=? AND batch_id=?', (sid, batch)).fetchone():
                raise ConflictError('该学生在此批次已有试卷，请打开原卷修订或另建批次')
            if not s:
                db.execute('INSERT INTO students VALUES(?,?,?)', (sid, ref, name))
            ident = uuid.uuid4().hex
            db.execute('INSERT INTO papers VALUES(?,?,?,?,1,0,?,?,?,?)', (ident, batch, title, sid, dump(q), dump(docs), now(), now()))
            return self._paper(db, ident)

    def get_paper(self, ident):
        with self.lock, self.db() as db:
            return self._paper(db, ident)

    def save_paper(self, ident, payload):
        q = checked_questions(payload.get('questions'))
        imported = payload.get('imported', False)
        if type(imported) is not bool:
            raise ValidationError('草稿导入标记无效')
        with self.lock, self.db() as db:
            p = self._paper(db, ident)
            if payload.get('version') != p['version']:
                raise ConflictError('试卷已更新，请刷新后重新核对')
            old_ids = {r[0] for r in db.execute('SELECT DISTINCT question_id FROM review_events WHERE paper_id=?', (ident,))}
            old_ids.update(item['id'] for item in p['questions'] if grading.has_evidence(item))
            if not old_ids.issubset({x['id'] for x in q}):
                raise ValidationError('已确认或已有老师批改证据的题目不能静默删除；请保留题号并以新版本修订')
            previous = {item['id']: item for item in p['questions']}
            q = checked_questions([grading.merge_draft(previous.get(item['id'], {}), item, imported) for item in q])
            teaching.validate_questions(db,q)
            if q != p['questions']:
                db.execute('UPDATE papers SET questions_json=?,version=version+1,updated_at=? WHERE id=?', (dump(q), now(), ident))
            return self._paper(db, ident)

    def confirm(self, ident, version, consent):
        if consent is not True:
            raise ValidationError('需要教师明确勾选整卷确认')
        with self.lock, self.db() as db:
            p = self._paper(db, ident)
            if version != p['version']:
                raise ConflictError('审核版本过期，请重新读取整卷')
            if p['confirmed_version'] == version:
                return dict(added=0, paper=p)
            teaching.validate_questions(db,p['questions'])
            for q in p['questions']:
                if grading.needs_resolution(q):
                    raise ValidationError(q['id'] + '存在批改分歧，请填写核对说明并明确勾选已核清，或保留待核对')
            # A batch represents one original paper: avoid false cross-paper common-question counts.
            others = db.execute('''SELECT body_json FROM review_events e JOIN papers p ON p.id=e.paper_id
                WHERE p.batch_id=? AND p.id<>? AND e.revision=(SELECT MAX(e2.revision) FROM review_events e2
                WHERE e2.paper_id=e.paper_id AND e2.question_id=e.question_id)''', (p['batch_id'], ident)).fetchall()
            stems = {}
            for row in others:
                item = json.loads(row[0])
                stems.setdefault(item['id'], set()).add(item['stem'])
            for q in p['questions']:
                if q['id'] in stems and stems[q['id']] != {q['stem']}:
                    raise ConflictError('同批次同题号的题干不一致，请核对或另建批次')
                db.execute('INSERT INTO review_events(event_key,paper_id,student_id,question_id,revision,result,body_json,created_at) VALUES(?,?,?,?,?,?,?,?)',
                           (f'{ident}/{q["id"]}/R{version}', ident, p['student_id'], q['id'], version, q['result'], dump(q), now()))
            db.execute('UPDATE papers SET confirmed_version=? WHERE id=?', (version, ident))
            return dict(added=len(p['questions']), paper=self._paper(db, ident))

    def _latest(self, db, batch=None, student=None):
        sql = '''SELECT e.*,p.batch_id,p.title,s.ref student_ref,s.name student_name FROM review_events e
                 JOIN papers p ON p.id=e.paper_id JOIN students s ON s.id=e.student_id
                 WHERE e.revision=(SELECT MAX(e2.revision) FROM review_events e2 WHERE e2.paper_id=e.paper_id AND e2.question_id=e.question_id)'''
        args = []
        if batch is not None:
            sql += ' AND p.batch_id=?'
            args.append(batch)
        if student is not None:
            sql += ' AND e.student_id=?'
            args.append(student)
        return [dict(r) | {'question': json.loads(r['body_json'])} for r in db.execute(sql + ' ORDER BY e.question_id,e.id', args)]

    def summary(self, batch):
        with self.lock, self.db() as db:
            latest = self._latest(db, batch=batch)
            rows = {}
            for e in latest:
                q = e['question']
                r = rows.setdefault(e['question_id'], dict(id=e['question_id'], stem=q['stem'], knowledge=q['knowledge'],
                     counts={k: 0 for k in RESULTS}, incorrect_students=[], binary_denominator=0))
                r['counts'][e['result']] += 1
                if e['result'] in ('CORRECT', 'INCORRECT'):
                    r['binary_denominator'] += 1
                if e['result'] == 'INCORRECT':
                    r['incorrect_students'].append(e['student_name'])
            from class_analysis import build_class_analysis
            papers=[self._paper(db,r[0]) for r in db.execute('SELECT id FROM papers WHERE batch_id=?',(batch,))]
            by_paper={p['id']:p for p in papers}
            event_documents={e['id']:paper_materials.documents_at(db,e['paper_id'],e['revision'],by_paper[e['paper_id']]['documents']) for e in latest}
            analysis=build_class_analysis(latest,papers,event_documents)
            total = {k: sum(r['counts'][k] for r in rows.values()) for k in RESULTS}
            return dict(batch_id=batch, confirmed_students=len({e['student_id'] for e in latest}),
                        submitted_students=db.execute('SELECT count(*) FROM papers WHERE batch_id=?', (batch,)).fetchone()[0],
                        rows=list(rows.values()), counts=total, binary_denominator=total['CORRECT']+total['INCORRECT'], class_analysis=analysis)

    def profile(self, student):
        with self.lock, self.db() as db:
            s = db.execute('SELECT * FROM students WHERE id=? OR ref=? ORDER BY CASE WHEN id=? THEN 0 ELSE 1 END', (student, student, student)).fetchone()
            if not s:
                from student_archive import summarize
                analysis=dict(groups=[],unclassified_count=0,duplicate_count=0,duplicate_evidence=[],evidence_event_ids=[])
                return dict(student=None, events=[], latest=[], retests=[],learning_journeys=[],learning_analysis=analysis) | summarize([],[],analysis,[])
            events = [dict(r) | {'question': json.loads(r['body_json'])} for r in db.execute('SELECT * FROM review_events WHERE student_id=? ORDER BY id', (s['id'],))]
            retests = [dict(r) for r in db.execute('SELECT * FROM retests WHERE student_id=? ORDER BY created_at,id', (s['id'],))]
            latest=self._latest(db,student=s['id'])
            papers=[self._paper(db,r[0]) for r in db.execute('SELECT id FROM papers WHERE student_id=?',(s['id'],))]
            from learning_analysis import build_learning_analysis
            from student_archive import summarize
            by_paper={p['id']:p for p in papers}
            event_documents={e['id']:paper_materials.documents_at(db,e['paper_id'],e['revision'],by_paper[e['paper_id']]['documents']) for e in latest}
            analysis=build_learning_analysis(latest,papers,event_documents)
            return dict(student=dict(s),events=events,latest=latest,retests=retests,
                        learning_analysis=analysis,learning_journeys=learning_journey.build(self,db,s['id'],events)) | summarize(events,latest,analysis,papers)

    def student_evidence(self, student_id, event_id):
        if not isinstance(student_id,str) or type(event_id) is not int or not 0 < event_id < 2**63:
            raise ValidationError('学生或确认记录编号无效')
        with self.lock, self.db() as db:
            student=db.execute('SELECT * FROM students WHERE id=?',(student_id,)).fetchone()
            row=db.execute('''SELECT e.* FROM review_events e JOIN papers p ON p.id=e.paper_id
                              WHERE e.id=? AND e.student_id=? AND p.student_id=?''',
                           (event_id,student_id,student_id)).fetchone()
            if not student or not row:
                raise ValidationError('此确认记录不属于当前学生或不存在')
            event=dict(row)
            event['question']=json.loads(event.pop('body_json'))
            paper=self._paper(db,event['paper_id'])
            latest_id=db.execute('SELECT MAX(id) FROM review_events WHERE paper_id=? AND question_id=?',
                                 (event['paper_id'],event['question_id'])).fetchone()[0]
            return dict(student=dict(student),event=event,
                        paper={k:paper[k] for k in ('id','title','batch_id','version','confirmed_version')},
                        documents=paper_materials.documents_at(db,paper['id'],event['revision'],paper['documents']),is_latest=latest_id==event_id,latest_event_id=latest_id,
                        has_pending_revision=paper['version']!=paper['confirmed_version'],
                        teaching_reference=teaching._reference(db,event['question']['teaching_ref']) if event['question'].get('teaching_ref') else None)

    def create_exercise(self, payload):
        with self.lock, self.db() as db:
            return self._create_exercise(db,payload)

    def _create_exercise(self,db,payload):
        p = self._paper(db, payload.get('paper_id'))
        if 'paper_version' in payload:
            version=payload['paper_version']
            if type(version) is not int or version<1:raise ValidationError('原卷来源版本须为正整数')
            if version!=p['version']:raise ConflictError('原卷来源版本已变，请重新审核后选择补练来源')
        if p['confirmed_version'] != p['version']:
            raise ValidationError('原卷存在未确认修订，请先完成本版本整卷审核')
        qid = text_field(payload.get('question_id'), '题号', 40, True)
        q = db.execute('SELECT * FROM review_events WHERE paper_id=? AND question_id=? ORDER BY revision DESC LIMIT 1', (p['id'], qid)).fetchone()
        if not q or q['result'] not in ('INCORRECT', 'PARTIAL'):
            raise ValidationError('请先确认原题；仅从已确认的错误或部分正确题建立补练')
        values = self._exercise_fields(payload)
        ident = uuid.uuid4().hex
        db.execute('INSERT INTO exercises VALUES(?,?,?,?,?,?,?,1,\'DRAFT\',NULL,?)', (ident, p['id'], qid, *values, now()))
        db.execute('INSERT INTO exercise_origins VALUES(?,?)',(ident,q['id']))
        return self._snapshot_exercise(db, ident)

    def _exercise_fields(self, payload):
        if payload.get('level') not in LEVELS:
            raise ValidationError('练习档次无效')
        return (payload['level'], text_field(payload.get('stem'), '练习题干', 12000, True),
                text_field(payload.get('answer'), '教师答案', 12000, True), text_field(payload.get('explanation', ''), '讲解', 12000))

    def _exercise(self, db, ident, version=None):
        r = db.execute('SELECT e.*,p.student_id,s.name student_name FROM exercises e JOIN papers p ON e.paper_id=p.id JOIN students s ON p.student_id=s.id WHERE e.id=?', (ident,)).fetchone()
        if not r:
            raise ValidationError('练习不存在')
        current = dict(r)
        origin=db.execute('SELECT o.source_event_id,r.revision FROM exercise_origins o JOIN review_events r ON r.id=o.source_event_id WHERE o.exercise_id=?',(ident,)).fetchone()
        if origin:current.update(source_event_id=origin['source_event_id'],source_revision=origin['revision'])
        if version is None or version == current['version']:
            return current | dict(historical=False, current_version=current['version'])
        old = db.execute('SELECT body_json FROM exercise_versions WHERE exercise_id=? AND version=?', (ident, version)).fetchone()
        if not old:
            raise ConflictError('指定练习版本不存在或旧系统没有留下可核实快照')
        return json.loads(old[0]) | dict(historical=True, current_version=current['version'])

    def get_exercise(self, ident, version=None):
        with self.lock, self.db() as db:
            return self._exercise(db, ident, version)

    def exercise_versions(self, ident):
        with self.lock, self.db() as db:
            current = self._exercise(db, ident)
            return [json.loads(r['body_json']) | dict(historical=r['version'] != current['version'], current_version=current['version'])
                    for r in db.execute('SELECT version,body_json FROM exercise_versions WHERE exercise_id=? ORDER BY version DESC', (ident,))]

    def update_exercise(self, ident, payload):
        values = self._exercise_fields(payload)
        with self.lock, self.db() as db:
            old = self._exercise(db, ident)
            if payload.get('version') != old['version']:
                raise ConflictError('练习版本已变更，请刷新')
            db.execute('UPDATE exercises SET level=?,stem=?,answer=?,explanation=?,version=version+1,status=\'DRAFT\',approved_at=NULL WHERE id=?', (*values, ident))
            return self._snapshot_exercise(db, ident)

    def approve_exercise(self, ident, version, consent):
        if consent is not True:
            raise ValidationError('请教师明确确认题目、答案和学生版范围')
        with self.lock, self.db() as db:
            e = self._exercise(db, ident)
            if version != e['version']:
                raise ConflictError('练习版本过期')
            if e['status'] == 'APPROVED':
                return e
            db.execute('UPDATE exercises SET status=\'APPROVED\',approved_at=? WHERE id=?', (now(), ident))
            return self._snapshot_exercise(db, ident)

    def record_retest(self, payload):
        clean = {k: payload.get(k) for k in ('exercise_id', 'version', 'answer', 'condition', 'result', 'consent', 'request_id')}
        if clean['consent'] is not True or clean['result'] not in RESULTS:
            raise ValidationError('复测须教师确认，判定状态须有效')
        text_field(clean['answer'], '复测作答', 12000)
        if clean['condition'] not in ('独立完成', '有提示完成', '带提示', '完成条件待核实'):
            raise ValidationError('请记录复测的完成条件')
        request_id = text_field(clean['request_id'], '复测请求编号', 100, True)
        fingerprint = hashlib.sha256(dump(clean).encode()).hexdigest()
        with self.lock, self.db() as db:
            prior = db.execute('SELECT * FROM retests WHERE request_id=?', (request_id,)).fetchone()
            if prior:
                if prior['payload_hash'] != fingerprint:
                    raise ConflictError('相同复测请求已有不同内容，请勿覆盖')
                return dict(added=0, retest=dict(prior))
            e = self._exercise(db, clean['exercise_id'], clean['version'])
            if clean['version'] != e['version']:
                raise ConflictError('复测对应练习的版本过期')
            if e['status'] != 'APPROVED':
                raise ValidationError('练习尚未获教师批准')
            ident = uuid.uuid4().hex
            db.execute('INSERT INTO retests VALUES(?,?,?,?,?,?,?,?,?,?,?)',
                       (ident, e['id'], e['student_id'], e['version'], clean['answer'], clean['condition'], clean['result'], request_id, fingerprint, now(), dump(e)))
            return dict(added=1, retest=dict(db.execute('SELECT * FROM retests WHERE id=?', (ident,)).fetchone()))

    def bootstrap(self):
        with self.lock, self.db() as db:
            papers = [self._paper(db, r[0]) for r in db.execute('SELECT id FROM papers ORDER BY created_at,id')]
            return dict(papers=papers, students=[dict(r) for r in db.execute('SELECT * FROM students ORDER BY ref')],
                        batches=[r[0] for r in db.execute('SELECT DISTINCT batch_id FROM papers ORDER BY batch_id')],
                        exercises=[self._exercise(db, r[0]) for r in db.execute('SELECT id FROM exercises ORDER BY created_at,id')],
                        exercise_versions=[json.loads(r[0]) for r in db.execute('SELECT body_json FROM exercise_versions ORDER BY exercise_id,version DESC')],
                        data_directory=str(self.root), event_count=db.execute('SELECT count(*) FROM review_events').fetchone()[0])

    def event_count(self):
        with self.lock, self.db() as db:
            return db.execute('SELECT count(*) FROM review_events').fetchone()[0]

    def backup(self):
        with self.lock:
            folder = self.root / 'backups'
            folder.mkdir(exist_ok=True)
            ident = 'backup-' + datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S') + '-' + uuid.uuid4().hex[:8] + '.zip'
            stage = folder / (ident + '.sqlite3')
            try:
                with self.db() as db:
                    target = sqlite3.connect(stage)
                    try:
                        db.backup(target)
                    finally:
                        target.close()
                contents = {'database.sqlite3': stage.read_bytes()}
                import outbound_ledger
                if (self.root/outbound_ledger.NAME).exists():
                    outbound_ledger.read(self.root)
                    contents[outbound_ledger.NAME]=(self.root/outbound_ledger.NAME).read_bytes()
                documents = self.root / 'documents'
                if documents.is_dir():
                    for p in documents.iterdir():
                        if p.is_file() and not p.is_symlink():
                            contents['documents/' + p.name] = p.read_bytes()
                manifest = {name: hashlib.sha256(data).hexdigest() for name, data in contents.items()}
                with zipfile.ZipFile(folder / ident, 'w', zipfile.ZIP_DEFLATED) as z:
                    for name, data in contents.items():
                        z.writestr(name, data)
                    z.writestr('manifest.json', dump(manifest))
            finally:
                stage.unlink(missing_ok=True)
            return self._backup_info(folder / ident)

    def _backup_info(self, p):
        return dict(id=p.name, size=p.stat().st_size, sha256=hashlib.sha256(p.read_bytes()).hexdigest())

    def backups(self):
        with self.lock:
            return [self._backup_info(p) for p in sorted((self.root / 'backups').glob('backup-*.zip'), reverse=True) if p.is_file()]

    def backup_path(self, ident):
        if not isinstance(ident, str) or not ident.startswith('backup-') or not ident.endswith('.zip') or any(c not in 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-.' for c in ident):
            raise ValidationError('备份编号无效')
        path = self.root / 'backups' / ident
        if not path.is_file() or path.is_symlink():
            raise ValidationError('备份不存在')
        return path

    def restore(self, ident, confirmation):
        import outbound_ledger
        if confirmation != 'RESTORE':
            raise ValidationError('恢复会回到备份时点，请明确输入恢复确认')
        with self.lock:
            stage = self.root / ('restore-' + uuid.uuid4().hex + '.sqlite3')
            try:
                with zipfile.ZipFile(self.backup_path(ident)) as z:
                    entries = z.infolist()
                    names = z.namelist()
                    if len(entries) > 10000 or len(set(names)) != len(names) or sum(i.file_size for i in entries) > 512 * 1024 * 1024:
                        raise ValidationError('备份展开量或重复项异常')
                    manifest = json.loads(z.read('manifest.json'))
                    if not isinstance(manifest, dict) or set(names) != set(manifest) | {'manifest.json'} or 'database.sqlite3' not in manifest:
                        raise ValidationError('备份清单不完整')
                    restored = {}
                    for name, digest in manifest.items():
                        if name not in ('database.sqlite3',outbound_ledger.NAME) and not (name.startswith('documents/') and len(name.split('/')) == 2 and all(c in '0123456789abcdef.' for c in name.split('/')[1].split('.')[0])):
                            raise ValidationError('备份包含无关路径')
                        if '..' in name or '\\' in name or ':' in name:
                            raise ValidationError('备份路径无效')
                        data = z.read(name)
                        if hashlib.sha256(data).hexdigest() != digest:
                            raise ValidationError('备份校验失败')
                        restored[name] = data
                recorded=outbound_ledger.combine(outbound_ledger.read(self.root),outbound_ledger.parse(restored.get(outbound_ledger.NAME,b'')))
                stage.write_bytes(restored['database.sqlite3'])
                probe = sqlite3.connect(stage)
                probe.row_factory = sqlite3.Row
                try:
                    if probe.execute('PRAGMA quick_check').fetchone()[0] != 'ok' or probe.execute('SELECT version FROM meta').fetchone()[0] != 1:
                        raise ValidationError('备份数据库不兼容或损坏')
                    if probe.execute('PRAGMA foreign_key_check').fetchone():
                        raise ValidationError('备份关联损坏')
                    for row in probe.execute('SELECT documents_json FROM papers'):
                        for doc in json.loads(row[0]):
                            if 'documents/' + doc['storage_name'] not in restored or 'documents/' + doc['id'] + '.json' not in restored:
                                raise ValidationError('备份缺少引用附件')
                    # Run additive migration against the staged database before replacing current records.
                    self._migrate_versions(probe)
                    teaching.validate_restored(probe,restored)
                    learning_journey.validate_restored(probe)
                    pilot.validate_restored(probe)
                    paper_materials.validate_restored(probe)
                    if probe.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name='ai_jobs'").fetchone():
                        columns={r[1] for r in probe.execute('PRAGMA table_info(ai_jobs)')}
                        if {'metadata_json','mode'}.issubset(columns):
                            jobs=probe.execute('''SELECT j.metadata_json,j.paper_version,p.version current_version,p.questions_json
                                FROM ai_jobs j LEFT JOIN papers p ON p.id=j.paper_id WHERE j.mode='vision_transcribe' ''')
                            for row in jobs:
                                metadata=json.loads(row['metadata_json'])
                                if not isinstance(metadata,dict): raise ValidationError('备份AI任务元数据无效')
                                target=text_field(metadata.get('target_question_id',''),'备份目标题号',40)
                                expected=checked_question_ids(metadata.get('expected_question_ids',[]))
                                if target and expected: raise ValidationError('备份不能同时指定单题与整页清单')
                                if target and row['current_version'] is None: raise ValidationError('备份单题任务缺少所属卷')
                                # Old jobs may refer to a question removed by a later draft; version checks block their application.
                                if target and row['paper_version']==row['current_version'] and target not in {q['id'] for q in checked_questions(json.loads(row['questions_json']))}:
                                    raise ValidationError('备份未应用单题任务的目标不在所属卷中')
                    if probe.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name='ai_jobs'").fetchone() and {'mode','metadata_json'}.issubset({r[1] for r in probe.execute('PRAGMA table_info(ai_jobs)')}):
                        import tutoring
                        tutoring.validate_restored_jobs(probe)
                    if probe.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name='transcription_reviews'").fetchone():
                        reviews=probe.execute('''SELECT r.*,j.paper_id job_paper_id,j.paper_version job_source_version,
                            j.applied_version job_applied_version,j.mode,j.metadata_json job_metadata_json,p.version current_paper_version
                            FROM transcription_reviews r JOIN ai_jobs j ON j.id=r.job_id JOIN papers p ON p.id=r.paper_id''')
                        for row in reviews:
                            saved=json.loads(row['teacher_json'])
                            if isinstance(saved,dict):
                                if saved.get('source_method')!='MANUAL_FALLBACK' or not isinstance(saved.get('questions'),list):
                                    raise ValidationError('备份人工转写快照格式损坏')
                                saved=saved['questions']
                            if (not isinstance(saved,list) or row['mode']!='vision_transcribe' or row['paper_id']!=row['job_paper_id']
                                or row['source_version']!=row['job_source_version'] or row['applied_version']!=row['source_version']+1
                                or row['job_applied_version']!=row['applied_version'] or row['current_paper_version']<row['applied_version']):
                                raise ValidationError('备份转写归属或版本不一致')
                            normalized=checked_questions(saved)
                            metadata=json.loads(row['job_metadata_json'])
                            if not isinstance(metadata,dict): raise ValidationError('备份AI任务元数据无效')
                            target=text_field(metadata.get('target_question_id',''),'备份目标题号',40)
                            expected=checked_question_ids(metadata.get('expected_question_ids',[]))
                            if expected and not {q['id'] for q in normalized}.issubset(set(expected)):
                                raise ValidationError('备份转写题号不属于应有清单')
                            if target and (len(normalized)!=1 or normalized[0]['id']!=target):
                                raise ValidationError('备份单题转写与目标题号不一致')
                    if probe.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name='ai_jobs'").fetchone():
                        for job_id in recorded:
                            probe.execute("UPDATE ai_jobs SET status='UNKNOWN',error='发送凭据仍在；恢复旧备份不能撤销外部调用，本任务不再发送',updated_at=? WHERE id=? AND status IN ('PREPARED','SENDING')",(now(),job_id))
                    probe.commit()
                finally:
                    probe.close()
                safety = self.backup()
                for name, data in restored.items():
                    if name.startswith('documents/'):
                        p = self.root / name
                        p.parent.mkdir(exist_ok=True)
                        if p.exists() and p.read_bytes() != data:
                            raise ValidationError('本地附件与备份同名但内容不同，已停止恢复')
                        if not p.exists():
                            p.write_bytes(data)
                outbound_ledger.merge(self.root,recorded)
                stage.replace(self.db_path)
                return dict(restored=ident, safety_backup=safety['id'])
            except (zipfile.BadZipFile, KeyError, sqlite3.DatabaseError, json.JSONDecodeError) as exc:
                raise ValidationError('备份损坏或格式不符合要求') from exc
            finally:
                stage.unlink(missing_ok=True)
