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
