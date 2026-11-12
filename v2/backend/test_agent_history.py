"""Real local records/tools/MD; only the external model transport is replaced."""
import base64
import hashlib
import io
import json
import tempfile
import unittest
from pathlib import Path

import httpx
from fastapi.testclient import TestClient
from PIL import Image, ImageDraw

from backend.main import create_app


class AgentHistoryTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.requests = []
        self.turn = lambda _: {'content': '本地测试，无真实模型。'}

        def transport(request):
            payload = json.loads(request.content)
            self.requests.append(payload)
            return httpx.Response(200, json={'model': 'synthetic-agent', 'choices': [
                {'message': {'role': 'assistant', **self.turn(payload)}}]})

        self.client = TestClient(create_app(self.root / 'probe.sqlite3', self.root / 'archive',
                                           provider_transport=httpx.MockTransport(transport)))
        self.student = self.client.post('/api/students', json={'name': '合成学生A', 'confirm_new': True}).json()['student']
        self.other = self.client.post('/api/students', json={'name': '合成学生B', 'confirm_new': True}).json()['student']
        self.old = self.assignment('2026-11-01', 'Q3: y=(x+2)^2-1; answer vertex (2,-1)', '3')
        self.new = self.assignment('2026-11-12', 'Q5: y=-(x-2)^2+3; answer vertex (-2,3)', '5')
        self.foreign = self.assignment('2026-11-02', 'OTHER-STUDENT-SECRET', '3', student=self.other)
        self.english = self.assignment('2026-11-03', 'OTHER-SUBJECT-SECRET', '3', subject='english')
        for a, number in [(self.old, '3'), (self.new, '5')]:
            response = self.client.post('/api/learning/link', json={
                'student_id': self.student['id'], 'subject': 'math', 'assignment_id': a['assignment_id'],
                'number': number, 'tag': '二次函数顶点式', 'status': 'CONFIRMED',
                'evidence_hash': a['files'][0]['sha256'], 'page': 1,
                'quote': '第1页第' + number + '题：学生顶点横坐标与括号内符号相同；错因待核实', 'expected_revision': 0})
            self.assertEqual(response.status_code, 200, response.text)
        self.client.post('/api/provider', json={'api_key': 'synthetic-test-key', 'model': 'synthetic-agent'})

    def tearDown(self):
        self.client.close()
        self.temp.cleanup()

    def assignment(self, day, text, number, student=None, subject='math', raw=None, filename='paper.png'):
        if raw is None:
            out = io.BytesIO()
            image = Image.new('RGB', (1000, 200), 'white')
            ImageDraw.Draw(image).text((15, 60), text, fill='black', font_size=26)
            image.save(out, 'PNG')
            raw = out.getvalue()
        response = self.client.post(f"/api/students/{(student or self.student)['id']}/subjects/{subject}/assignments",
            data={'teacher_note': f'第{number}题错', 'assignment_date': day}, files={'files': (filename, raw)})
        self.assertEqual(response.status_code, 200, response.text)
        return response.json()

    @staticmethod
    def call(name, **args):
        return {'id': 'call-' + name, 'type': 'function',
                'function': {'name': name, 'arguments': json.dumps(args, ensure_ascii=False)}}

    def chat(self, **extra):
        return self.client.post('/api/chat', json={'text': '分析这次第5题与以前二次函数错题的联系并保存待确认笔记',
            'student_id': self.student['id'], 'subject': 'math', 'assignment_id': self.new['assignment_id'],
            'allow_history': True, 'allow_originals': True, 'allow_save': True, **extra})

    def sequence(self, calls):
        steps = iter(calls)
        self.turn = lambda _: next(steps)

    def test_two_assignments_are_read_on_demand_and_saved_with_real_evidence(self):
        before = self.client.get('/api/learning/workspace', params={'student_id': self.student['id'], 'subject': 'math'}).json()
        original_hashes = {p: hashlib.sha256(p.read_bytes()).hexdigest() for p in (self.root / 'archive' / 'objects').iterdir()}
        self.sequence([
            {'tool_calls': [self.call('read_assignment', assignment_id=self.new['assignment_id'], number='5'),
                            self.call('search_student_history', query='二次函数')]},
            {'tool_calls': [self.call('read_assignment', assignment_id=self.old['assignment_id'], number='3'),
                            self.call('read_assignment_image', assignment_id=self.new['assignment_id'], sha256=self.new['files'][0]['sha256'])]},
            {'tool_calls': [self.call('save_learning_note', markdown=f"本次第5题与{self.old['assignment_id']}第3题可能有关：顶点式符号。已有教师确认知识点；同一错因仍待核实，历史原图未读取。单次或两次记录均不等于长期薄弱。") ]},
            {'content': '已保存待确认分析；历史Q3与本次Q5有关，错因待核实。'},
        ])
        response = self.chat()
        self.assertEqual(response.status_code, 200, response.text)
        data = response.json()
        self.assertEqual([e['name'] for e in data['tool_events']], ['read_assignment', 'search_student_history', 'read_assignment', 'read_assignment_image', 'save_learning_note'])
        self.assertTrue(all(e['status'] != 'REJECTED' for e in data['tool_events']))
        first_payload = json.dumps(self.requests[0], ensure_ascii=False)
        self.assertNotIn('data:image', first_payload, 'no original photos sent by default')
        second = json.dumps(self.requests[1], ensure_ascii=False)
        self.assertIn(self.old['assignment_id'], second)
        self.assertIn('二次函数顶点式', second)
        self.assertIn('教师确认关联', second)
        self.assertNotIn(self.foreign['assignment_id'], second)
        self.assertNotIn(self.english['assignment_id'], second)
        self.assertNotIn('合成学生A', second)
        images = [part['image_url']['url'] for m in self.requests[2]['messages'] if isinstance(m.get('content'), list)
                  for part in m['content'] if part.get('type') == 'image_url']
        self.assertEqual(len(images), 1)
        Image.open(io.BytesIO(base64.b64decode(images[0].split(',', 1)[1]))).load()
        note = self.root / 'archive' / data['receipts'][0]['relative_path']
        markdown = note.read_text(encoding='utf-8')
        self.assertIn('AI_PENDING_REVIEW', markdown)
        self.assertIn(self.old['assignment_id'], markdown)
        self.assertIn(self.new['files'][0]['sha256'], markdown)
        self.assertIn('实际读取来源', markdown)
        self.assertIn('原图', markdown)
        after = self.client.get('/api/learning/workspace', params={'student_id': self.student['id'], 'subject': 'math'}).json()
        self.assertEqual(before, after, 'Agent must not mutate confirmed learning records')
        self.assertEqual(original_hashes, {p: hashlib.sha256(p.read_bytes()).hexdigest() for p in original_hashes})
        with TestClient(create_app(archive_root=self.root / 'archive')) as restarted:
            self.assertIn(data['receipts'][0]['id'], [n['id'] for n in restarted.get(f"/api/students/{self.student['id']}/subjects/math/agent-notes").json()['notes']])

    def test_scope_and_explicit_permissions_cannot_be_overridden_by_model(self):
        for target in [self.foreign, self.english]:
            with self.subTest(target=target['assignment_id']):
                self.sequence([{'tool_calls': [self.call('read_assignment', assignment_id=target['assignment_id'])]}, {'content': '无权读取'}])
                result = self.chat().json()
                self.assertEqual(result['tool_events'][0]['status'], 'REJECTED')
                self.assertNotIn(target['assignment_id'], self.requests[-1]['messages'][-1]['content'])
        self.sequence([{'tool_calls': [self.call('search_student_history', query='', student_id=self.other['id'])]}, {'content': '拒绝范围覆盖'}])
        self.assertEqual(self.chat().json()['tool_events'][0]['status'], 'REJECTED')
        self.sequence([{'tool_calls': [self.call('read_assignment_image', assignment_id=self.new['assignment_id'], sha256=self.new['files'][0]['sha256'])]}, {'content': '没有原图授权'}])
        self.assertEqual(self.chat(allow_originals=False).json()['tool_events'][0]['status'], 'REJECTED')
        self.assertNotIn('data:image', json.dumps(self.requests[-1]))
        self.sequence([{'tool_calls': [self.call('search_student_history', query='二次函数')]}, {'content': '没有历史授权'}])
        self.assertEqual(self.chat(allow_history=False).json()['tool_events'][0]['status'], 'REJECTED')
        self.assertNotIn('search_student_history', json.dumps(self.requests[-2]['tools']))

    def test_unreadable_and_pdf_are_not_claimed_as_read_images(self):
        for raw, filename in [(b'not a picture', 'broken.jpg'), (b'%PDF-1.4\nunreadable', 'paper.pdf')]:
            a = self.assignment('2026-11-04', '', '6', raw=raw, filename=filename)
            self.sequence([{'tool_calls': [self.call('read_assignment_image', assignment_id=a['assignment_id'], sha256=a['files'][0]['sha256'])]}, {'content': '无法识别，保留待确认'}])
            result = self.chat().json()
            self.assertEqual(result['tool_events'][0]['status'], 'UNREADABLE')
            self.assertNotIn('data:image', json.dumps(self.requests[-1]))
            self.assertIn('未识别', self.requests[-1]['messages'][-1]['content'])

    def test_bad_context_is_rejected_before_provider_request(self):
        response = self.chat(assignment_id=self.foreign['assignment_id'])
        self.assertIn(response.status_code, [404, 422])
        self.assertEqual(self.requests, [])

    def test_effective_corrections_and_candidate_links_keep_their_status(self):
        response = self.client.post('/api/learning/correct', json={'student_id': self.student['id'], 'subject': 'math',
            'assignment_id': self.old['assignment_id'], 'assignment_date': '2026-11-01', 'questions': [],
            'reason': '合成教师撤销旧错题', 'expected_revision': 0})
        self.assertEqual(response.status_code, 200, response.text)
        a = self.assignment('2026-11-10', 'candidate', '7')
        self.client.post('/api/learning/link', json={'student_id': self.student['id'], 'subject': 'math',
            'assignment_id': a['assignment_id'], 'number': '7', 'tag': '顶点候选', 'status': 'CANDIDATE',
            'evidence_hash': a['files'][0]['sha256'], 'page': 1, 'quote': '未确认关联', 'expected_revision': 0})
        self.sequence([{'tool_calls': [self.call('read_assignment', assignment_id=self.old['assignment_id']),
                                       self.call('read_assignment', assignment_id=a['assignment_id'])]}, {'content': '旧错题已撤销，候选仍待核实'}])
        self.assertEqual(self.chat().status_code, 200)
        results = [json.loads(m['content'])['record'] for m in self.requests[-1]['messages'] if m['role'] == 'tool']
        self.assertEqual(results[0]['questions'], [])
        self.assertFalse(results[0]['knowledge_links'][0]['question_current'])
        self.assertEqual(results[1]['knowledge_links'][0]['status'], 'CANDIDATE')

    def test_original_only_grant_cannot_read_history_and_image_budget_is_bounded(self):
        self.sequence([{'tool_calls': [self.call('read_assignment_image', assignment_id=self.old['assignment_id'], sha256=self.old['files'][0]['sha256'])]}, {'content': '历史未授权'}])
        self.assertEqual(self.chat(allow_history=False).json()['tool_events'][0]['status'], 'REJECTED')
        self.sequence([{'tool_calls': [self.call('read_assignment_image', assignment_id=self.new['assignment_id'], sha256=self.new['files'][0]['sha256']) for _ in range(4)]}, {'content': '额度限制'}])
        events = self.chat().json()['tool_events']
        self.assertEqual([e['status'] for e in events], ['READ_IMAGE', 'READ_IMAGE', 'READ_IMAGE', 'REJECTED'])

    def test_search_pagination_and_hash_failure_are_explicit(self):
        for n in range(11):
            self.assignment('2026-11-05', 'page-' + str(n), '8')
        self.sequence([{'tool_calls': [self.call('search_student_history', query='', offset=0),
                                      self.call('search_student_history', query='', offset=10)]}, {'content': '分页完成'}])
        self.assertEqual(self.chat().status_code, 200)
        results = [json.loads(m['content']) for m in self.requests[-1]['messages'] if m['role'] == 'tool']
        self.assertEqual(len(results[0]['records']), 10)
        self.assertEqual(results[0]['next_offset'], 10)
        self.assertEqual(len(results[1]['records']), 3)
        original = self.root / 'archive' / 'objects' / self.new['files'][0]['sha256']
        original.write_bytes(b'corrupt-synthetic-fixture')
        self.sequence([{'tool_calls': [self.call('read_assignment_image', assignment_id=self.new['assignment_id'], sha256=original.name)]}, {'content': '校验失败未识别'}])
        self.assertEqual(self.chat().json()['tool_events'][0]['status'], 'UNREADABLE')


if __name__ == '__main__':
    unittest.main()
