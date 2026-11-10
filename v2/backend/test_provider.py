import base64
import io
import json
import tempfile
import unittest
from pathlib import Path

import httpx
from fastapi.testclient import TestClient
from PIL import Image

from backend.main import create_app


class ProviderTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.requests = []
        self.responses = []

        def handle(request):
            self.requests.append(json.loads(request.content) if request.content else {})
            return self.responses.pop(0)

        self.client = TestClient(create_app(self.root / 'probe.sqlite3', self.root / 'archive',
                                           provider_transport=httpx.MockTransport(handle)))

    def tearDown(self):
        self.client.close()
        self.temp.cleanup()

    def configure(self):
        response = self.client.post('/api/provider', json={
            'base_url': 'https://discovery-api.intern-ai.org.cn/v1',
            'model': 'deepseek-v4.1-flash-1017', 'api_key': 'test-only-secret',
        })
        self.assertEqual(response.status_code, 200)
        self.assertNotIn('test-only-secret', response.text)

    def answer(self, text='', calls=None):
        return httpx.Response(200, json={'model': 'deepseek-v4.1-flash-1017', 'choices': [{
            'message': {'role': 'assistant', 'content': text, 'tool_calls': calls or []}}], 'usage': {'total_tokens': 12}})

    def test_configuration_is_memory_only_and_failure_is_not_success(self):
        self.configure()
        self.responses.append(self.answer('晋学智辅连接成功。'))
        self.assertEqual(self.client.post('/api/provider/test').json()['status'], 'PASS')
        self.responses.append(httpx.Response(401, json={'error': 'test-only-secret'}))
        failure = self.client.post('/api/provider/test')
        self.assertEqual(failure.status_code, 502)
        self.assertNotIn('test-only-secret', failure.text)
        self.assertNotEqual(self.client.get('/api/provider').json()['connection'], 'PASS')
        self.assertFalse(any('test-only-secret' in p.read_text(errors='ignore')
                             for p in self.root.rglob('*') if p.is_file()))

    def test_real_payload_contains_image_skill_and_multiturn(self):
        self.configure()
        png = io.BytesIO()
        Image.new('RGB', (20, 15), 'white').save(png, 'PNG')
        self.responses.append(self.answer('图片已读，候选问题待教师核实'))
        result = self.client.post('/api/chat', json={'text': '请看图片', 'images': [
            'data:image/jpeg;base64,' + base64.b64encode(png.getvalue()).decode()],
            'history': [{'role': 'user', 'text': '只用初中方法'}, {'role': 'assistant', 'text': '好的'}]})
        self.assertEqual(result.status_code, 200)
        self.assertEqual(result.json()['mode'], 'provider')
        payload = self.requests[0]
        self.assertIn('单次错误', payload['messages'][0]['content'])
        self.assertEqual(payload['messages'][1]['content'], '只用初中方法')
        self.assertTrue(payload['messages'][-1]['content'][1]['image_url']['url'].startswith('data:image/png;base64,'))

    def test_tool_save_is_scoped_pending_and_readable_after_restart(self):
        self.configure()
        student = self.client.post('/api/students', json={'name': '虚构同学甲', 'confirm_new': True}).json()['student']
        call = {'id': 'call-1', 'type': 'function', 'function': {'name': 'save_learning_note',
                'arguments': json.dumps({'markdown': '第3题：一次函数斜率和截距，待教师核实。'})}}
        self.responses.extend([self.answer(calls=[call]), self.answer('已按工具回执保存待确认笔记。')])
        response = self.client.post('/api/chat', json={'text': '第3题错，分析并保存',
            'student_id': student['id'], 'subject': 'math', 'allow_save': True})
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data['receipts'][0]['status'], 'SAVED_PENDING')
        path = self.root / 'archive' / data['receipts'][0]['relative_path']
        self.assertTrue(path.is_file())
        self.assertIn('AI待确认', path.read_text(encoding='utf-8'))
        self.assertNotIn('虚构同学甲', json.dumps(self.requests, ensure_ascii=False))
        second = TestClient(create_app(self.root / 'other.sqlite3', self.root / 'archive'))
        try:
            readback = second.get('/api/students/' + student['id'] + '/subjects/math/agent-notes')
            self.assertEqual(readback.json()['notes'][0]['id'], data['receipts'][0]['id'])
        finally:
            second.close()

    def test_tool_cannot_save_without_permission_or_use_supplied_path(self):
        self.configure()
        student = self.client.post('/api/students', json={'name': '虚构甲', 'confirm_new': True}).json()['student']
        call = {'id': 'bad-1', 'type': 'function', 'function': {'name': 'save_learning_note',
            'arguments': json.dumps({'markdown': '不能写', 'path': '../../outside.md'})}}
        self.responses.extend([self.answer(calls=[call]), self.answer('未保存')])
        result = self.client.post('/api/chat', json={'text': '分析', 'student_id': student['id'], 'subject': 'math'})
        self.assertEqual(result.status_code, 200)
        self.assertEqual(result.json()['receipts'], [])
        self.assertEqual(list(self.root.rglob('agent-*.md')), [])
        self.assertNotIn('save_learning_note', json.dumps(self.requests[0].get('tools', [])))

    def test_empty_or_malformed_provider_response_is_not_success(self):
        self.configure()
        self.responses.append(httpx.Response(200, json={'choices': []}))
        result = self.client.post('/api/chat', json={'text': '测试'})
        self.assertEqual(result.status_code, 502)
        self.assertNotIn('本地模拟', result.text)

    def test_remote_image_url_and_private_base_are_rejected(self):
        self.assertEqual(self.client.post('/api/provider', json={'base_url': 'http://127.0.0.1:80',
            'model': 'test', 'api_key': 'test-only-secret'}).status_code, 422)
        self.configure()
        self.assertEqual(self.client.post('/api/chat', json={'text': '分析',
            'images': ['https://example.com/image.jpg']}).status_code, 422)
        self.assertEqual(len(self.requests), 0)

    def test_invalid_config_never_echoes_submitted_credential(self):
        secret = 'test-secret-' * 400
        response = self.client.post('/api/provider', json={'api_key': secret})
        self.assertEqual(response.status_code, 422)
        self.assertNotIn(secret, response.text)

    def test_malformed_tool_call_and_oversize_reply_fail_closed(self):
        self.configure()
        self.responses.append(self.answer(calls=['malformed']))
        self.assertEqual(self.client.post('/api/chat', json={'text': '测试工具'}).status_code, 502)
        self.responses.append(self.answer('a' * (2 * 1024 * 1024)))
        self.assertEqual(self.client.post('/api/chat', json={'text': '测试回复'}).status_code, 502)

    def test_read_tool_only_sees_explicitly_imported_summary(self):
        self.configure()
        student = self.client.post('/api/students', json={'name': '虚构同学乙', 'confirm_new': True}).json()['student']
        call = {'id': 'read-1', 'type': 'function', 'function': {'name': 'read_selected_summary', 'arguments': '{}'}}
        self.responses.extend([self.answer(calls=[call]), self.answer('未导入摘要')])
        response = self.client.post('/api/chat', json={'text': '读取', 'student_id': student['id']})
        self.assertEqual(response.status_code, 200)
        tool_result = json.loads(self.requests[-1]['messages'][-1]['content'])
        self.assertEqual(tool_result['markdown'], '本次未主动导入历史摘要')

    def test_authorized_tool_rejects_path_and_deduplicates_one_run(self):
        self.configure()
        student = self.client.post('/api/students', json={'name': '虚构丙', 'confirm_new': True}).json()['student']
        def call(ident, arguments):
            return {'id': ident, 'type': 'function', 'function': {'name': 'save_learning_note',
                    'arguments': json.dumps(arguments)}}
        self.responses.extend([self.answer(calls=[call('bad', {'markdown': 'abc', 'path': '../outside.md'})]),
                               self.answer('未保存')])
        payload = {'text': '保存候选分析', 'student_id': student['id'], 'allow_save': True}
        rejected = self.client.post('/api/chat', json=payload).json()
        self.assertEqual(rejected['tool_events'][0]['status'], 'REJECTED')
        self.assertEqual(list(self.root.rglob('agent-*.md')), [])
        self.responses.extend([self.answer(calls=[call('one', {'markdown': '候选分析'}),
                                                  call('two', {'markdown': '同次重复调用'})]), self.answer('完成')])
        saved = self.client.post('/api/chat', json=payload).json()
        self.assertEqual(len(saved['receipts']), 1)
        self.assertEqual(len(list(self.root.rglob('agent-*.md'))), 1)

    def test_rate_limit_is_visible_without_simulation_fallback(self):
        self.configure()
        self.responses.append(httpx.Response(429, json={'error': 'test-only-secret'}))
        response = self.client.post('/api/chat', json={'text': '测试'})
        self.assertEqual(response.status_code, 502)
        self.assertIn('429', response.text)
        self.assertIn('未自动重试', response.text)
        self.assertNotIn('test-only-secret', response.text)


if __name__ == '__main__':
    unittest.main()
