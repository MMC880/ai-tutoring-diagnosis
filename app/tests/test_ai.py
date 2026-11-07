import json
from pathlib import Path
import sys
import tempfile
import unittest
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from store import Store, ValidationError, ConflictError
from test_core import questions
try:
    from ai_service import AIService, HTTPTransport
except ImportError:
    AIService = HTTPTransport = None


class FakeTransport:
    def __init__(self): self.calls=[]; self.response=None; self.failure=None
    def __call__(self, config, key, payload):
        self.calls.append((config, key, payload))
        if self.failure: raise self.failure
        return self.response or {'choices':[{'message':{'content':json.dumps({'questions':[{'id':'Q01','result':'INCORRECT','correct_answer':'(2,3)','knowledge':'顶点式','cause':'符号可能混淆'},{'id':'Q02','result':'CORRECT','correct_answer':'2或3','knowledge':'方程','cause':''}]})},'finish_reason':'stop'}], 'usage':{'prompt_tokens':50,'completion_tokens':20,'total_tokens':70}}


class AIServiceTests(unittest.TestCase):
    def setUp(self):
        self.assertIsNotNone(AIService, 'AI接入模块尚未实现')
        self.tmp=tempfile.TemporaryDirectory(); self.addCleanup(self.tmp.cleanup)
        self.store=Store(self.tmp.name); self.transport=FakeTransport(); self.ai=AIService(self.store, self.transport)
        self.p=self.store.create_paper(dict(student_ref='SECRET-STUDENT-ID', student_name='不可外发姓名',batch_id='SECRET-BATCH',title='不外发档案标题',questions=questions()))
        self.ai.configure(dict(base_url='https://discovery-api.intern-ai.org.cn/v1', model='deepseek-v4.1-flash-1017', api_key='TEST-KEY-NOT-REAL'))

    def prepare(self):
        return self.ai.prepare(dict(paper_id=self.p['id'],version=1,questions=self.p['questions']))

    def test_preparation_never_sends_and_payload_has_no_identity(self):
        job=self.prepare(); payload=json.dumps(job['payload'],ensure_ascii=False)
        for identity in ['不可外发姓名','SECRET-STUDENT-ID','SECRET-BATCH','不外发档案标题',self.p['id'],'TEST-KEY-NOT-REAL']:
            self.assertNotIn(identity,payload)
        self.assertEqual(self.transport.calls,[]); self.assertEqual(self.store.event_count(),0)

    def test_key_is_memory_only_and_not_returned_or_backed_up(self):
        job=self.prepare(); info=self.ai.settings()
        self.assertTrue(info['key_loaded']); self.assertNotIn('TEST-KEY-NOT-REAL',json.dumps(info))
        import zipfile
        b=self.store.backup()
        with zipfile.ZipFile(self.store.backup_path(b['id'])) as z:
            for name in z.namelist(): self.assertNotIn(b'TEST-KEY-NOT-REAL',z.read(name))
        fresh=AIService(self.store,FakeTransport()); self.assertFalse(fresh.settings()['key_loaded'])

    def test_consent_and_key_required(self):
        job=self.prepare()
        with self.assertRaises(ValidationError): self.ai.send(job['id'],False)
        self.ai.clear_key()
        with self.assertRaises(ValidationError): self.ai.send(job['id'],True)
        self.assertEqual(self.transport.calls,[])

    def test_send_retries_same_job_do_not_repeat_network(self):
        job=self.prepare(); a=self.ai.send(job['id'],True); b=self.ai.send(job['id'],True)
        self.assertEqual(a['status'],'SUCCEEDED'); self.assertEqual(b['status'],'SUCCEEDED')
        self.assertEqual(len(self.transport.calls),1); self.assertEqual(self.store.event_count(),0)
        self.assertTrue(a['result']['questions'][0]['cause'].startswith('待核实'))
        self.assertEqual(a['usage']['total_tokens'],70)

    def test_changed_config_or_paper_rejects_old_preview(self):
        job=self.prepare(); self.ai.configure(dict(base_url='https://discovery-api.intern-ai.org.cn/v1',model='other-model'))
        with self.assertRaises(ConflictError): self.ai.send(job['id'],True)
        self.ai.configure(dict(base_url='https://discovery-api.intern-ai.org.cn/v1',model='deepseek-v4.1-flash-1017'))
        q=questions(); q[0]['answer']='新转写'; self.store.save_paper(self.p['id'],dict(version=1,questions=q))
        with self.assertRaises(ConflictError): self.ai.send(job['id'],True)
        self.assertEqual(self.transport.calls,[])

    def test_response_only_becomes_unconfirmed_draft_after_explicit_apply(self):
        self.store.confirm(self.p['id'],1,True)
        job=self.prepare(); self.ai.send(job['id'],True)
        self.assertEqual(self.store.get_paper(self.p['id'])['version'],1)
        out=self.ai.apply(job['id'],True); p=self.store.get_paper(self.p['id'])
        self.assertEqual(p['version'],2); self.assertEqual(p['confirmed_version'],1)
        self.assertEqual(p['questions'][0]['answer'],self.p['questions'][0]['answer'])
        self.assertEqual(self.store.event_count(),2)
        self.ai.apply(job['id'],True); self.assertEqual(self.store.get_paper(self.p['id'])['version'],2)

    def test_stale_result_cannot_overwrite_new_draft(self):
        job=self.prepare(); self.ai.send(job['id'],True)
        q=questions(); q[0]['cause']='老师新核实'; self.store.save_paper(self.p['id'],dict(version=1,questions=q))
        with self.assertRaises(ConflictError): self.ai.apply(job['id'],True)

    def test_malformed_response_not_applied_or_automatically_resent(self):
        self.transport.response={'choices':[{'message':{'content':'不是JSON，也不是审批指令'},'finish_reason':'stop'}]}
        job=self.prepare(); result=self.ai.send(job['id'],True)
        self.assertEqual(result['status'],'INVALID_RESULT'); self.ai.send(job['id'],True)
        self.assertEqual(len(self.transport.calls),1)
        with self.assertRaises(ValidationError): self.ai.apply(job['id'],True)

    def test_timeout_is_unknown_and_not_automatically_retried(self):
        self.transport.failure=TimeoutError('TEST-KEY-NOT-REAL')
        job=self.prepare(); result=self.ai.send(job['id'],True)
        self.assertEqual(result['status'],'UNKNOWN'); self.ai.send(job['id'],True)
        self.assertEqual(len(self.transport.calls),1)
        self.assertNotIn('TEST-KEY-NOT-REAL',json.dumps(result))
        self.assertEqual(result['metadata']['diagnostic']['kind'],'TimeoutError')
        self.assertEqual(result['metadata']['diagnostic']['stage'],'transport')

    def test_wrong_question_ids_and_mastery_labels_rejected(self):
        for content in [{'questions':[{'id':'OTHER','result':'CORRECT'}]},{'questions':[{'id':'Q01','result':'MASTERED'},{'id':'Q02','result':'CORRECT'}]}]:
            self.transport.response={'choices':[{'message':{'content':json.dumps(content)},'finish_reason':'stop'}]}
            result=self.ai.send(self.prepare()['id'],True)
            self.assertEqual(result['status'],'INVALID_RESULT')

    def test_probe_contains_no_student_and_does_not_create_paper_records(self):
        self.transport.response={'choices':[{'message':{'content':'{"ok":true}'},'finish_reason':'stop'}]}
        job=self.ai.prepare(dict(mode='probe'))
        self.assertIsNone(job['paper_id']); self.assertEqual(self.ai.send(job['id'],True)['status'],'SUCCEEDED')
        self.assertEqual(self.store.event_count(),0)

    def test_endpoint_validation_and_no_key_in_url(self):
        for url in ['http://relay.test/v1','https://user:secret@relay.test/v1','https://relay.test/v1?key=secret','https://127.0.0.1/v1','https://relay.test/v1#secret']:
            with self.assertRaises(ValidationError): self.ai.configure(dict(base_url=url,model='model'))

    def test_image_stream_setting_is_explicit_boolean_and_does_not_change_text_requests(self):
        self.assertIs(self.ai.settings().get('image_stream'),False)
        for value in ['true',1,None]:
            with self.subTest(value=value):
                with self.assertRaises(ValidationError): self.ai.configure(dict(base_url='https://discovery-api.intern-ai.org.cn/v1',model='deepseek-v4.1-flash-1017',image_stream=value))
        self.ai.configure(dict(base_url='https://discovery-api.intern-ai.org.cn/v1',model='deepseek-v4.1-flash-1017',image_stream=True))
        self.assertFalse(self.prepare()['payload']['stream'])

    def test_interrupted_stream_usage_is_preserved_without_apply_or_retry(self):
        import ai_stream
        self.transport.failure=ai_stream.IncompleteResponse('STREAM_INTERRUPTED',{'total_tokens':37})
        job=self.prepare(); out=self.ai.send(job['id'],True)
        self.assertEqual(out['status'],'UNKNOWN'); self.assertEqual(out['usage'],{'total_tokens':37})
        self.assertIsNone(out['result']); self.assertEqual(out['metadata']['outcome']['code'],'STREAM_INTERRUPTED')
        self.ai.send(job['id'],True); self.assertEqual(len(self.transport.calls),1)
        self.assertEqual(self.store.event_count(),0)

    def test_interrupted_sending_is_unknown_on_restart(self):
        job=self.prepare()
        with self.store.db() as db: db.execute("UPDATE ai_jobs SET status='SENDING' WHERE id=?",(job['id'],))
        new=AIService(self.store,FakeTransport())
        self.assertEqual(new.get_job(job['id'])['status'],'UNKNOWN')

    def test_historical_response_does_not_include_key_in_job_listing(self):
        self.ai.send(self.prepare()['id'],True)
        self.assertNotIn('TEST-KEY-NOT-REAL',json.dumps(self.ai.jobs()))

    def test_invalid_result_still_keeps_reported_usage(self):
        self.transport.response={'choices':[{'message':{'content':'invalid JSON'},'finish_reason':'stop'}],'usage':{'total_tokens':123}}
        job=self.ai.send(self.prepare()['id'],True)
        self.assertEqual(job['status'],'INVALID_RESULT'); self.assertEqual(job['usage']['total_tokens'],123)

    def test_restore_cannot_make_already_sent_job_look_unsent(self):
        job=self.prepare(); backup=self.store.backup(); self.ai.send(job['id'],True)
        self.store.restore(backup['id'],'RESTORE')
        self.ai.configure(dict(base_url='https://discovery-api.intern-ai.org.cn/v1',model='deepseek-v4.1-flash-1017',api_key='TEST-KEY-NOT-REAL'))
        restored=self.ai.get_job(job['id'])
        self.assertEqual(restored['status'],'UNKNOWN')
        self.ai.send(job['id'],True)
        self.assertEqual(len(self.transport.calls),1)

    def test_latest_backup_carries_send_evidence_to_fresh_directory(self):
        job=self.prepare(); old=self.store.backup(); self.ai.send(job['id'],True); latest=self.store.backup()
        import shutil
        fresh_root=self.store.root/'other-machine-synthetic'; other=Store(fresh_root)
        (fresh_root/'backups').mkdir()
        shutil.copy2(self.store.backup_path(latest['id']),fresh_root/'backups'/latest['id'])
        shutil.copy2(self.store.backup_path(old['id']),fresh_root/'backups'/old['id'])
        other.restore(latest['id'],'RESTORE'); other.restore(old['id'],'RESTORE')
        transport=FakeTransport(); ai=AIService(other,transport)
        ai.configure(dict(base_url='https://discovery-api.intern-ai.org.cn/v1',model='deepseek-v4.1-flash-1017',api_key='FAKE'))
        ai.send(job['id'],True); self.assertEqual(transport.calls,[])

    def test_corrupt_send_ledger_blocks_network(self):
        (self.store.root/'ai-outbound-ledger.jsonl').write_text('truncated-not-json',encoding='utf-8')
        job=self.prepare()
        with self.assertRaises(ValidationError): self.ai.send(job['id'],True)
        self.assertEqual(self.transport.calls,[])

    def test_http_transport_contract_without_external_network(self):
        import io
        from unittest.mock import patch
        captured=[]
        class Opener:
            def open(inner,req,timeout):
                captured.append((req,timeout)); return io.BytesIO(b'{"choices":[]}')
        with patch('ai_service.socket.getaddrinfo',return_value=[(2,1,6,'',('93.184.216.34',443))]),patch('ai_service.urllib.request.build_opener',return_value=Opener()):
            HTTPTransport()(dict(base_url='https://discovery-api.intern-ai.org.cn/v1',model='deepseek-v4.1-flash-1017',max_tokens=4096),'ONLY-FAKE-KEY',{'model':'deepseek-v4.1-flash-1017','messages':[]})
        req,timeout=captured[0]
        self.assertEqual(req.full_url,'https://discovery-api.intern-ai.org.cn/v1/chat/completions')
        self.assertEqual(req.get_header('Authorization'),'Bearer ONLY-FAKE-KEY')
        self.assertEqual(timeout,45); self.assertNotIn('ONLY-FAKE-KEY',req.data.decode())

    def test_private_dns_does_not_send_request(self):
        from unittest.mock import patch
        from ai_service import ProviderFailure
        with patch('ai_service.socket.getaddrinfo',return_value=[(2,1,6,'',('127.0.0.1',443))]),patch('ai_service.urllib.request.build_opener') as build:
            with self.assertRaises(ProviderFailure): HTTPTransport()(dict(DEFAULT_CONFIG), 'FAKE',{})
            build.assert_not_called()

    def test_http_transport_consumes_sse_without_extra_request(self):
        import io
        from unittest.mock import patch
        raw=b'data: {"choices":[{"index":0,"delta":{"content":"{}"},"finish_reason":"stop"}],"usage":{"total_tokens":9}}\n\ndata: [DONE]\n\n'
        class Response(io.BytesIO): headers={'Content-Type':'text/event-stream; charset=utf-8'}
        calls=[]
        class Opener:
            def open(inner,req,timeout): calls.append(json.loads(req.data)); return Response(raw)
        payload={'messages':[],'stream':True,'stream_options':{'include_usage':True}}
        with patch('ai_service.socket.getaddrinfo',return_value=[(2,1,6,'',('93.184.216.34',443))]),patch('ai_service.urllib.request.build_opener',return_value=Opener()):
            body=HTTPTransport()(dict(DEFAULT_CONFIG),'FAKE',payload)
        self.assertEqual(body['choices'][0]['message']['content'],'{}')
        self.assertEqual(body['usage'],{'total_tokens':9}); self.assertEqual(len(calls),1)
        self.assertTrue(calls[0]['stream'])

    def test_candidate_question_type_only_enters_unconfirmed_draft(self):
        data={'questions':[dict(id='Q01',result='INCORRECT',correct_answer='(2,3)',knowledge='顶点式',question_type='由顶点式读顶点',cause='待核实'),dict(id='Q02',result='CORRECT',correct_answer='2或3',knowledge='方程',cause='')]}
        self.transport.response={'choices':[{'message':{'content':json.dumps(data)},'finish_reason':'stop'}]}
        job=self.ai.send(self.prepare()['id'],True)
        self.assertEqual(job['result']['questions'][0].get('question_type'),'由顶点式读顶点')
        self.assertNotIn('question_type',self.store.get_paper(self.p['id'])['questions'][0])
        self.ai.apply(job['id'],True)
        p=self.store.get_paper(self.p['id'])
        self.assertEqual(p['questions'][0]['question_type'],'由顶点式读顶点')
        self.assertEqual(p['confirmed_version'],0);self.assertEqual(self.store.event_count(),0)

    def test_invalid_candidate_type_is_not_applied(self):
        data=json.loads(self.transport(self.ai.settings(),'FAKE',{})['choices'][0]['message']['content'])
        data['questions'][0]['question_type']='型'*201
        self.transport.response={'choices':[{'message':{'content':json.dumps(data)},'finish_reason':'stop'}]}
        self.assertEqual(self.ai.send(self.prepare()['id'],True)['status'],'INVALID_RESULT')


DEFAULT_CONFIG=dict(base_url='https://discovery-api.intern-ai.org.cn/v1',model='deepseek-v4.1-flash-1017',max_tokens=4096)
