import io
import json
from pathlib import Path
import sys
import tempfile
import threading
import unittest
import urllib.request
import urllib.error
import zipfile
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
try:
    from server import make_server
except ModuleNotFoundError:
    make_server = None
from store import Store
from test_core import questions


class HTTPTests(unittest.TestCase):
    def setUp(self):
        self.assertIsNotNone(make_server, '本地服务尚未实现')
        self.tmp = tempfile.TemporaryDirectory(); self.addCleanup(self.tmp.cleanup)
        self.store = Store(self.tmp.name)
        self.server = make_server(self.store, 0)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True); self.thread.start()
        self.base = 'http://127.0.0.1:' + str(self.server.server_address[1])
        self.token = self.server.token
        self.addCleanup(self.close_server)
        self.paper = self.store.create_paper(dict(student_ref='S1', student_name='虚构1', batch_id='B1', title='样例', questions=questions()))

    def close_server(self):
        self.server.shutdown(); self.server.server_close(); self.thread.join()

    def request(self, route, payload=None, headers=None, method=None):
        h = {'X-Jinxue-Token': self.token, 'Content-Type': 'application/json'}
        h.update(headers or {})
        req = urllib.request.Request(self.base + route, data=None if payload is None else json.dumps(payload).encode(), headers=h, method=method)
        try:
            with urllib.request.urlopen(req) as r: return r.status, r.read(), r.headers
        except urllib.error.HTTPError as r:
            return r.code, r.read(), r.headers

    def test_health_and_static_page_without_data_exposure(self):
        self.assertEqual(self.request('/api/health')[0], 200)
        self.assertEqual(self.request('/')[0], 200)
        self.assertEqual(self.request('/records.sqlite3')[0], 404)
        self.assertEqual(self.request('/../store.py')[0], 404)

    def test_cross_origin_and_bad_host_rejected(self):
        self.assertEqual(self.request('/api/bootstrap', headers={'Host': 'attacker.test'})[0], 403)
        self.assertEqual(self.request('/api/bootstrap', headers={'Origin': 'https://attacker.test'})[0], 403)
        self.assertEqual(self.request('/api/backups', {}, {'Sec-Fetch-Site': 'cross-site'})[0], 403)

    def test_writes_require_token_and_json(self):
        self.assertEqual(self.request('/api/backups', {}, {'X-Jinxue-Token': ''})[0], 403)
        self.assertEqual(self.request('/api/backups', {}, {'Content-Type': 'text/plain'})[0], 415)
        self.assertEqual(self.store.event_count(), 0)

    def test_confirmation_requires_consent_and_stale_conflicts(self):
        route = '/api/papers/' + self.paper['id'] + '/confirm'
        self.assertEqual(self.request(route, {'version': 1, 'consent': False})[0], 400)
        self.assertEqual(self.request(route, {'version': 2, 'consent': True})[0], 409)
        self.assertEqual(self.request(route, {'version': 1, 'consent': True})[0], 200)
        self.assertEqual(self.store.event_count(), 2)

    def exercise(self):
        self.store.confirm(self.paper['id'], 1, True)
        return self.store.create_exercise(dict(paper_id=self.paper['id'], question_id='Q01', level='基础巩固', stem='求 y=(x+1)²−4 的顶点', answer='(-1,-4)', explanation='先令括号为零'))

    def test_student_export_requires_approval_and_no_answer(self):
        e = self.exercise()
        route = '/api/export/exercise/' + e['id'] + '.docx?audience=student&version=1'
        self.assertEqual(self.request(route)[0], 400)
        self.store.approve_exercise(e['id'], 1, True)
        status, data, headers = self.request(route)
        self.assertEqual(status, 200)
        with zipfile.ZipFile(io.BytesIO(data)) as z:
            xml = z.read('word/document.xml').decode()
            self.assertIn('11906', xml); self.assertIn('16838', xml)
            self.assertIn('oMath', xml)
            self.assertNotIn('(-1,-4)', xml); self.assertNotIn('先令括号为零', xml)
        self.assertEqual(self.request(route.replace('version=1', 'version=2'))[0], 409)

    def test_print_view_is_a4_and_escaped(self):
        e = self.exercise(); self.store.approve_exercise(e['id'], 1, True)
        status, data, _ = self.request('/print/exercise/' + e['id'] + '?audience=student&version=1')
        self.assertEqual(status, 200); self.assertIn('@page', data.decode()); self.assertNotIn('(-1,-4)', data.decode())

    def test_oversize_and_unknown_routes(self):
        self.assertEqual(self.request('/api/restore', {'id': '../escape.zip', 'confirmation': 'RESTORE'})[0], 400)
        self.assertEqual(self.request('/api/files/../../../store.py')[0], 404)
        self.assertEqual(self.request('/api/unknown', {})[0], 404)

    def test_backup_is_local_download(self):
        status, data, _ = self.request('/api/backups', {})
        self.assertEqual(status, 200)
        ident = json.loads(data)['id']
        status, data, _ = self.request('/api/backups/' + ident)
        self.assertEqual(status, 200)
        with zipfile.ZipFile(io.BytesIO(data)) as z: self.assertIn('database.sqlite3', z.namelist())

    def test_ai_settings_do_not_expose_key_and_preview_does_not_call(self):
        from test_ai import FakeTransport
        self.server.ai.transport = FakeTransport()
        code, body, _ = self.request('/api/ai/settings',dict(base_url='https://discovery-api.intern-ai.org.cn/v1',model='deepseek-v4.1-flash-1017',api_key='FAKE-NOT-REAL'))
        self.assertEqual(code,200); self.assertNotIn(b'FAKE-NOT-REAL',body)
        code, body, _ = self.request('/api/ai/prepare',dict(paper_id=self.paper['id'],version=1,questions=self.paper['questions']))
        self.assertEqual(code,200); self.assertEqual(self.server.ai.transport.calls,[])
        ident=json.loads(body)['id']
        self.assertEqual(self.request('/api/ai/jobs/'+ident+'/send',dict(consent=False))[0],400)
        self.assertEqual(self.request('/api/ai/jobs/'+ident+'/send',dict(consent=True))[0],200)
        self.assertEqual(self.store.event_count(),0)

    def test_old_approved_exercise_export_and_versions_route(self):
        e=self.exercise(); self.store.approve_exercise(e['id'],1,True)
        self.store.update_exercise(e['id'],dict(version=1,level='综合运用',stem='新题',answer='新答案',explanation='新讲解'))
        code,body,_=self.request('/api/exercises/'+e['id']+'/versions')
        self.assertEqual(code,200); self.assertEqual(len(json.loads(body)),2)
        code,data,_=self.request('/api/export/exercise/'+e['id']+'.docx?audience=student&version=1')
        self.assertEqual(code,200)
        with zipfile.ZipFile(io.BytesIO(data)) as z: self.assertNotIn('新题',z.read('word/document.xml').decode())

    def test_image_preview_only_accepts_this_papers_assignment(self):
        from files import save_document
        from PIL import Image
        raw=io.BytesIO(); Image.new('RGB',(80,60),'white').save(raw,format='PNG')
        doc=save_document(self.store.root,'合成.png',raw.getvalue())
        p=self.store.create_paper(dict(student_ref='S2',student_name='虚构2',batch_id='B2',title='图',questions=questions(),documents=[doc]))
        route='/api/papers/'+p['id']+'/image/'+doc['id']
        code,body,headers=self.request(route)
        self.assertEqual(code,200); self.assertTrue(body.startswith(b'\x89PNG'))
        self.assertEqual(self.request(route.replace(p['id'],self.paper['id']))[0],400)

    def test_image_probe_routes_and_explicit_transcription_ack(self):
        import vision
        from unittest.mock import patch
        from test_ai import FakeTransport
        self.server.ai.transport=FakeTransport()
        self.request('/api/ai/settings',dict(base_url='https://discovery-api.intern-ai.org.cn/v1',model='deepseek-v4.1-flash-1017',api_key='FAKE'))
        with patch('vision.new_probe_code',return_value='384217'):
            code,data,_=self.request('/api/ai/prepare',dict(mode='vision_probe'))
        self.assertEqual(code,200); job=json.loads(data)
        self.server.ai.transport.response={'choices':[{'message':{'content':'{"code":"384217"}'},'finish_reason':'stop'}]}
        code,data,_=self.request('/api/ai/jobs/'+job['id']+'/send',dict(consent=True))
        self.assertEqual(json.loads(data)['status'],'SUCCEEDED')
        self.assertEqual(self.request('/api/ai/settings')[1].decode().count('VERIFIED_THIS_SESSION'),1)

    def test_manual_transcription_route_requires_ack_and_never_sends(self):
        from test_ai import FakeTransport
        from files import save_document
        from PIL import Image
        from unittest.mock import patch
        raw=io.BytesIO(); Image.new('RGB',(100,100),'white').save(raw,format='PNG')
        doc=save_document(self.store.root,'合成.png',raw.getvalue())
        p=self.store.create_paper(dict(student_ref='MANUAL-S1',student_name='人工兜底虚构学生',batch_id='MANUAL-B1',title='图',documents=[doc],questions=[dict(id='Q01',stem='待录入原题',result='PENDING')]))
        fake=FakeTransport(); self.server.ai.transport=fake
        self.request('/api/ai/settings',dict(base_url='https://discovery-api.intern-ai.org.cn/v1',model='deepseek-v4.1-flash-1017',api_key='FAKE'))
        with patch('vision.new_probe_code',return_value='384217'): probe=self.server.ai.prepare(dict(mode='vision_probe'))
        fake.response={'choices':[{'message':{'content':'{"code":"384217"}'},'finish_reason':'stop'}]}; self.server.ai.send(probe['id'],True)
        fake.response={'choices':[{'message':{'content':'bad JSON'},'finish_reason':'stop'}]}
        job=self.server.ai.prepare(dict(mode='vision_transcribe',paper_id=p['id'],version=1,document_id=doc['id'],crop=[0,0,100,100],masks=[])); self.server.ai.send(job['id'],True)
        self.server.ai.clear_key(); calls=len(fake.calls)
        route='/api/ai/jobs/'+job['id']+'/manual-transcription'
        payload=dict(questions=[dict(id='Q01',stem='人工原题',answer='人工原作答',recognition_notes='',recognition_resolved=True)],consent=True,transcription_ack=False)
        self.assertEqual(self.request(route,payload)[0],400)
        payload['transcription_ack']=True; code,body,_=self.request(route,payload)
        self.assertEqual(code,200); self.assertEqual(json.loads(body)['status'],'INVALID_RESULT'); self.assertEqual(len(fake.calls),calls)
        self.assertEqual(self.store.get_paper(self.paper['id'])['version'],1)


if __name__ == '__main__': unittest.main()
