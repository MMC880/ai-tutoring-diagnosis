"""Local student-subject archive. Stores originals and Markdown summaries only."""
from __future__ import annotations

import hashlib
import json
import re
import threading
import unicodedata
import uuid
from datetime import datetime, timezone
from pathlib import Path

SUBJECTS = {
    'math': '数学',
    'english': '英语',
    'physics': '物理',
    'chemistry': '化学',
}
FORBIDDEN_NAME = re.compile(r'[<>:"/\\|?*\x00-\x1f]')
QUESTION_NUMBERS = re.compile(r'(?<!\d)(\d{1,3})(?!\d)')


def utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace('+00:00', 'Z')


def slug_name(name: str) -> str:
    cleaned = FORBIDDEN_NAME.sub('', unicodedata.normalize('NFKC', name)).strip().strip('.')
    cleaned = re.sub(r'\s+', '', cleaned)
    if not cleaned or cleaned in {'.', '..'}:
        raise ValueError('学生称呼不能为空，也不能只含文件名禁用字符')
    if cleaned.upper() in {'CON', 'PRN', 'AUX', 'NUL'} or re.fullmatch(r'(COM|LPT)\d', cleaned.upper()):
        raise ValueError('学生称呼不能使用系统保留名')
    if len(cleaned) > 40:
        raise ValueError('学生称呼过长')
    return cleaned


def extract_question_numbers(note: str) -> list[str]:
    from backend.instruction import question_evidence
    return question_evidence(note)[0]


class ArchiveStore:
    _index_lock = threading.RLock()
    def __init__(self, root: Path):
        self.root = Path(root)
        self.index_path = self.root / 'index.json'

    def _load_index(self) -> dict:
        if not self.index_path.exists():
            return {'students': []}
        return json.loads(self.index_path.read_text(encoding='utf-8'))

    def _save_index(self, data: dict) -> None:
        self.root.mkdir(parents=True, exist_ok=True)
        tmp = self.index_path.with_suffix('.json.tmp')
        tmp.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding='utf-8')
        tmp.replace(self.index_path)

    def list_subjects(self) -> list[dict[str, str]]:
        return [{'id': key, 'label': label} for key, label in SUBJECTS.items()]

    def list_students(self) -> list[dict]:
        return list(self._load_index()['students'])

    def resolve_student(self, name: str, confirm_new: bool = False, class_name: str = '') -> dict:
        with self._index_lock:
            return self._resolve_student(name, confirm_new, class_name)

    def _resolve_student(self, name: str, confirm_new: bool, class_name: str) -> dict:
        display = slug_name(name)
        base_name = display
        class_name = class_name.strip()[:80]
        index = self._load_index()
        matches = [item for item in index['students'] if (item['name'] == display or item.get('base_name') == display)
                   and (not class_name or item.get('class_name', '') == class_name)]
        if matches and not confirm_new:
            if len(matches) > 1:
                return {'status': 'ambiguous', 'matches': matches}
            return {'status': 'existing', 'student': matches[0], 'matches': matches}
        if confirm_new and any(item['name'] == display for item in index['students']):
            suffix = 2
            candidate = f'{display}{suffix}'
            taken = {item['name'] for item in index['students']}
            while candidate in taken:
                suffix += 1
                candidate = f'{display}{suffix}'
            display = candidate
        elif not matches and not confirm_new:
            return {'status': 'needs_create', 'name': display}
        student_id = f"s{len(index['students']) + 1:03d}"
        record = {'id': student_id, 'name': display, 'base_name': base_name,
                  'class_name': class_name, 'created_at': utc_now()}
        index['students'].append(record)
        self._save_index(index)
        (self.root / 'students' / student_id).mkdir(parents=True, exist_ok=True)
        return {'status': 'created', 'student': record, 'matches': [record]}

    def student(self, student_id: str) -> dict:
        for item in self._load_index()['students']:
            if item['id'] == student_id:
                return item
        raise KeyError('找不到该学生')

    def subject_dir(self, student_id: str, subject: str) -> Path:
        if subject not in SUBJECTS:
            raise KeyError('学科必须是数学、英语、物理或化学')
        self.student(student_id)
        path = self.root / 'students' / student_id / 'subjects' / subject
        path.mkdir(parents=True, exist_ok=True)
        (path / 'originals').mkdir(exist_ok=True)
        (path / 'history').mkdir(exist_ok=True)
        return path

    def latest(self, student_id: str, subject: str) -> dict:
        folder = self.subject_dir(student_id, subject)
        latest = folder / 'latest.md'
        meta_path = folder / 'latest.json'
        if not latest.exists():
            student = self.student(student_id)
            empty = (
                f"# {student['name']} · {SUBJECTS[subject]}\n\n"
                f"- 学生：{student['name']}\n"
                f"- 学科：{SUBJECTS[subject]}\n"
                f"- 状态：尚无材料\n"
                f"- 待补项：作业日期、错题记录\n"
            )
            return {
                'exists': False,
                'markdown': empty,
                'updated_at': None,
                'assignment_id': None,
                'files': [],
                'questions': [],
            }
        meta = json.loads(meta_path.read_text(encoding='utf-8')) if meta_path.exists() else {}
        return {
            'exists': True,
            'markdown': latest.read_text(encoding='utf-8'),
            'updated_at': meta.get('updated_at'),
            'assignment_id': meta.get('assignment_id'),
            'files': meta.get('files', []),
            'questions': meta.get('questions', []),
        }

    def save_task(
        self,
        student_id: str,
        subject: str,
        files: list[tuple[str, bytes]],
        teacher_note: str = '',
        assignment_date: str | None = None,
    ) -> dict:
        if not files:
            raise ValueError('至少需要一份作业原件')
        if len(files) > 12:
            raise ValueError('一次最多保存12个文件')
        for filename, data in files:
            if len(data) > 15 * 1024 * 1024:
                raise ValueError(f'{filename} 超过15MB')
            if not data:
                raise ValueError(f'{filename} 是空文件')
        folder = self.subject_dir(student_id, subject)
        student = self.student(student_id)
        assignment_id = datetime.now(timezone.utc).strftime('A%Y%m%dT%H%M%S') + '-' + uuid.uuid4().hex[:12]
        original_dir = folder / 'originals' / assignment_id
        original_dir.mkdir(parents=True, exist_ok=False)
        saved = []
        for index, (filename, data) in enumerate(files, start=1):
            safe = FORBIDDEN_NAME.sub('_', Path(filename).name) or f'file-{index}'
            digest = hashlib.sha256(data).hexdigest()
            stored_name = f'{index:02d}-{safe}'
            target = original_dir / stored_name
            with target.open('xb') as original:
                original.write(data)
            saved.append({'name': stored_name, 'original_name': filename, 'sha256': digest, 'bytes': len(data)})
        questions = extract_question_numbers(teacher_note)
        date_value = (assignment_date or '').strip() or '待补'
        note = (teacher_note or '').strip() or '未提供文字说明'
        question_lines = '\n'.join(f'- 第{item}题（教师说明中的题号，待核对）' for item in questions) or '- 暂无题号，待老师补充'
        markdown = (
            f"# {student['name']} · {SUBJECTS[subject]}\n\n"
            f"- 学生：{student['name']}\n"
            f"- 学科：{SUBJECTS[subject]}\n"
            f"- 作业批次：{assignment_id}\n"
            f"- 作业日期：{date_value}\n"
            f"- 上传时间：{utc_now()}\n"
            f"- 原件数量：{len(saved)}\n\n"
            f"## 原件\n"
            + '\n'.join(f"- {item['original_name']}（{item['bytes']}字节）" for item in saved)
            + "\n\n## 已记录问题\n"
            + question_lines
            + "\n\n## 老师说明\n\n"
            + note
            + "\n\n## 待补项\n"
            + ('- 无\n' if date_value != '待补' and questions else '- 作业日期或错题题号仍待补充\n')
            + "\n一次记录不等于长期薄弱。下次默认只把本摘要导入 Agent，原件需老师另选。\n"
        )
        (folder / 'history' / f'{assignment_id}.md').write_text(markdown, encoding='utf-8')
        (folder / 'latest.md').write_text(markdown, encoding='utf-8')
        meta = {
            'assignment_id': assignment_id,
            'updated_at': utc_now(),
            'assignment_date': date_value,
            'files': saved,
            'questions': questions,
            'teacher_note': note,
        }
        (folder / 'latest.json').write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding='utf-8')
        (folder / 'runs' ).mkdir(exist_ok=True)
        (folder / 'runs' / f'{assignment_id}.json').write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding='utf-8')
        return {
            'student': student,
            'subject': subject,
            'subject_label': SUBJECTS[subject],
            'assignment_id': assignment_id,
            'assignment_date': date_value,
            'file_count': len(saved),
            'questions': questions,
            'markdown': markdown,
            'import_default': 'latest_summary_only',
        }
