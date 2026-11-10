"""Observable intake effects: identity, provenance, originals and repeat requests."""
import hashlib
import io
import tempfile
import unittest
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient
from PIL import Image
from pypdf import PdfWriter

from backend.main import create_app
from backend.archive import ArchiveStore
from backend.intake import IntakeService


def photo(color='white'):
    out = io.BytesIO()
    Image.new('RGB', (30, 20), color).save(out, 'PNG')
    return out.getvalue()


class IntakeTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.client = TestClient(create_app(self.root / 'probe.sqlite3', self.root / 'archive'))

    def tearDown(self):
        self.client.close()
        self.temp.cleanup()

    def student(self, name='A', class_name='九年级一班'):
        response = self.client.post('/api/students', json={'name': name, 'confirm_new': True, 'class_name': class_name})
        self.assertEqual(response.status_code, 200)
        return response.json()['student']

    def submit(self, text=None, ident='request-one', files=None, **extra):
        return self.client.post('/api/intake', data={
            'request_id': ident,
            'instruction': text or '这是九年级一班学生 A 今天的数学作业，帮我归档。错题是第3、5、8题。',
            **extra,
        }, files=[('files', (name, data, 'application/octet-stream'))
                  for name, data in (files or [('p1.jpg', photo()), ('p2.png', photo('blue')), ('p3.png', photo('red'))])])

    def test_teacher_instruction_saves_originals_receipt_and_restart_history(self):
        student = self.student()
        result = self.submit()
        self.assertEqual(result.status_code, 200, result.text)
        data = result.json()
        self.assertEqual(data['status'], 'SAVED')
        receipt = data['receipt']
        self.assertEqual(receipt['student']['id'], student['id'])
        self.assertEqual(receipt['class_name'], '九年级一班')
        self.assertEqual(receipt['questions'], ['3', '5', '8'])
        self.assertEqual(receipt['source'], '教师明确提供')
        self.assertEqual(receipt['file_count'], 3)
        for item, expected in zip(receipt['files'], [photo(), photo('blue'), photo('red')]):
            actual = (self.root / 'archive' / item['relative_path']).read_bytes()
            self.assertEqual(actual, expected)
            self.assertEqual(item['sha256'], hashlib.sha256(actual).hexdigest())
        with TestClient(create_app(self.root / 'probe.sqlite3', self.root / 'archive')) as restarted:
            history = restarted.post('/api/intake/query', json={'text': '最近一个月错过哪些题', 'student_id': student['id'], 'subject': 'math'}).json()
        self.assertEqual(history['confirmed_count'], 3)
        self.assertIn('第3题', history['text'])
        self.assertEqual(history['assignments'][0]['assignment_id'], receipt['assignment_id'])

    def test_new_student_requires_confirmation_and_resumes_without_reupload(self):
        pending = self.submit()
        self.assertEqual(pending.status_code, 200, pending.text)
        data = pending.json()
        self.assertEqual(data['status'], 'NEEDS_STUDENT')
        self.assertTrue(data['can_create'])
        self.assertEqual(self.client.get('/api/students').json()['students'], [])
        result = self.client.post('/api/intake/resolve', json={'flow_id': data['flow_id'], 'confirm_create': True})
        self.assertEqual(result.status_code, 200, result.text)
        self.assertEqual(result.json()['status'], 'SAVED')
        self.assertEqual(result.json()['receipt']['file_count'], 3)

    def test_same_name_is_class_scoped_and_unqualified_name_does_not_guess(self):
        one = self.student(class_name='九年级一班')
        two = self.student(class_name='九年级二班')
        self.assertNotEqual(one['id'], two['id'])
        ambiguous = self.submit('学生A的数学作业，帮我归档，第3题错').json()
        self.assertEqual(ambiguous['status'], 'NEEDS_STUDENT')
        self.assertEqual(len(ambiguous['matches']), 2)
        resolved = self.client.post('/api/intake/resolve', json={'flow_id': ambiguous['flow_id'], 'student_id': two['id']}).json()
        self.assertEqual(resolved['receipt']['student']['id'], two['id'])
        self.assertEqual(resolved['receipt']['class_name'], '九年级二班')

    def test_selected_student_conflict_requires_explicit_resolution(self):
        one, two = self.student(), self.student('B')
        data = self.submit(student_id=two['id']).json()
        self.assertEqual(data['status'], 'NEEDS_STUDENT')
        self.assertEqual(data.get('receipt'), None)
        wrong = self.client.post('/api/intake/resolve', json={'flow_id': data['flow_id'], 'student_id': two['id']})
        self.assertEqual(wrong.status_code, 422)
        good = self.client.post('/api/intake/resolve', json={'flow_id': data['flow_id'], 'student_id': one['id']}).json()
        self.assertEqual(good['status'], 'SAVED')

    def test_dates_scores_negation_and_ai_candidates_are_not_teacher_facts(self):
        student = self.student()
        result = self.submit('学生A的数学作业，帮我归档。考试日期2026-10-08，总分120，考了85。第3题错，第5题对。').json()
        self.assertEqual(result['receipt']['questions'], ['3'])
        self.assertEqual(result['receipt']['assignment_date'], '2026-10-08')
        candidate = self.submit('学生A数学作业归档。AI推测第8题错，疑似第9题错，第10题没错。', ident='candidates', files=[('other.png', photo('green'))]).json()
        self.assertEqual(candidate['receipt']['questions'], [])
        self.assertEqual(candidate['receipt']['candidate_questions'], ['8', '9'])
        self.assertEqual(candidate['receipt']['assignment_date'], '待补')
        history = self.client.post('/api/intake/query', json={'text': '二次函数相关问题出现过几次', 'student_id': student['id'], 'subject': 'math'}).json()
        self.assertIn('尚无', history['text'])
        self.assertIsNone(history['knowledge_count'])

    def test_repeats_overlap_and_concurrency_do_not_duplicate(self):
        self.student()
        first = self.submit().json()
        self.assertEqual(first['status'], 'SAVED')
        replay = self.submit().json()
        self.assertEqual(replay['receipt']['assignment_id'], first['receipt']['assignment_id'])
        self.assertTrue(replay['replayed'])
        repeat = self.submit(ident='repeat').json()
        self.assertEqual(repeat['status'], 'DUPLICATE')
        partial = self.submit(ident='partial', files=[('p1.jpg', photo()), ('new.png', photo('black'))]).json()
        self.assertEqual(partial['status'], 'DUPLICATE')
        with ThreadPoolExecutor(max_workers=2) as pool:
            results = list(pool.map(lambda n: self.submit(ident='parallel-' + str(n), files=[('unique.png', photo('yellow'))]).json()['status'], range(2)))
        self.assertCountEqual(results, ['SAVED', 'DUPLICATE'])
        changed = self.submit(text='学生A数学作业归档，第9题错')
        self.assertEqual(changed.status_code, 409)

    def test_unreadable_photo_archives_with_warning_without_ocr(self):
        self.student()
        result = self.submit(files=[('broken.jpg', b'original-but-unreadable')]).json()
        self.assertEqual(result['status'], 'SAVED')
        self.assertEqual(result['receipt']['files'][0]['preview_status'], 'UNAVAILABLE')
        self.assertTrue(result['receipt']['pending'])
        self.assertEqual(result['receipt']['questions'], ['3', '5', '8'])

    def test_pdf_page_count_and_original_are_preserved(self):
        self.student()
        out = io.BytesIO()
        pdf = PdfWriter()
        for _ in range(2):
            pdf.add_blank_page(width=300, height=400)
        pdf.write(out)
        raw = out.getvalue()
        preview = self.client.post('/api/intake/inspect', files={'file': ('试卷.pdf', raw)}).json()
        self.assertEqual(preview['pages'], 2)
        saved = self.submit(files=[('试卷.pdf', raw)]).json()['receipt']
        self.assertEqual(saved['files'][0]['pages'], 2)
        self.assertEqual((self.root / 'archive' / saved['files'][0]['relative_path']).read_bytes(), raw)

    def test_conflicting_dates_or_mixed_verdicts_do_not_invent_facts(self):
        self.student()
        conflict = self.submit('学生A数学作业归档，日期2026-10-08或2026-10-09，第3题错')
        self.assertEqual(conflict.status_code, 422)
        data = self.submit('学生A数学作业归档。第3题对第5题错；第8题不是错题；AI认为第9题错。').json()
        self.assertEqual(data['receipt']['questions'], ['5'])
        self.assertEqual(data['receipt']['candidate_questions'], ['9'])

    def test_questions_and_student_reports_are_not_teacher_assertions(self):
        self.student()
        data = self.submit('学生A数学作业归档。第3题错吗？是否第5题错；学生说第8题错；我不确定第9题错。').json()
        self.assertEqual(data['receipt']['questions'], [])

    def test_ai_provenance_survives_comma_separated_verdicts(self):
        self.student()
        data = self.submit('学生A数学作业归档。AI认为第3题错，第5题错。老师确认第8题错。').json()
        self.assertEqual(data['receipt']['questions'], ['8'])
        self.assertEqual(data['receipt']['candidate_questions'], ['3', '5'])

    def test_reported_children_and_parents_are_not_teacher_facts(self):
        self.student()
        data = self.submit('学生A数学作业归档。孩子说第3题错，第5题错。家长反馈第8题错。同学认为第9题错。老师确认第10题错。').json()
        self.assertEqual(data['receipt']['questions'], ['10'])

    def test_contradictory_verdicts_archive_material_but_not_confirmed_error(self):
        self.student()
        data = self.submit('学生A数学作业归档。第3题错，第3题正确。第5题错。').json()
        self.assertEqual(data['status'], 'SAVED')
        self.assertEqual(data['receipt']['questions'], ['5'])
        self.assertEqual(data['receipt']['conflict_questions'], ['3'])
        self.assertTrue(any('矛盾' in item for item in data['receipt']['pending']))

    def test_history_does_not_answer_for_wrong_selected_student_or_subject(self):
        one, two = self.student(), self.student('B')
        self.submit()
        result = self.client.post('/api/intake/query', json={'text': '学生B最近一个月错过哪些题', 'student_id': one['id'], 'subject': 'math'}).json()
        self.assertEqual(result['status'], 'NEEDS_STUDENT')
        by_name = self.client.post('/api/intake/query', json={'text': '学生A最近一个月错过哪些题', 'subject': 'math'}).json()
        self.assertEqual(by_name['confirmed_count'], 3)
        english = self.client.post('/api/intake/query', json={'text': '学生A最近一个月英语错过哪些题', 'student_id': one['id'], 'subject': 'math'}).json()
        self.assertEqual(english['confirmed_count'], 0)
        self.assertIn('英语', english['text'])

    def test_failure_does_not_claim_saved_or_hide_pending_request(self):
        self.student()
        with patch('backend.intake.write_original', side_effect=OSError('disk failed')):
            response = self.submit()
        self.assertEqual(response.status_code, 503)
        data = self.submit().json()
        self.assertEqual(data['status'], 'SAVED')

    def test_legacy_history_is_visible_without_promoting_old_evidence(self):
        student = self.student()
        archive = ArchiveStore(self.root / 'archive')
        old = archive.save_task(student['id'], 'math', [('old.png', photo())], '第3题错', '2026-11-10')
        result = IntakeService(archive).history('数学历史错题记录', student['id'], 'math')
        self.assertEqual(result['legacy_count'], 1)
        self.assertIn(old['assignment_id'], result['text'])
        self.assertIn('未混入', result['text'])
        self.assertEqual(result['confirmed_count'], 0)

    def test_no_archive_request_does_not_write_and_unknown_date_is_separate(self):
        student = self.student()
        response = self.submit('请分析学生A的数学题，第3题错')
        self.assertEqual(response.status_code, 422)
        saved = self.submit('学生A数学作业归档，第3题错').json()
        self.assertEqual(saved['receipt']['assignment_date'], '待补')
        query = self.client.post('/api/intake/query', json={'text': '最近一个月错过哪些题', 'student_id': student['id'], 'subject': 'math'}).json()
        self.assertEqual(query['confirmed_count'], 0)
        self.assertEqual(query['undated_count'], 1)


if __name__ == '__main__':
    unittest.main()
