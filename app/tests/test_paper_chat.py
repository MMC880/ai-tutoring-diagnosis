"""Offline paper-chat boundaries, using only synthetic records and transport."""
import base64
import io
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from PIL import Image, PngImagePlugin
from ai_service import AIService
from files import save_document
from server import Handler
from store import Store, ValidationError, ConflictError


class PaperChatTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(); self.addCleanup(self.tmp.cleanup)
        self.store = Store(self.tmp.name); self.calls = []; self.answer = '先核对负号，再代入验证。'
        self.ai = AIService(self.store, self.transport)
        self.cfg = dict(base_url='https://discovery-api.intern-ai.org.cn/v1', model='synthetic-model')
        self.ai.configure(self.cfg | dict(api_key='SYNTHETIC-SECRET-KEY'))
        self.paper = self.make_paper()

    def make_paper(self, student='PRIVATE-STUDENT-ID', batch='PRIVATE-BATCH', documents=None):
        return self.store.create_paper(dict(student_ref=student, student_name=student+'姓名', batch_id=batch,
            title='PRIVATE-TITLE', documents=documents or [], questions=[dict(id='Q01', stem='求 x：x+1=3', answer='x=4',
            correct_answer='x=2', result='PENDING'), dict(id='Q02', stem='未勾选的私有题目', answer='不得外发', result='PENDING')]))

    def transport(self, cfg, key, payload):
        self.calls.append(payload)
        return {'choices':[{'message':{'content':self.answer}, 'finish_reason':'stop'}], 'usage':{'total_tokens':20}}

    def args(self, **extra):
        return dict(mode='paper_chat', message='为什么第一步不对？', sources=[dict(paper_id=self.paper['id'], version=1,
            question_ids=['Q01'])], images=[]) | extra

    def prepare(self, **extra): return self.ai.prepare(self.args(**extra))

    def image(self):
        raw=io.BytesIO(); info=PngImagePlugin.PngInfo(); info.add_text('Author','PRIVATE-IMAGE-NAME')
        Image.new('RGB',(100,80),'red').save(raw,format='PNG',pnginfo=info)
        return save_document(self.store.root, 'private-image.png', raw.getvalue())

    def prove(self):
        with patch('vision.new_probe_code',return_value='012345'):
            probe=self.ai.prepare(dict(mode='vision_probe'))
        old=self.answer; self.answer='{"code":"012345"}'
        self.assertEqual(self.ai.send(probe['id'],True)['status'],'SUCCEEDED'); self.answer=old

    def test_prepare_exact_selected_material_without_identity_or_send(self):
        job=self.prepare(); payload=json.dumps(job['payload'],ensure_ascii=False)
        for secret in ['PRIVATE-STUDENT-ID','PRIVATE-BATCH','PRIVATE-TITLE',self.paper['id'],self.paper['student_id'],
                       '未勾选的私有题目','不得外发','SYNTHETIC-SECRET-KEY']:
            self.assertNotIn(secret,payload)
        for expected in ['求 x','x=4','x=2','为什么第一步']: self.assertIn(expected,payload)
        self.assertIsNone(job['paper_id']); self.assertEqual(self.calls,[])
        self.assertEqual(job['metadata']['sources'][0]['question_ids'],['Q01'])
        self.assertEqual(job['metadata']['sources'][0]['version'],1)

    def test_plain_text_result_never_applies_or_archives_and_duplicate_does_not_resend(self):
        job=self.prepare(); done=self.ai.send(job['id'],True)
        self.assertEqual(done['status'],'SUCCEEDED'); self.assertEqual(done['result'],dict(answer=self.answer))
        self.ai.send(job['id'],True); self.assertEqual(len(self.calls),1)
        with self.assertRaises(ValidationError): self.ai.apply(job['id'],True)
        self.assertEqual(self.store.get_paper(self.paper['id'])['version'],1); self.assertEqual(self.store.event_count(),0)

    def test_all_sources_require_current_integer_version_and_same_student(self):
        other=self.make_paper(student='OTHER',batch='other')
        sources=self.args()['sources']+[dict(paper_id=other['id'],version=1,question_ids=['Q01'])]
        with self.assertRaises(ValidationError): self.prepare(sources=sources)
        for version in [0,True,'1']:
            with self.assertRaises(ValidationError): self.prepare(sources=[dict(paper_id=self.paper['id'],version=version,question_ids=['Q01'])])
        self.assertEqual(self.calls,[])

    def test_bounded_sources_and_valid_unique_question_ids(self):
        entry=self.args()['sources'][0]
        for sources in [[entry]*4,[entry,entry],[entry|dict(question_ids=['NO'])],[entry|dict(question_ids=['Q01','Q01'])],[]]:
            with self.subTest(sources=sources):
                with self.assertRaises(ValidationError): self.prepare(sources=sources)
        with self.assertRaises(ValidationError): self.prepare(message=' ')
        with self.assertRaises(ValidationError): self.prepare(message='x'*8001)

    def test_send_checks_every_source_version_and_retains_prepared_job(self):
        second=self.make_paper(batch='second')
        sources=self.args()['sources']+[dict(paper_id=second['id'],version=1,question_ids=['Q01'])]
        job=self.prepare(sources=sources)
        second['questions'][0]['answer']='已修改的作答'
        self.store.save_paper(second['id'],dict(version=1,questions=second['questions']))
        with self.assertRaises(ConflictError): self.ai.send(job['id'],True)
        self.assertEqual(self.calls,[]); self.assertEqual(self.ai.get_job(job['id'])['status'],'PREPARED')

    def test_send_requires_consent_key_and_unchanged_configuration(self):
        job=self.prepare()
        with self.assertRaises(ValidationError): self.ai.send(job['id'],False)
        self.ai.clear_key()
        with self.assertRaises(ValidationError): self.ai.send(job['id'],True)
        self.ai.configure(self.cfg|dict(model='other',api_key='SYNTHETIC-SECRET-KEY'))
        with self.assertRaises(ConflictError): self.ai.send(job['id'],True)
        self.assertEqual(self.calls,[])

    def test_history_only_succeeded_chat_with_same_material_scope(self):
        first=self.ai.send(self.prepare()['id'],True)
        next_job=self.prepare(message='再解释一次',previous_job_id=first['id'])
        messages=next_job['payload']['messages']
        self.assertTrue(any(m['role']=='assistant' and m['content']==self.answer for m in messages))
        self.assertEqual(messages[-1]['role'],'user')
        for previous in [self.prepare()['id'],self.ai.prepare(dict(mode='probe'))['id']]:
            with self.assertRaises(ValidationError): self.prepare(previous_job_id=previous)
        with self.assertRaises(ConflictError): self.prepare(previous_job_id=first['id'],sources=[self.args()['sources'][0]|dict(question_ids=['Q02'])])

    def test_history_is_bounded_and_new_chat_has_no_previous_answer(self):
        previous=None
        for i in range(7):
            job=self.prepare(message='历史问题'+str(i),**({'previous_job_id':previous} if previous else {}))
            previous=self.ai.send(job['id'],True)['id']
        job=self.prepare(previous_job_id=previous)
        self.assertLessEqual(sum(m['role']=='assistant' for m in job['payload']['messages']),3)
        self.assertNotIn('历史问题0',json.dumps(job['payload'],ensure_ascii=False))
        self.assertFalse(any(m['role']=='assistant' for m in self.prepare()['payload']['messages']))

    def test_long_previous_answer_is_explicitly_excerpted_in_history(self):
        self.answer='previous-answer-'+'x'*30000
        previous=self.ai.send(self.prepare()['id'],True)
        job=self.prepare(previous_job_id=previous['id'])
        answers=[m['content'] for m in job['payload']['messages'] if m['role']=='assistant']
        self.assertEqual(len(answers),1); self.assertTrue(answers[0].startswith('previous-answer-'))
        self.assertIn('历史回答节选',answers[0]); self.assertLess(len(answers[0]),24000)
        self.assertEqual(self.ai.get_job(previous['id'])['result']['answer'],self.answer)

    def test_response_secret_is_never_persisted_in_result_or_diagnostic(self):
        job=self.prepare(); self.answer='回显 SYNTHETIC-SECRET-KEY'
        done=self.ai.send(job['id'],True)
        self.assertEqual(done['status'],'INVALID_RESULT'); self.assertIsNone(done['result'])
        self.assertNotIn('SYNTHETIC-SECRET-KEY',json.dumps(done))
        with self.store.db() as db:
            raw=dict(db.execute('SELECT * FROM ai_jobs WHERE id=?',(job['id'],)).fetchone())
        self.assertNotIn('SYNTHETIC-SECRET-KEY',json.dumps(raw))

    def test_images_need_current_vision_proof_and_server_normalization(self):
        doc=self.image(); images=[dict(document_id=doc['id'],crop=[10,10,90,70],masks=[[20,20,40,40]])]
        with self.assertRaises(ValidationError): self.prepare(images=images)
        self.prove(); job=self.prepare(images=images)
        content=job['payload']['messages'][-1]['content']; url=next(p['image_url']['url'] for p in content if p['type']=='image_url')
        with Image.open(io.BytesIO(base64.b64decode(url.split(',')[1]))) as image:
            self.assertEqual(image.size,(80,60)); self.assertEqual(image.getpixel((15,15)),(255,255,255)); self.assertFalse(image.info)
        self.assertNotIn(doc['id'],json.dumps(job['payload'])); self.assertNotIn('PRIVATE-IMAGE-NAME',json.dumps(job['payload']))
        self.ai.configure(self.cfg|dict(api_key='REPLACED-KEY'))
        with self.assertRaises(ValidationError): self.ai.send(job['id'],True)

    def test_image_only_optional_crop_and_bounded_images(self):
        doc=self.image(); self.prove()
        job=self.prepare(sources=[],images=[dict(document_id=doc['id'],masks=[])])
        self.assertEqual(job['metadata']['images'][0]['crop'],[0,0,100,80])
        with self.assertRaises(ValidationError): self.prepare(images=[dict(document_id=doc['id'])]*4)
        with self.assertRaises(ValidationError): self.prepare(images=[dict(document_id=doc['id'])]*2)

    def test_images_reject_foreign_student_and_material_change_before_send(self):
        foreign=self.image(); self.make_paper(student='OTHER',batch='foreign',documents=[foreign]); self.prove()
        with self.assertRaises(ValidationError): self.prepare(images=[dict(document_id=foreign['id'])])
        doc=self.image(); job=self.prepare(images=[dict(document_id=doc['id'])])
        (self.store.root/'documents'/doc['storage_name']).write_bytes(b'changed')
        with self.assertRaises(ValidationError): self.ai.send(job['id'],True)
        self.assertEqual(len(self.calls),1)

    def test_newly_attached_other_student_image_invalidates_preview(self):
        doc=self.image(); self.prove(); job=self.prepare(images=[dict(document_id=doc['id'])])
        self.make_paper(student='OTHER',batch='new-owner',documents=[doc])
        with self.assertRaises(ValidationError): self.ai.send(job['id'],True)

    def test_realistic_image_size_uses_image_payload_budget_and_scope_is_canonical(self):
        raw=io.BytesIO(); Image.effect_noise((600,600),100).convert('RGB').save(raw,format='PNG')
        doc=save_document(self.store.root,'synthetic-noise.png',raw.getvalue()); self.prove()
        first=self.ai.send(self.prepare(images=[dict(document_id=doc['id'])])['id'],True)
        self.assertGreater(len(json.dumps(first['payload'])),64*1024)
        again=self.prepare(images=[dict(document_id=doc['id'],crop=[0,0,600,600],masks=[])],previous_job_id=first['id'])
        self.assertEqual(first['metadata']['scope_hash'],again['metadata']['scope_hash'])

    def test_empty_truncated_or_escaped_secret_answer_is_rejected_without_resend(self):
        for answer,reason in [('  ','stop'),('partial','length'),('\\u0053YNTHETIC-SECRET-KEY','stop')]:
            with self.subTest(reason=reason,answer=answer):
                job=self.prepare()
                with patch.object(self.ai,'transport',return_value={'choices':[{'message':{'content':answer},'finish_reason':reason}]}) as send:
                    done=self.ai.send(job['id'],True); self.ai.send(job['id'],True)
                self.assertEqual(done['status'],'INVALID_RESULT'); self.assertIsNone(done['result']); send.assert_called_once()
                self.assertNotIn('SYNTHETIC-SECRET-KEY',json.dumps(done))

    def test_recovered_prepared_chat_keeps_outbound_ledger_guard(self):
        job=self.prepare()
        import outbound_ledger
        outbound_ledger.append(self.store.root,dict(job_id=job['id'],config_hash='0'*64,at=job['created_at']))
        done=self.ai.send(job['id'],True)
        self.assertEqual(done['status'],'UNKNOWN'); self.assertEqual(self.calls,[])

    def test_markdown_export_safe_local_refs_and_no_base64(self):
        doc=self.image(); self.prove(); job=self.ai.send(self.prepare(images=[dict(document_id=doc['id'])])['id'],True)
        text=self.ai.chat_markdown(job['id'])
        for expected in [self.answer,self.cfg['model'],job['created_at'],self.paper['id'],doc['id'],'为什么第一步']:
            self.assertIn(expected,text)
        for forbidden in ['base64','SYNTHETIC-SECRET-KEY','PRIVATE-STUDENT-ID','PRIVATE-TITLE']:
            self.assertNotIn(forbidden,text)
        with self.assertRaises(ValidationError): self.ai.chat_markdown(self.ai.prepare(dict(mode='probe'))['id'])

    def test_markdown_get_route_returns_download_with_fixed_english_name(self):
        job=self.ai.send(self.prepare()['id'],True)
        class FakeHandler:
            server=type('Server',(),{'ai':self.ai})()
            sent=None
            def send(inner,*args): inner.sent=args
        handler=FakeHandler(); Handler.get(handler,'/api/ai/jobs/'+job['id']+'/markdown',{})
        self.assertEqual(handler.sent[0],200); self.assertEqual(handler.sent[2],'text/markdown; charset=utf-8')
        self.assertEqual(handler.sent[3],'chat-'+job['id']+'.md')


if __name__=='__main__': unittest.main()
