"""Controlled local archive tool. Teacher commands never need model/network access."""
from __future__ import annotations

import base64
import hashlib
import io
import json
import os
import re
import sqlite3
import warnings
from contextlib import contextmanager
from datetime import date, timedelta
from pathlib import Path
from uuid import uuid4
from zoneinfo import ZoneInfo
from datetime import datetime

from PIL import Image, ImageOps, UnidentifiedImageError
from pypdf import PdfReader

from backend.archive import SUBJECTS, utc_now
from backend.instruction import parse_instruction, instruction_context
from backend.projection import effective


class RequestConflict(ValueError):
    pass


def analysis_image(raw: bytes):
    """A lossy, metadata-free model copy; never modifies the original blob."""
    try:
        if not raw or len(raw) > 15 * 1024 * 1024:
            raise ValueError()
        with warnings.catch_warnings():
            warnings.simplefilter('error', Image.DecompressionBombWarning)
            with Image.open(io.BytesIO(raw)) as image:
                if image.format not in {'PNG', 'JPEG', 'WEBP', 'MPO'} or image.width * image.height > 30_000_000:
                    raise ValueError()
                image.seek(0)
                image.load()
                oriented = ImageOps.exif_transpose(image)
                clean = Image.new('RGB', oriented.size, 'white')
                clean.paste(oriented.convert('RGB'))
                clean.thumbnail((2000, 2000))
                while True:
                    out = io.BytesIO()
                    clean.save(out, 'JPEG', quality=88)
                    if out.tell() <= 2 * 1024 * 1024:
                        break
                    clean.thumbnail((int(clean.width * .8), int(clean.height * .8)))
        return {'image': 'data:image/jpeg;base64,' + base64.b64encode(out.getvalue()).decode('ascii'),
                'bytes': out.tell(), 'width': clean.width, 'height': clean.height,
                'warning': '分析副本最长边2000像素，已去元数据；细小字迹可能需另选局部清晰图。原件不变。'}
    except (ValueError, OSError, Image.DecompressionBombError, Image.DecompressionBombWarning):
        raise ValueError('图片不能生成分析副本，仍可归档原件；请选择可读的主图') from None


def write_original(path: Path, raw: bytes):
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.exists():
        if path.read_bytes() != raw:
            raise OSError('原件哈希冲突，停止写入')
        return
    # Publish a fully written blob atomically, retain originals on interruption.
    tmp = path.with_name(path.name + '-' + uuid4().hex + '.tmp')
    try:
        with tmp.open('xb') as out:
            out.write(raw)
            out.flush()
            os.fsync(out.fileno())
        os.replace(tmp, path)
        if path.read_bytes() != raw:
            raise OSError('原件回读不一致')
    finally:
        if tmp.exists():
            tmp.unlink()


def inspect_file(name: str, raw: bytes):
    if not raw or len(raw) > 15 * 1024 * 1024:
        raise ValueError('文件为空或超过15MB，请拆分后重发')
    ext = Path(name).suffix.lower()
    if ext not in {'.png', '.jpg', '.jpeg', '.webp', '.pdf'}:
        raise ValueError('本轮支持PNG、JPG、WebP图片和PDF，请保留原扩展名')
    result = {'original_name': Path(name).name[:240], 'bytes': len(raw),
              'sha256': hashlib.sha256(raw).hexdigest(), 'pages': None,
              'preview_status': 'UNAVAILABLE', 'warning': '', 'thumbnail': ''}
    try:
        if ext == '.pdf':
            with warnings.catch_warnings():
                warnings.simplefilter('ignore')
                pdf = PdfReader(io.BytesIO(raw), strict=True)
                if pdf.is_encrypted:
                    raise ValueError('encrypted')
                result['pages'] = len(pdf.pages)
                if not 0 < result['pages'] <= 500:
                    raise ValueError('page count')
            result['preview_status'] = 'PDF_COUNTED'
        else:
            with warnings.catch_warnings():
                warnings.simplefilter('error', Image.DecompressionBombWarning)
                with Image.open(io.BytesIO(raw)) as image:
                    if image.format not in {'PNG', 'JPEG', 'WEBP', 'MPO'} or image.width * image.height > 30_000_000:
                        raise ValueError('image type or pixels')
                    image.seek(0)
                    image.load()
                    result.update(format=image.format, pages=1, frame_count=getattr(image, 'n_frames', 1))
                    image.thumbnail((200, 140))
                    out = io.BytesIO()
                    image.convert('RGB').save(out, 'PNG')
                    result['thumbnail'] = 'data:image/png;base64,' + base64.b64encode(out.getvalue()).decode('ascii')
                    result['preview_status'] = 'READY'
                    if result['frame_count'] > 1:
                        result['warning'] = '多帧图片只预览主图；其余帧保留，不当作独立页'
    except Exception:
        # Preview is best effort. Original bytes are neither repaired nor discarded.
        result['pages'] = None
        result['warning'] = '预览或页数读取失败，仍可归档原件；请老师核对可读性'
    return result


class IntakeService:
    def __init__(self, archive):
        self.archive = archive
        self.database = archive.root / 'intake.sqlite3'

    @contextmanager
    def _connect(self):
        with self.archive._index_lock:
            with self._locked_connect() as db:
                yield db

    @contextmanager
    def _locked_connect(self):
        self.database.parent.mkdir(parents=True, exist_ok=True)
        db = sqlite3.connect(self.database, timeout=20)
        db.row_factory = sqlite3.Row
        db.executescript('''
            CREATE TABLE IF NOT EXISTS flows(
                id TEXT PRIMARY KEY, request_id TEXT UNIQUE NOT NULL, fingerprint TEXT NOT NULL,
                meta TEXT NOT NULL, files TEXT NOT NULL, selected_id TEXT, status TEXT NOT NULL,
                response TEXT, created_at TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS assignments(
                id TEXT PRIMARY KEY, flow_id TEXT UNIQUE NOT NULL, student_id TEXT NOT NULL,
                subject TEXT NOT NULL, assignment_date TEXT NOT NULL, receipt TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS questions(
                assignment_id TEXT NOT NULL, number TEXT NOT NULL, source TEXT NOT NULL,
                status TEXT NOT NULL, knowledge TEXT,
                PRIMARY KEY(assignment_id,number,source));
        ''')
        try:
            with db:
                yield db
        finally:
            db.close()

    def submit(self, request_id, instruction, files, student_id=None, subject='math'):
        meta = parse_instruction(instruction, subject)
        return self._submit(request_id, instruction, files, student_id, subject, meta)

    def save_selected(self, student_id, subject, files, note='', assignment_date='', request_id=None):
        """The form's explicit student/subject selection is the authoritative scope."""
        student = self.archive.student(student_id)
        meta = parse_instruction((note or '') + '\n帮我归档', subject)
        if meta['subject'] != subject or meta['name'] and meta['name'] not in {student['name'], student.get('base_name')} or (
                meta['class_name'] and student.get('class_name') != meta['class_name']):
            raise ValueError('老师说明与所选学生、班级或学科不符，请核对后再保存')
        if assignment_date:
            given = date.fromisoformat(assignment_date).isoformat()
            if meta['assignment_date'] != '待补' and meta['assignment_date'] != given:
                raise ValueError('老师说明与填写日期不一致，请核对')
            meta['assignment_date'] = given
        meta.update(name=student['name'], class_name=student.get('class_name', ''), teacher_instruction=note)
        result = self._submit(request_id or uuid4().hex, note, files, student_id, subject, meta, explicit_student=True)
        if result['status'] != 'SAVED':
            raise RequestConflict(result['text'])
        receipt = result['receipt']
        return dict(receipt, markdown=self.markdown(receipt))

    def _submit(self, request_id, instruction, files, student_id, subject, meta, explicit_student=False):
        if not re.fullmatch(r'[A-Za-z0-9_-]{1,100}', request_id):
            raise ValueError('请求编号无效，请重新提交')
        if subject not in SUBJECTS:
            raise ValueError('请选择四个学科之一')
        if not 1 <= len(files) <= 12:
            raise ValueError('一次需添加1—12份同一学生同一作业的原件')
        items = [inspect_file(name, raw) for name, raw in files]
        if len({item['sha256'] for item in items}) != len(items):
            raise ValueError('这组文件中有内容相同的重复原件，请移除重复文件后再发')
        fingerprint_parts = [instruction, student_id, subject,
            [(item['original_name'], item['sha256']) for item in items]]
        if explicit_student:
            fingerprint_parts.append(meta['assignment_date'])
        fingerprint = hashlib.sha256(json.dumps(fingerprint_parts, ensure_ascii=False).encode()).hexdigest()
        with self._connect() as db:
            db.execute('BEGIN IMMEDIATE')
            previous = db.execute('SELECT * FROM flows WHERE request_id=?', (request_id,)).fetchone()
            if previous:
                if previous['fingerprint'] != fingerprint:
                    raise RequestConflict('同一请求编号的内容发生变化，请重新发送，不覆盖上次记录')
                if previous['response']:
                    response = json.loads(previous['response'])
                    response['replayed'] = True
                    return response
            else:
                for item, (_, raw) in zip(items, files):
                    rel = f"objects/{item['sha256']}"
                    write_original(self.archive.root / rel, raw)
                    item['relative_path'] = rel
                    item.pop('thumbnail', None)
                ident = uuid4().hex
                db.execute('INSERT INTO flows VALUES(?,?,?,?,?,?,?,?,?)', (ident, request_id, fingerprint,
                    json.dumps(meta, ensure_ascii=False), json.dumps(items, ensure_ascii=False), student_id,
                    'STAGED', None, utc_now()))
                previous = db.execute('SELECT * FROM flows WHERE id=?', (ident,)).fetchone()
            return self._advance(db, previous, chosen=student_id if explicit_student else None)

    def legacy_records(self, db, student_id, subject):
        known = {r[0] for r in db.execute('SELECT id FROM assignments WHERE student_id=? AND subject=?', (student_id, subject))}
        result, errors = [], []
        for path in sorted((self.archive.subject_dir(student_id, subject) / 'runs').glob('*.json')):
            try:
                old = json.loads(path.read_text(encoding='utf-8'))
                if old['assignment_id'] not in known:
                    result.append(old)
            except (OSError, ValueError, KeyError, TypeError):
                errors.append(path.name)
        return result, errors

    def continue_legacy(self, student_id, subject, assignment_id):
        """Explicitly index a legacy record; original files and old MD stay untouched."""
        if not re.fullmatch(r'A[0-9]{8}T[0-9]{6}-[a-f0-9]{12}', assignment_id):
            raise ValueError('旧记录编号无效')
        student = self.archive.student(student_id)
        folder = self.archive.subject_dir(student_id, subject)
        with self._connect() as db:
            db.execute('BEGIN IMMEDIATE')
            existing = db.execute('SELECT receipt FROM assignments WHERE id=? AND student_id=? AND subject=?',
                                  (assignment_id, student_id, subject)).fetchone()
            if existing:
                return {'status': 'SAVED', 'receipt': json.loads(existing['receipt']), 'replayed': True}
            old = json.loads((folder / 'runs' / (assignment_id + '.json')).read_text(encoding='utf-8'))
            if old['assignment_id'] != assignment_id:
                raise ValueError('旧记录编号与内容不符')
            files = []
            for item in old['files']:
                path = (folder / 'originals' / assignment_id / item['name']).resolve()
                if not path.is_relative_to((folder / 'originals' / assignment_id).resolve()):
                    raise ValueError('旧原件路径超出本作业')
                raw = path.read_bytes()
                if hashlib.sha256(raw).hexdigest() != item['sha256']:
                    raise OSError('旧原件哈希不一致，未续接')
                inspected = inspect_file(item['original_name'], raw)
                inspected.pop('thumbnail', None)
                inspected['relative_path'] = 'objects/' + inspected['sha256']
                write_original(self.archive.root / inspected['relative_path'], raw)
                files.append(inspected)
            if not files:
                raise ValueError('旧记录没有原件，不能续接')
            try:
                actual_date = date.fromisoformat(old.get('assignment_date', '')).isoformat()
            except (ValueError, TypeError):
                actual_date = '待补'
            markdown = folder / 'history' / (assignment_id + '.md')
            raw_md = markdown.read_bytes()
            candidates = list(dict.fromkeys(str(q) for q in old.get('questions', []) if re.fullmatch(r'\d{1,3}', str(q))))
            receipt = {'id': assignment_id, 'assignment_id': assignment_id, 'student': student, 'subject': subject,
                'subject_label': SUBJECTS[subject], 'class_name': '',
                'assignment_date': actual_date, 'batch': assignment_id, 'uploaded_at': old['updated_at'],
                'file_count': len(files), 'files': files, 'questions': [], 'candidate_questions': candidates,
                'conflict_questions': [], 'source': '旧手工记录／待核对',
                'pending': ['旧题号仅待核对；请老师通过更正确认完整错题清单', '旧记录未保存当时班级，不以当前名册推断'],
                'teacher_instruction': old.get('teacher_note', ''),
                'relative_path': markdown.relative_to(self.archive.root).as_posix(),
                'sha256': hashlib.sha256(raw_md).hexdigest()}
            db.execute('INSERT INTO assignments VALUES(?,?,?,?,?,?)', (assignment_id, 'legacy-' + assignment_id,
                student_id, subject, actual_date, json.dumps(receipt, ensure_ascii=False)))
            actual = json.loads(db.execute('SELECT receipt FROM assignments WHERE id=?', (assignment_id,)).fetchone()[0])
            if actual != receipt:
                raise OSError('旧记录续接回读不一致')
            return {'status': 'SAVED', 'receipt': actual}

    def _matching(self, meta):
        students = self.archive.list_students()
        by_name = [s for s in students if s['name'] == meta['name'] or s.get('base_name') == meta['name']]
        if meta['class_name']:
            exact = [s for s in by_name if s.get('class_name') == meta['class_name']]
            return exact or [s for s in by_name if not s.get('class_name')]
        return by_name

    def _advance(self, db, flow, chosen=None, create=False, explicit=False):
        if flow['status'] in {'SAVED', 'DUPLICATE'}:
            return json.loads(flow['response'])
        meta, files = json.loads(flow['meta']), json.loads(flow['files'])
        selected = self.archive.student(flow['selected_id']) if flow['selected_id'] else None
        if not meta['name'] and selected:
            meta['name'] = selected.get('base_name', selected['name'])
        matches = self._matching(meta) if meta['name'] else []
        if chosen:
            if chosen not in {s['id'] for s in matches}:
                raise ValueError('该学生与本次文字不匹配，请修改说明再继续，不能强行错归')
            student = next(s for s in matches if s['id'] == chosen)
        elif create and meta['name'] and not matches:
            student = self.archive.resolve_student(meta['name'], True, meta['class_name'])['student']
        elif len(matches) == 1 and (not selected or selected['id'] == matches[0]['id']) and (
                not meta['class_name'] or matches[0].get('class_name') == meta['class_name']):
            student = matches[0]
        else:
            response = {'status': 'NEEDS_STUDENT', 'flow_id': flow['id'], 'matches': matches,
                        'can_create': bool(meta['name'] and not matches), 'name': meta['name'],
                        'class_name': meta['class_name'], 'file_count': len(files),
                        'text': '材料已暂存，尚未归档。请确认是哪名学生；没有就新建。' if meta['name'] else
                                '材料已暂存，尚未归档。请补充“学生姓名”的明确说明。'}
            db.execute('UPDATE flows SET meta=?,status=?,response=? WHERE id=?', (
                json.dumps(meta, ensure_ascii=False), 'NEEDS_STUDENT', json.dumps(response, ensure_ascii=False), flow['id']))
            return response
        return self._commit(db, flow, meta, files, student)

    def resolve(self, flow_id, student_id=None, confirm_create=False, instruction=None):
        with self._connect() as db:
            db.execute('BEGIN IMMEDIATE')
            flow = db.execute('SELECT * FROM flows WHERE id=?', (flow_id,)).fetchone()
            if not flow:
                raise KeyError('没有找到暂存流程')
            if instruction and flow['status'] not in {'SAVED', 'DUPLICATE'}:
                meta = parse_instruction(instruction, json.loads(flow['meta'])['subject'])
                db.execute('UPDATE flows SET meta=?,selected_id=NULL WHERE id=?', (json.dumps(meta, ensure_ascii=False), flow_id))
                flow = db.execute('SELECT * FROM flows WHERE id=?', (flow_id,)).fetchone()
            return self._advance(db, flow, student_id, confirm_create, True)

    def _commit(self, db, flow, meta, files, student):
        previous = db.execute('SELECT receipt FROM assignments WHERE student_id=? AND subject=?',
                              (student['id'], meta['subject'])).fetchall()
        hashes = {f['sha256'] for f in files}
        duplicate_ids = []
        for row in previous:
            receipt = json.loads(row['receipt'])
            if hashes & {f['sha256'] for f in receipt['files']}:
                duplicate_ids.append(receipt['assignment_id'])
        # Include existing first-slice records in duplicate checks without migrating them.
        runs = self.archive.subject_dir(student['id'], meta['subject']) / 'runs'
        if runs.exists():
            for path in runs.glob('*.json'):
                old = json.loads(path.read_text(encoding='utf-8'))
                if hashes & {f['sha256'] for f in old.get('files', [])}:
                    duplicate_ids.append(old['assignment_id'])
        if duplicate_ids:
            result = {'status': 'DUPLICATE', 'flow_id': flow['id'], 'assignment_ids': duplicate_ids,
                      'text': '检测到该生该科已有相同或部分重叠原件，未新建作业或错题。请核对原记录；更正不按新作业重复记。'}
        else:
            for item in files:
                raw = (self.archive.root / item['relative_path']).read_bytes()
                if hashlib.sha256(raw).hexdigest() != item['sha256']:
                    raise OSError('原件回读哈希不一致')
            ident = 'A-' + flow['id']
            pending = []
            if meta['assignment_date'] == '待补':
                pending.append('作业日期待补，上传时间另外保留')
            if not meta['class_name'] and not student.get('class_name'):
                pending.append('班级待补')
            if not meta['questions']:
                pending.append('尚无教师明确提供的错题号；不代表全对')
            pending.extend(f"{f['original_name']}：{f['warning']}" for f in files if f.get('warning'))
            if meta['candidate_questions']:
                pending.append('AI候选题号待老师确认，不计入已确认错题')
            if meta.get('conflict_questions'):
                pending.append('前后判断矛盾：' + '、'.join('第' + q + '题' for q in meta['conflict_questions']) + '，未计入确认错题，请老师核对')
            receipt = {'id': ident, 'assignment_id': ident, 'student': student, 'subject': meta['subject'],
                       'subject_label': SUBJECTS[meta['subject']], 'class_name': meta['class_name'] or student.get('class_name', ''),
                       'assignment_date': meta['assignment_date'], 'batch': meta['batch'] or ident,
                       'uploaded_at': flow['created_at'], 'file_count': len(files), 'files': files,
                       'questions': meta['questions'], 'candidate_questions': meta['candidate_questions'],
                       'conflict_questions': meta.get('conflict_questions', []),
                       'source': '教师明确提供', 'pending': pending, 'teacher_instruction': meta['teacher_instruction']}
            markdown = self.markdown(receipt)
            rel = f"students/{student['id']}/subjects/{meta['subject']}/history/{ident}.md"
            write_original(self.archive.root / rel, markdown.encode('utf-8'))
            receipt.update(relative_path=rel, sha256=hashlib.sha256(markdown.encode('utf-8')).hexdigest())
            db.execute('INSERT INTO assignments VALUES(?,?,?,?,?,?)', (ident, flow['id'], student['id'], meta['subject'],
                       meta['assignment_date'], json.dumps(receipt, ensure_ascii=False)))
            for status, source, numbers in [('CONFIRMED', '教师明确提供', meta['questions']),
                                            ('AI_PENDING', 'AI候选／待老师确认', meta['candidate_questions'])]:
                db.executemany('INSERT INTO questions VALUES(?,?,?,?,NULL)', [(ident, q, source, status) for q in numbers])
            actual = json.loads(db.execute('SELECT receipt FROM assignments WHERE id=?', (ident,)).fetchone()['receipt'])
            if actual != receipt:
                raise OSError('归档回读不一致')
            result = {'status': 'SAVED', 'flow_id': flow['id'], 'receipt': receipt,
                      'text': self.receipt_text(receipt), 'mode': 'local_archive'}
        db.execute('UPDATE flows SET status=?,response=? WHERE id=?', (result['status'], json.dumps(result, ensure_ascii=False), flow['id']))
        return result

    @staticmethod
    def receipt_text(r):
        return (f"已归档并回读：{r['class_name'] or '班级待补'} · {r['student']['name']} · {r['subject_label']}\n"
                f"作业日期：{r['assignment_date']}；文件{r['file_count']}份；教师明确错题{len(r['questions'])}道"
                f"（{'、'.join('第' + q + '题' for q in r['questions']) or '未提供'}）。\n"
                f"待确认：{'；'.join(r['pending']) or '无'}。\n批次：{r['batch']}。原件与哈希已保留；未调用外部模型。")

    @staticmethod
    def markdown(r):
        return (f"# {r['student']['name']} · {r['subject_label']} · 作业记录\n\n"
                f"- 班级：{r['class_name'] or '待补'}\n- 作业日期：{r['assignment_date']}\n"
                f"- 上传时间：{r['uploaded_at']}\n- 批次：{r['batch']}\n- 原件：{r['file_count']}份\n\n"
                '## 教师明确提供\n' + '\n'.join('- 第' + q + '题错' for q in r['questions']) +
                '\n\n## AI候选／待老师确认\n' + '\n'.join('- 第' + q + '题' for q in r['candidate_questions']) +
                '\n\n## 原件与SHA-256\n' + '\n'.join(f"- {f['original_name']}：{f['sha256']}；{f['relative_path']}" for f in r['files']) +
                '\n\n## 教师原话\n' + r['teacher_instruction'] + '\n\n## 待补\n' + '\n'.join('- ' + p for p in r['pending']) +
                ('\n\n## 教师更正\n' + r['correction_reason'] + f"（修订{r['correction_revision']}）\n" if r.get('correction_revision') else '') +
                '\n\n单次错误不代表长期薄弱；未进行自动批改或知识点推断。\n')

    def latest(self, student_id, subject):
        with self._connect() as db:
            row = db.execute('SELECT receipt FROM assignments WHERE student_id=? AND subject=? ORDER BY rowid DESC LIMIT 1',
                             (student_id, subject)).fetchone()
            return effective(db, json.loads(row['receipt'])) if row else None

    def history(self, text, student_id, subject):
        context = instruction_context(text, subject)
        subject = context['subject']
        if context['name']:
            matches = self._matching(context)
            if len(matches) != 1 or student_id and student_id != matches[0]['id']:
                return {'status': 'NEEDS_STUDENT', 'text': '查询文字与当前学生不一致或存在重名，请先在学生档案中明确选择；未返回其他学生记录。'}
            student_id = matches[0]['id']
        if not student_id:
            return {'status': 'NEEDS_STUDENT', 'text': '请先在学生档案中选择要查询的学生；不按姓名猜测归属。'}
        student = self.archive.student(student_id)
        if subject not in SUBJECTS:
            raise ValueError('学科无效')
        with self._connect() as db:
            rows = db.execute('SELECT receipt FROM assignments WHERE student_id=? AND subject=? ORDER BY rowid DESC', (student_id, subject)).fetchall()
            all_records = [effective(db, json.loads(row['receipt'])) for row in rows]
        undated = [r for r in all_records if r['assignment_date'] == '待补']
        month = bool(re.search(r'最近.{0,2}(?:月|30天)|近一个月', text))
        today = datetime.now(ZoneInfo('Asia/Shanghai')).date()
        cutoff = (today - timedelta(days=30)).isoformat()
        records = [r for r in all_records if not month or r['assignment_date'] != '待补' and cutoff <= r['assignment_date'] <= today.isoformat()]
        legacy, legacy_unreadable = [], []
        runs = self.archive.subject_dir(student_id, subject) / 'runs'
        if runs.exists():
            for path in sorted(runs.glob('*.json'), reverse=True):
                try:
                    old = json.loads(path.read_text(encoding='utf-8'))
                    if old['assignment_id'] in {r['assignment_id'] for r in all_records}:
                        continue
                    old_date = old.get('assignment_date') or '待补'
                    try:
                        old_date = date.fromisoformat(old_date).isoformat()
                    except (ValueError, TypeError):
                        old_date = '待补'
                    legacy.append({'assignment_id': old['assignment_id'], 'assignment_date': old_date,
                                   'questions': old.get('questions', []), 'source': '旧手工记录／待核对',
                                   'relative_path': str(path.relative_to(self.archive.root)).replace('\\', '/')})
                except (OSError, ValueError, KeyError, TypeError):
                    legacy_unreadable.append(path.name)
        legacy_undated = [r for r in legacy if r['assignment_date'] == '待补']
        legacy_records = [r for r in legacy if not month or r['assignment_date'] != '待补' and cutoff <= r['assignment_date'] <= today.isoformat()]
        count = sum(len(r['questions']) for r in records)
        knowledge_query = bool(re.search(r'二次函数|知识点|相关问题|出现过几次', text))
        lines = [f"{student['name']} · {SUBJECTS[subject]}：{'最近30天' if month else '已归档历史'}教师明确错题{count}道（按作业分别计数）。"]
        for r in records[:50]:
            lines.append(f"- {r['assignment_date']} · {r['batch']}：" + ('、'.join('第' + q + '题' for q in r['questions']) or '未提供教师错题号'))
        if legacy:
            lines.append(f'另有旧手工记录{len(legacy_records)}份（本次时间范围），来源待核对，未混入上方教师确认错题数；旧文件保留未改。')
            for r in legacy_records[:50]:
                lines.append(f"- {r['assignment_date']} · {r['assignment_id']} · 待核对题号：" + ('、'.join(map(str, r['questions'])) or '未提供'))
            if month and legacy_undated:
                lines.append(f'另有{len(legacy_undated)}份旧手工记录日期待补，未纳入最近30天范围。')
        if legacy_unreadable:
            lines.append(f'另有{len(legacy_unreadable)}份旧记录读取失败，未据此断言没有历史；请核对本地runs记录。')
        if knowledge_query:
            from backend.learning import LearningService
            report = LearningService(self).analysis(student_id, subject)['personal']
            if report['patterns']:
                lines.append('经老师确认的知识点关联（全部归档范围，不等同于本次时间筛选）：')
                lines.extend(f"- {p['tag']}：{p['assignment_count']}份作业、{p['question_count']}道题；{p['suggestion']}" for p in report['patterns'])
            else:
                lines.append('尚无经核对的知识点关联，不能据题号推断二次函数等知识点次数；请先补关联。')
        if undated:
            lines.append(f'另有{len(undated)}份日期待补作业，未纳入最近30天统计。' if month else f'{len(undated)}份作业日期待补。')
        lines.append('AI候选不计为确认错误；单次记录不代表长期薄弱。历史查询在本地执行，未外发档案。')
        return {'status': 'HISTORY', 'text': '\n'.join(lines), 'assignments': records[:50], 'confirmed_count': count,
                'legacy_assignments': legacy_records[:50], 'legacy_count': len(legacy_records),
                'legacy_undated_count': len(legacy_undated), 'legacy_unreadable': legacy_unreadable,
                'undated_count': len(undated), 'knowledge_count': None, 'mode': 'local_archive'}
