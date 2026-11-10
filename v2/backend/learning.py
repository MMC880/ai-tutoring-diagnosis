"""Evidence-linked learning records. SQLite is authoritative; revisions are append-only."""
import hashlib
import json
import re
from pathlib import Path

from pydantic import BaseModel, ConfigDict, Field

from backend.archive import SUBJECTS, utc_now
from backend.intake import RequestConflict


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
        return {'assignments': assignments, 'links': self.latest(events, ['assignment_id', 'number']), 'link_history': events}

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
