"""Evidence-linked learning records. SQLite is authoritative; revisions are append-only."""
import hashlib
import json
import re
from pathlib import Path

from pydantic import BaseModel, ConfigDict, Field

from backend.archive import SUBJECTS, utc_now
from backend.intake import RequestConflict
from backend.feedback import vertex_feedback


class Scope(BaseModel):
    model_config = ConfigDict(extra='forbid')
    student_id: str = Field(min_length=1, max_length=80)
    subject: str = Field(pattern='^(math|english|physics|chemistry)$')


class LinkInput(Scope):
    assignment_id: str = Field(min_length=1, max_length=100)
    number: str = Field(pattern=r'^\d{1,3}(?:[.（(]\d{1,2}[）)]?)?$')
    tag: str = Field(min_length=1, max_length=100)
    evidence_hash: str = Field(pattern='^[a-f0-9]{64}$')
    page: int = Field(ge=1, le=500)
    quote: str = Field(min_length=1, max_length=2000)
    status: str = Field(pattern='^(CANDIDATE|CONFIRMED)$')
    expected_revision: int = Field(ge=0)


class FeedbackInput(Scope):
    assignment_id: str = Field(min_length=1, max_length=100)
    number: str = Field(min_length=1, max_length=20)
    explanation: str = Field(default='', max_length=12000)
    levels: list[dict[str, str]] = Field(default_factory=list, max_length=3)


class ApprovalInput(Scope):
    assignment_id: str
    number: str
    feedback_id: str = Field(max_length=100)
    expected_revision: int = Field(ge=1)
    approved: bool


class RetestInput(Scope):
    assignment_id: str
    number: str
    feedback_id: str = Field(max_length=100)
    level: str = Field(pattern='^[ABC]$')
    answer: str = Field(min_length=1, max_length=8000)
    result: str = Field(pattern='^(CORRECT|INCORRECT|PARTIAL|PENDING)$')
    independent: bool
    request_id: str = Field(pattern='^[A-Za-z0-9_-]{1,100}$')


class LearningService:
    def __init__(self, intake):
        self.intake = intake
        self.archive = intake.archive

    def connect(self):
        return self.intake._connect()

    @staticmethod
    def schema(db):
        db.executescript('''CREATE TABLE IF NOT EXISTS learning_events(
            seq INTEGER PRIMARY KEY, kind TEXT NOT NULL, entity TEXT NOT NULL,
            revision INTEGER NOT NULL, payload TEXT NOT NULL, created_at TEXT NOT NULL,
            UNIQUE(kind,entity,revision));''')

    def assignment(self, db, assignment_id, student_id, subject):
        self.archive.student(student_id)
        row = db.execute('SELECT receipt FROM assignments WHERE id=? AND student_id=? AND subject=?',
                         (assignment_id, student_id, subject)).fetchone()
        if not row:
            raise KeyError('该学生该科没有这份作业')
        return json.loads(row['receipt'])

    @staticmethod
    def events(db, kind=None):
        rows = db.execute('SELECT * FROM learning_events' + (' WHERE kind=?' if kind else '') + ' ORDER BY seq',
                          (kind,) if kind else ()).fetchall()
        return [dict(json.loads(row['payload']), revision=row['revision'], created_at=row['created_at']) for row in rows]

    @staticmethod
    def latest(events, keys):
        return list({tuple(item[key] for key in keys): item for item in events}.values())

    def append(self, db, kind, entity, payload, expected):
        current = db.execute('SELECT MAX(revision) FROM learning_events WHERE kind=? AND entity=?', (kind, entity)).fetchone()[0] or 0
        if expected != current:
            raise RequestConflict('记录已有更新，请刷新后再保存；不会覆盖他人或先前修订')
        revision = current + 1
        stamp = utc_now()
        db.execute('INSERT INTO learning_events(kind,entity,revision,payload,created_at) VALUES(?,?,?,?,?)',
                   (kind, entity, revision, json.dumps(payload, ensure_ascii=False), stamp))
        actual = db.execute('SELECT payload FROM learning_events WHERE kind=? AND entity=? AND revision=?', (kind, entity, revision)).fetchone()[0]
        if json.loads(actual) != payload:
            raise OSError('学习记录回读失败')
        return dict(payload, revision=revision, created_at=stamp)

    def link(self, item: LinkInput):
        payload = item.model_dump(exclude={'expected_revision'})
        payload['tag'] = item.tag.strip()
        if not payload['tag'] or re.search('心理|人格|性格|智商', item.tag):
            raise ValueError('这里只记录学科知识点，不建立心理或人格标签')
        with self.connect() as db:
            self.schema(db)
            db.execute('BEGIN IMMEDIATE')
            record = self.assignment(db, item.assignment_id, item.student_id, item.subject)
            if item.number not in record['questions'] + record['candidate_questions']:
                raise ValueError('请先在本份作业登记这个问题题号，不能关联其他试卷题号')
            original = next((f for f in record['files'] if f['sha256'] == item.evidence_hash), None)
            if not original or original['pages'] is not None and item.page > original['pages']:
                raise ValueError('证据必须来自本份作业的有效原件与页码')
            existing = [e for e in self.events(db, 'LINK') if e['assignment_id'] == item.assignment_id and e['number'] == item.number]
            if existing and existing[-1]['status'] == 'CONFIRMED' and item.status == 'CANDIDATE':
                raise ValueError('AI候选不能替换教师已确认关联；教师更正请用确认状态并保留理由')
            payload['source'] = '教师确认关联' if item.status == 'CONFIRMED' else 'AI或手工候选／待教师确认'
            return self.append(db, 'LINK', item.assignment_id + '/' + item.number, payload, item.expected_revision)

    def workspace(self, student_id, subject):
        self.archive.student(student_id)
        if subject not in SUBJECTS:
            raise ValueError('学科无效')
        with self.connect() as db:
            self.schema(db)
            assignments = [json.loads(r['receipt']) for r in db.execute(
                'SELECT receipt FROM assignments WHERE student_id=? AND subject=? ORDER BY rowid DESC', (student_id, subject))]
            events = [e for e in self.events(db, 'LINK') if e['student_id'] == student_id and e['subject'] == subject]
            feedback = [e for e in self.events(db, 'FEEDBACK') if e['student_id'] == student_id and e['subject'] == subject]
            retests = [e for e in self.events(db, 'RETEST') if e['student_id'] == student_id and e['subject'] == subject]
        return {'assignments': assignments, 'links': self.latest(events, ['assignment_id', 'number']), 'link_history': events,
                'feedback': self.latest(feedback, ['id']), 'retests': retests}

    def feedback(self, item: FeedbackInput):
        from uuid import uuid4
        with self.connect() as db:
            self.schema(db)
            db.execute('BEGIN IMMEDIATE')
            self.assignment(db, item.assignment_id, item.student_id, item.subject)
            links = [l for l in self.latest(self.events(db, 'LINK'), ['assignment_id', 'number'])
                     if l['assignment_id'] == item.assignment_id and l['number'] == item.number and l['status'] == 'CONFIRMED']
            if not links:
                raise ValueError('先确认本题知识点再准备补练')
            if item.explanation or item.levels:
                if not item.explanation.strip() or len(item.levels) != 3:
                    raise ValueError('请提供讲解和A/B/C三档题目及完整解答')
                for level, row in zip('ABC', item.levels):
                    if set(row) != {'level', 'title', 'question', 'solution'} or row['level'] != level or any(not v.strip() or len(v) > 12000 for v in row.values()):
                        raise ValueError('每档必须包含level/title/question/solution，按A/B/C排列，内容不能为空')
                content = {'origin': '老师或Agent提供的待审内容，未做自动数学正确性认证', 'explanation': item.explanation,
                           'levels': item.levels, 'review_advice': '老师决定选档和复测时间；一次答对不代表掌握。'}
            elif item.subject == 'math' and re.search('顶点|二次函数', links[0]['tag']):
                content = vertex_feedback()
            else:
                raise ValueError('这个知识点暂无内置演示；请让Agent或老师准备讲解和三档完整题解后录入，不会凭空生成通用题')
            ident = 'F-' + uuid4().hex
            payload = dict(item.model_dump(exclude={'explanation', 'levels'}), **content, id=ident, tag=links[0]['tag'],
                           link_revision=links[0]['revision'], status='WAITING_TEACHER')
            return self.append(db, 'FEEDBACK', ident, payload, 0)

    def get_feedback(self, db, ident):
        found = [e for e in self.events(db, 'FEEDBACK') if e['id'] == ident]
        if not found:
            raise KeyError('补练不存在')
        return found[-1]

    def approve(self, item: ApprovalInput):
        with self.connect() as db:
            self.schema(db)
            db.execute('BEGIN IMMEDIATE')
            record = self.get_feedback(db, item.feedback_id)
            for field in ('student_id', 'subject', 'assignment_id', 'number'):
                if record[field] != getattr(item, field):
                    raise KeyError('补练不属于当前学生作业')
            links = [l for l in self.latest(self.events(db, 'LINK'), ['assignment_id', 'number'])
                     if l['assignment_id'] == item.assignment_id and l['number'] == item.number]
            if not links or links[0]['revision'] != record['link_revision']:
                raise RequestConflict('知识点已更正，请基于最新关联重新准备补练')
            payload = {k: v for k, v in record.items() if k not in {'revision', 'created_at'}}
            payload['status'] = 'APPROVED' if item.approved else 'REJECTED'
            return self.append(db, 'FEEDBACK', item.feedback_id, payload, item.expected_revision)

    def practice(self, ident, level):
        with self.connect() as db:
            self.schema(db)
            record = self.get_feedback(db, ident)
        if record['status'] != 'APPROVED':
            raise RequestConflict('补练尚未由老师审核通过，不能生成学生版')
        selected = next((r for r in record['levels'] if r['level'] == level), None)
        if not selected:
            raise ValueError('请选择A/B/C一档')
        return f"# {selected['title']}\n\n{selected['question']}\n\n请独立完成并保留过程。\n"

    def retest(self, item: RetestInput):
        with self.connect() as db:
            self.schema(db)
            db.execute('BEGIN IMMEDIATE')
            record = self.get_feedback(db, item.feedback_id)
            if any(record[f] != getattr(item, f) for f in ('student_id', 'subject', 'assignment_id', 'number')):
                raise KeyError('复测归属不符')
            if record['status'] != 'APPROVED':
                raise RequestConflict('先审核补练，再记录其复测结果')
            payload = item.model_dump()
            ident = item.student_id + '/' + item.subject + '/' + item.request_id
            old = [e for e in self.events(db, 'RETEST') if e['id'] == ident]
            if old:
                if any(old[-1][k] != v for k, v in payload.items()):
                    raise RequestConflict('复测请求编号已用于其他内容，不能覆盖')
                return old[-1]
            payload.update(id=ident, tag=record['tag'], source='教师登记复测结果',
                           notice='本次答对不代表掌握；原错题与历史保留。独立性由老师登记，未自动核验。')
            return self.append(db, 'RETEST', ident, payload, 0)

    def original(self, assignment_id, digest):
        with self.connect() as db:
            row = db.execute('SELECT receipt FROM assignments WHERE id=?', (assignment_id,)).fetchone()
        if not row:
            raise KeyError('作业不存在')
        record = json.loads(row['receipt'])
        item = next((f for f in record['files'] if f['sha256'] == digest), None)
        if not item:
            raise KeyError('原件不属于该作业')
        path = self.archive.root / 'objects' / digest
        raw = path.read_bytes()
        if hashlib.sha256(raw).hexdigest() != digest:
            raise OSError('原件校验失败')
        return raw, item

    def analysis(self, student_id, subject, class_name=''):
        student = self.archive.student(student_id)
        if subject not in SUBJECTS:
            raise ValueError('学科无效')
        with self.connect() as db:
            self.schema(db)
            records = [json.loads(r['receipt']) for r in db.execute('SELECT receipt FROM assignments WHERE subject=?', (subject,))]
            links = self.latest(self.events(db, 'LINK'), ['assignment_id', 'number'])
        by_id = {r['assignment_id']: r for r in records}
        confirmed = [l for l in links if l['status'] == 'CONFIRMED' and l['subject'] == subject and
                     l['assignment_id'] in by_id and l['number'] in by_id[l['assignment_id']]['questions']]
        def summarize(selected):
            ids = {r['assignment_id'] for r in selected}
            groups = {}
            for item in confirmed:
                if item['assignment_id'] in ids:
                    groups.setdefault(item['tag'], []).append(item)
            patterns = []
            for tag, items in groups.items():
                assignments = {i['assignment_id'] for i in items}
                patterns.append({'tag': tag, 'assignment_count': len(assignments),
                    'question_count': len(items), 'student_count': len({i['student_id'] for i in items}),
                    'repeated': len(assignments) >= 2,
                    'evidence': [{'assignment_id': i['assignment_id'], 'number': i['number'],
                        'student_id': i['student_id'], 'page': i['page'], 'evidence_hash': i['evidence_hash'],
                        'quote': i['quote'], 'revision': i['revision']} for i in items],
                    'suggestion': '建议优先复习并安排独立复测' if len(assignments) >= 2 else '仅一次记录，先核实理解并观察后续'})
            covered = sum(len(items) for items in groups.values())
            return {'assignment_count': len(selected), 'student_count': len({r['student']['id'] for r in selected}),
                    'undated_count': sum(r['assignment_date'] == '待补' for r in selected),
                    'confirmed_question_count': sum(len(r['questions']) for r in selected),
                    'linked_question_count': covered, 'patterns': sorted(patterns, key=lambda p: (-p['student_count'], -p['assignment_count'], p['tag']))}
        classroom = class_name.strip() or student.get('class_name', '')
        return {'student': student, 'subject': subject,
                'personal': summarize([r for r in records if r['student']['id'] == student_id]),
                'classroom': dict(summarize([r for r in records if classroom and r['class_name'] == classroom]), class_name=classroom),
                'notice': '只统计教师明确错题及最新确认的知识点关联；AI候选不计。重复不代表长期薄弱；班级人数是已有归档覆盖人数，不是全班实际人数。不计算批改准确率。'}
