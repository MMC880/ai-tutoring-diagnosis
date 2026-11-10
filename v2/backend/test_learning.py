import io
import tempfile
import unittest
from pathlib import Path

from fastapi.testclient import TestClient
from PIL import Image

from backend.main import create_app


class LearningTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.client = TestClient(create_app(archive_root=self.root))
        self.student = self.client.post('/api/students', json={'name': '测试A', 'class_name': '一班', 'confirm_new': True}).json()['student']
        self.a = self.assignment('first', 'red')

    def tearDown(self):
        self.client.close()
        self.temp.cleanup()

    def assignment(self, ident, color, student=None):
        out = io.BytesIO()
        Image.new('RGB', (20, 20), color).save(out, 'PNG')
        data = self.client.post('/api/intake', data={'request_id': ident, 'instruction': '数学作业归档，第3题错',
            'student_id': (student or self.student)['id']}, files={'files': (ident + '.png', out.getvalue())}).json()
        return data['receipt']

    def link(self, assignment=None, **extra):
        assignment = assignment or self.a
        return self.client.post('/api/learning/link', json={'student_id': assignment['student']['id'], 'subject': 'math',
            'assignment_id': assignment['assignment_id'], 'number': '3', 'tag': '二次函数顶点式',
            'evidence_hash': assignment['files'][0]['sha256'], 'page': 1, 'quote': '第3题括号符号待核对',
            'status': 'CANDIDATE', 'expected_revision': 0, **extra})

    def test_link_candidate_confirmation_and_revision_preserve_original(self):
        first = self.link()
        self.assertEqual(first.status_code, 200, first.text)
        self.assertEqual(first.json()['revision'], 1)
        confirmed = self.link(status='CONFIRMED', expected_revision=1).json()
        self.assertEqual(confirmed['revision'], 2)
        corrected = self.link(tag='一次函数图象', status='CONFIRMED', expected_revision=2)
        self.assertEqual(corrected.status_code, 200, corrected.text)
        read = self.client.get('/api/learning/workspace', params={'student_id': self.student['id'], 'subject': 'math'}).json()
        self.assertEqual(read['links'][0]['tag'], '一次函数图象')
        self.assertEqual(len(read['link_history']), 3)
        self.assertEqual(read['link_history'][0]['status'], 'CANDIDATE')
        self.assertEqual(read['assignments'][0]['questions'], ['3'])
        self.assertEqual(self.link(expected_revision=1, status='CONFIRMED').status_code, 409)

    def test_evidence_scope_and_question_are_validated(self):
        self.assertEqual(self.link(evidence_hash='0' * 64).status_code, 422)
        self.assertEqual(self.link(number='999').status_code, 422)
        self.assertEqual(self.link(page=2).status_code, 422)
        other = self.client.post('/api/students', json={'name': '测试B', 'confirm_new': True}).json()['student']
        self.assertEqual(self.link(student_id=other['id']).status_code, 404)
        self.assertEqual(self.link(tag='心理画像').status_code, 422)
        self.assertEqual(list(self.root.rglob('learning-*.md')), [])

    def test_recurrence_uses_distinct_assignments_confirmed_links_and_class_scope(self):
        self.link()
        def report(student_id=None, class_name=None):
            return self.client.get('/api/learning/analysis', params={'student_id': student_id or self.student['id'],
                'subject': 'math', **({'class_name': class_name} if class_name else {})})
        initial = report()
        self.assertEqual(initial.status_code, 200, initial.text)
        self.assertEqual(initial.json()['personal']['patterns'], [])
        self.link(status='CONFIRMED', expected_revision=1)
        first = report().json()
        self.assertEqual(first['personal']['patterns'][0]['assignment_count'], 1)
        self.assertFalse(first['personal']['patterns'][0]['repeated'])
        self.link(status='CONFIRMED', expected_revision=2, quote='更正证据说明')
        second = self.assignment('second', 'blue')
        self.link(second, status='CONFIRMED')
        other = self.client.post('/api/students', json={'name': '测试B', 'class_name': '二班', 'confirm_new': True}).json()['student']
        third = self.assignment('third', 'green', other)
        self.link(third, status='CONFIRMED')
        result = report(class_name='一班').json()
        pattern = result['personal']['patterns'][0]
        self.assertEqual(pattern['assignment_count'], 2)
        self.assertTrue(pattern['repeated'])
        self.assertEqual(len(pattern['evidence']), 2)
        self.assertEqual(result['classroom']['student_count'], 1)
        self.assertEqual(result['classroom']['patterns'][0]['student_count'], 1)
        self.assertEqual(result['classroom']['assignment_count'], 2)
        self.assertIn('不代表长期薄弱', result['notice'])
        english = self.client.get('/api/learning/analysis', params={'student_id': self.student['id'], 'subject': 'english'}).json()
        self.assertEqual(english['personal']['patterns'], [])

    def test_feedback_requires_confirmed_link_approval_and_separate_retest(self):
        self.link()
        payload = {'student_id': self.student['id'], 'subject': 'math', 'assignment_id': self.a['assignment_id'], 'number': '3'}
        failed = self.client.post('/api/learning/feedback', json=payload)
        self.assertEqual(failed.status_code, 422, failed.text)
        self.link(status='CONFIRMED', expected_revision=1)
        generated = self.client.post('/api/learning/feedback', json=payload)
        self.assertEqual(generated.status_code, 200, generated.text)
        draft = generated.json()
        self.assertEqual(draft['status'], 'WAITING_TEACHER')
        self.assertEqual(len(draft['levels']), 3)
        ident = draft['id']
        self.assertEqual(self.client.get(f'/api/learning/practice/{ident}').status_code, 409)
        self.assertEqual(self.client.post('/api/learning/retest', json={**payload, 'feedback_id': ident, 'level': 'A', 'answer': '(-1,-4)，x=-1', 'result': 'CORRECT', 'independent': True, 'request_id': 'rt-1'}).status_code, 409)
        approved = self.client.post('/api/learning/approve', json={**payload, 'feedback_id': ident, 'expected_revision': 1, 'approved': True})
        self.assertEqual(approved.status_code, 200, approved.text)
        practice = self.client.get(f'/api/learning/practice/{ident}', params={'level': 'A'})
        self.assertEqual(practice.status_code, 200, practice.text)
        self.assertIn('y=(x+1)', practice.text)
        self.assertNotIn('(-1,-4)', practice.text)
        self.assertNotIn('答案', practice.text)
        result = self.client.post('/api/learning/retest', json={**payload, 'feedback_id': ident, 'level': 'A', 'answer': '(-1,-4)，x=-1', 'result': 'CORRECT', 'independent': True, 'request_id': 'rt-1'})
        self.assertEqual(result.status_code, 200, result.text)
        repeat = self.client.post('/api/learning/retest', json={**payload, 'feedback_id': ident, 'level': 'A', 'answer': '(-1,-4)，x=-1', 'result': 'CORRECT', 'independent': True, 'request_id': 'rt-1'})
        self.assertEqual(repeat.json()['id'], result.json()['id'])
        read = self.client.get('/api/learning/workspace', params={'student_id': self.student['id'], 'subject': 'math'}).json()
        self.assertEqual(len(read['retests']), 1)
        self.assertEqual(read['assignments'][0]['questions'], ['3'])
        self.assertIn('不代表掌握', result.json()['notice'])

    def test_teacher_correction_changes_current_counts_preserves_receipt_and_history(self):
        self.link(status='CONFIRMED')
        original = (self.root / self.a['relative_path']).read_bytes()
        response = self.client.post('/api/learning/correct', json={'student_id': self.student['id'], 'subject': 'math',
            'assignment_id': self.a['assignment_id'], 'assignment_date': '2026-11-10', 'questions': [],
            'missing_pages': ['第6页未提供'], 'reason': '老师复核第3题实际正确', 'expected_revision': 0})
        self.assertEqual(response.status_code, 200, response.text)
        report = self.client.get('/api/learning/analysis', params={'student_id': self.student['id'], 'subject': 'math'}).json()
        self.assertEqual(report['personal']['patterns'], [])
        read = self.client.get('/api/learning/workspace', params={'student_id': self.student['id'], 'subject': 'math'}).json()
        self.assertEqual(read['assignments'][0]['questions'], [])
        self.assertEqual(read['assignments'][0]['assignment_date'], '2026-11-10')
        self.assertEqual(read['assignments'][0]['original_questions'], ['3'])
        self.assertEqual((self.root / self.a['relative_path']).read_bytes(), original)
        history = self.client.post('/api/intake/query', json={'text': '历史错题', 'student_id': self.student['id'], 'subject': 'math'}).json()
        self.assertEqual(history['confirmed_count'], 0)

    def test_pending_flow_survives_restart(self):
        out = io.BytesIO()
        Image.new('RGB', (20, 20), 'yellow').save(out, 'PNG')
        staged = self.client.post('/api/intake', data={'request_id': 'pending', 'instruction': '学生C数学作业归档，第5题错'}, files={'files': ('p.png', out.getvalue())}).json()
        self.assertEqual(staged['status'], 'NEEDS_STUDENT')
        with TestClient(create_app(archive_root=self.root)) as restarted:
            waiting = restarted.get('/api/operations').json()
            self.assertEqual(waiting['pending'][0]['flow_id'], staged['flow_id'])
            resumed = restarted.post('/api/intake/resolve', json={'flow_id': staged['flow_id'], 'confirm_create': True})
            self.assertEqual(resumed.json()['status'], 'SAVED')

    def test_main_window_save_joins_learning_and_preserves_original(self):
        raw = b'original unreadable photo retained'
        response = self.client.post(f"/api/students/{self.student['id']}/subjects/math/assignments",
            data={'teacher_note': '第5题错', 'assignment_date': '2026-11-09'},
            files={'files': ('work.jpg', raw)})
        self.assertEqual(response.status_code, 200, response.text)
        ident = response.json()['assignment_id']
        workspace = self.client.get('/api/learning/workspace', params={'student_id': self.student['id'], 'subject': 'math'}).json()
        saved = next((a for a in workspace['assignments'] if a['assignment_id'] == ident), None)
        self.assertIsNotNone(saved, 'main-window save must be available for learning')
        self.assertEqual(saved['questions'], ['5'])
        self.assertEqual(saved['assignment_date'], '2026-11-09')
        self.assertEqual(self.link(saved, number='5', status='CONFIRMED').status_code, 200)
        download = self.client.get(f"/api/learning/original/{ident}/{saved['files'][0]['sha256']}")
        self.assertEqual(download.content, raw)
        conflict = self.client.post(f"/api/students/{self.student['id']}/subjects/math/assignments",
            data={'teacher_note': '英语第5题错'}, files={'files': ('different.jpg', b'other original')})
        self.assertEqual(conflict.status_code, 422)

    def test_legacy_continuation_is_explicit_idempotent_and_keeps_pending_provenance(self):
        from backend.archive import ArchiveStore
        legacy = ArchiveStore(self.root).save_task(self.student['id'], 'math', [('legacy.jpg', b'legacy original')], '第5题错')
        before = {str(p.relative_to(self.root)): p.read_bytes() for p in self.root.rglob('*') if p.is_file() and p.suffix != '.sqlite3'}
        scope = {'student_id': self.student['id'], 'subject': 'math'}
        workspace = self.client.get('/api/learning/workspace', params=scope).json()
        self.assertEqual(workspace.get('legacy', [{}])[0].get('assignment_id'), legacy['assignment_id'])
        response = self.client.post('/api/learning/continue-legacy', json={**scope, 'assignment_id': legacy['assignment_id']})
        self.assertEqual(response.status_code, 200, response.text)
        saved = response.json()['receipt']
        self.assertEqual(saved['questions'], [])
        self.assertEqual(saved['candidate_questions'], ['5'])
        self.assertIn('旧手工记录', saved['source'])
        self.assertEqual(self.client.post('/api/learning/continue-legacy', json={**scope, 'assignment_id': legacy['assignment_id']}).json()['receipt'], saved)
        for rel, raw in before.items():
            self.assertEqual((self.root / rel).read_bytes(), raw, rel)
        self.assertEqual(self.client.get(f"/api/learning/original/{saved['assignment_id']}/{saved['files'][0]['sha256']}").content, b'legacy original')
        duplicate = self.client.post('/api/intake', data={'request_id': 'legacy-reupload', 'instruction': '数学归档', 'student_id': self.student['id']}, files={'files': ('other.jpg', b'legacy original')}).json()
        self.assertEqual(duplicate['status'], 'DUPLICATE')
        history = self.client.post('/api/intake/query', json={**scope, 'text': '历史错题'}).json()
        self.assertEqual(history['legacy_count'], 0)
        self.assertEqual(history['confirmed_count'], 1)  # Only the pre-existing first assignment.

    def test_practice_becomes_history_after_link_revision_or_question_revocation(self):
        self.link(status='CONFIRMED')
        scope = {'student_id': self.student['id'], 'subject': 'math', 'assignment_id': self.a['assignment_id'], 'number': '3'}
        feedback = self.client.post('/api/learning/feedback', json=scope).json()
        self.client.post('/api/learning/approve', json={**scope, 'feedback_id': feedback['id'], 'expected_revision': 1, 'approved': True})
        retest = {**scope, 'feedback_id': feedback['id'], 'level': 'A', 'answer': 'first', 'result': 'PENDING', 'independent': False, 'request_id': 'before-change'}
        self.assertEqual(self.client.post('/api/learning/retest', json=retest).status_code, 200)
        self.link(status='CONFIRMED', expected_revision=1, tag='一次函数')
        self.assertEqual(self.client.get(f"/api/learning/practice/{feedback['id']}").status_code, 409)
        self.assertEqual(self.client.post('/api/learning/retest', json={**retest, 'request_id': 'after-change'}).status_code, 409)
        self.assertEqual(self.client.post('/api/learning/retest', json=retest).status_code, 200, 'exact retry preserves past receipt')
        workspace = self.client.get('/api/learning/workspace', params={'student_id': self.student['id'], 'subject': 'math'}).json()
        self.assertFalse(workspace['feedback'][0]['applicable'])
        self.assertEqual(len(workspace['retests']), 1)
        self.link(status='CONFIRMED', expected_revision=2, tag='二次函数顶点式')
        newer = self.client.post('/api/learning/feedback', json=scope).json()
        self.client.post('/api/learning/approve', json={**scope, 'feedback_id': newer['id'], 'expected_revision': 1, 'approved': True})
        self.client.post('/api/learning/correct', json={**{k: v for k, v in scope.items() if k != 'number'}, 'assignment_date': '待补', 'questions': [], 'reason': '题号撤销', 'expected_revision': 0})
        self.assertEqual(self.client.get(f"/api/learning/practice/{newer['id']}").status_code, 409)
        self.assertEqual(self.client.post('/api/learning/feedback', json=scope).status_code, 409)

    def test_class_choices_come_from_archived_subject_scopes_not_current_roster(self):
        student = self.client.post('/api/students', json={'name': '无班级学生', 'confirm_new': True}).json()['student']
        out = io.BytesIO()
        Image.new('RGB', (20, 20), 'purple').save(out, 'PNG')
        staged = self.client.post('/api/intake', data={'request_id': 'class-scope', 'student_id': student['id'], 'instruction': '九年级一班学生无班级学生数学归档，第3题错'}, files={'files': ('p.png', out.getvalue())}).json()
        saved = self.client.post('/api/intake/resolve', json={'flow_id': staged['flow_id'], 'student_id': student['id']}).json()['receipt']
        self.link(saved, status='CONFIRMED')
        result = self.client.get('/api/learning/analysis', params={'student_id': student['id'], 'subject': 'math', 'class_name': '九年级一班'}).json()
        self.assertIn('九年级一班', result.get('class_choices', []))
        self.assertEqual(result['classroom']['assignment_count'], 1)
        self.assertEqual(result['student']['class_name'], '')
        english = self.client.get('/api/learning/analysis', params={'student_id': student['id'], 'subject': 'english'}).json()
        self.assertNotIn('九年级一班', english.get('class_choices', []))
