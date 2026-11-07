import base64
import io
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from PIL import Image
from files import save_document
from store import Store,ValidationError,ConflictError
from ai_service import AIService
try:
    import vision
except ImportError:
    vision=None


class VisionTests(unittest.TestCase):
    def setUp(self):
        self.assertIsNotNone(vision,'图片处理与转写尚未实现')
        self.tmp=tempfile.TemporaryDirectory(); self.addCleanup(self.tmp.cleanup); self.store=Store(self.tmp.name)
        image=Image.new('RGB',(200,160),'red'); image.paste('blue',(80,40,180,140))
        stream=io.BytesIO(); image.save(stream,format='PNG',pnginfo=None)
        self.doc=save_document(self.store.root,'本地姓名不外发.png',stream.getvalue())
        self.p=self.store.create_paper(dict(student_ref='SECRET-ID',student_name='私有姓名',batch_id='SECRET-BATCH',title='私有标题',documents=[self.doc],questions=[dict(id='Q01',stem='待录入原题',answer='',correct_answer='',knowledge='',cause='',result='PENDING')]))
        self.calls=[]; self.response=None
        self.ai=AIService(self.store,self.transport)
        self.ai.configure(dict(base_url='https://discovery-api.intern-ai.org.cn/v1',model='deepseek-v4.1-flash-1017',api_key='FAKE-NOT-REAL'))

    def transport(self,cfg,key,payload):
        self.calls.append(payload)
        return self.response or {'choices':[{'message':{'content':json.dumps({'code':'384217'})},'finish_reason':'stop'}]}

    def crop_args(self): return dict(document_id=self.doc['id'],crop=[80,40,180,140],masks=[])

    def prove(self):
        with patch('vision.new_probe_code',return_value='384217'):
            job=self.ai.prepare(dict(mode='vision_probe'))
        self.assertEqual(self.ai.send(job['id'],True)['status'],'SUCCEEDED')

    def prepare_photo(self):
        return self.ai.prepare(dict(mode='vision_transcribe',paper_id=self.p['id'],version=self.store.get_paper(self.p['id'])['version'],**self.crop_args()))

    def ocr_response(self,unclear=True):
        data={'image_status':'PARTIAL' if unclear else 'READABLE','questions':[dict(id='Q01',stem='求顶点',answer='(−2,3)',uncertainties=['answer：负号待核对'] if unclear else [])], 'page_notes':[]}
        self.response={'choices':[{'message':{'content':json.dumps(data,ensure_ascii=False)},'finish_reason':'stop'}]}

    def test_crop_and_mask_pixels_are_server_generated(self):
        raw,meta=vision.crop_document(self.store.root,self.doc['id'],[80,40,180,140],[[90,50,110,70]])
        with Image.open(io.BytesIO(raw)) as image:
            self.assertEqual(image.size,(100,100)); self.assertEqual(image.getpixel((15,15)),(255,255,255)); self.assertEqual(image.getpixel((50,50)),(0,0,255))
            self.assertNotIn('exif',image.info)
        self.assertNotIn('本地姓名',json.dumps(meta,ensure_ascii=False))

    def test_crop_limits_and_changed_attachment_rejected(self):
        for rect in [[-1,0,100,100],[0,0,201,160],[0,0,0,20],[True,0,100,100]]:
            with self.assertRaises(ValidationError): vision.crop_document(self.store.root,self.doc['id'],rect,[])
        (self.store.root/'documents'/self.doc['storage_name']).write_bytes(b'changed')
        with self.assertRaises(ValidationError): vision.crop_document(self.store.root,self.doc['id'],[0,0,100,100],[])

    def test_photo_requires_current_session_image_proof(self):
        with self.assertRaises(ValidationError): self.prepare_photo()
        self.prove(); self.assertEqual(self.ai.settings()['vision_status'],'VERIFIED_THIS_SESSION')
        self.ai.clear_key()
        with self.assertRaises(ValidationError): self.prepare_photo()

    def test_probe_challenge_is_not_in_text_and_wrong_answer_does_not_unlock(self):
        with patch('vision.new_probe_code',return_value='384217'):
            job=self.ai.prepare(dict(mode='vision_probe'))
        text=' '.join(part.get('text','') for part in job['payload']['messages'][1]['content'])
        self.assertNotIn('384217',text)
        self.response={'choices':[{'message':{'content':'{"code":"999999"}'},'finish_reason':'stop'}]}
        self.assertEqual(self.ai.send(job['id'],True)['status'],'INVALID_RESULT')
        self.assertEqual(self.ai.settings()['vision_status'],'NOT_VERIFIED')

    def test_photo_only_uses_own_paper_attachment(self):
        self.prove()
        stream=io.BytesIO(); Image.new('RGB',(100,100)).save(stream,format='PNG')
        foreign=save_document(self.store.root,'其他学生.png',stream.getvalue())
        with self.assertRaises(ValidationError): self.ai.prepare(dict(mode='vision_transcribe',paper_id=self.p['id'],version=1,document_id=foreign['id'],crop=[0,0,100,100],masks=[]))

    def test_prepared_image_only_contains_selected_area_no_identity(self):
        self.prove(); job=self.prepare_photo()
        payload=json.dumps(job['payload'],ensure_ascii=False)
        for identity in ['私有姓名','SECRET-ID','SECRET-BATCH','私有标题','本地姓名不外发',self.p['id'],self.doc['id']]: self.assertNotIn(identity,payload)
        url=job['payload']['messages'][1]['content'][1]['image_url']['url']
        with Image.open(io.BytesIO(base64.b64decode(url.split(',')[1]))) as im: self.assertEqual(im.size,(100,100))
        self.assertEqual(len(self.calls),1)

    def test_transcription_preserves_error_and_does_not_grade(self):
        self.prove(); self.ocr_response(); job=self.ai.send(self.prepare_photo()['id'],True)
        self.assertEqual(job['result']['questions'][0]['answer'],'(−2,3)')
        self.assertEqual(job['result']['questions'][0]['result'],'PENDING')
        self.assertEqual(self.store.get_paper(self.p['id'])['questions'][0]['stem'],'待录入原题')
        self.assertEqual(self.store.event_count(),0)

    def test_apply_needs_transcription_ack_and_keeps_original_model_text(self):
        self.prove(); self.ocr_response(); job=self.ai.send(self.prepare_photo()['id'],True)
        revised=job['result']['questions']; revised[0]['answer']='老师核对后仍是(−2,3)'
        with self.assertRaises(ValidationError): self.ai.apply(job['id'],True,questions=revised)
        self.ai.apply(job['id'],True,questions=revised,transcription_ack=True)
        p=self.store.get_paper(self.p['id'])
        self.assertEqual(p['version'],2); self.assertEqual(p['confirmed_version'],0)
        self.assertEqual(p['questions'][0]['answer'],'老师核对后仍是(−2,3)')
        self.assertEqual(self.ai.get_job(job['id'])['result']['questions'][0]['answer'],'(−2,3)')
        with self.store.db() as db: self.assertEqual(db.execute('SELECT count(*) FROM transcription_reviews').fetchone()[0],1)

    def test_unresolved_recognition_cannot_be_counted_wrong_or_sent_for_grading(self):
        self.prove(); self.ocr_response(); job=self.ai.send(self.prepare_photo()['id'],True)
        self.ai.apply(job['id'],True,questions=job['result']['questions'],transcription_ack=True)
        p=self.store.get_paper(self.p['id']); q=p['questions']; q[0]['result']='INCORRECT'
        with self.assertRaises(ValidationError): self.store.save_paper(p['id'],dict(version=2,questions=q))
        with self.assertRaises(ValidationError): self.ai.prepare(dict(paper_id=p['id'],version=2,questions=q))
        q[0]['recognition_resolved']=True; p=self.store.save_paper(p['id'],dict(version=2,questions=q))
        self.assertEqual(self.ai.prepare(dict(paper_id=p['id'],version=p['version'],questions=q))['status'],'PREPARED')

    def test_image_jobs_idempotent_and_stale_apply_rejected(self):
        self.prove(); self.ocr_response(); job=self.prepare_photo(); self.ai.send(job['id'],True); self.ai.send(job['id'],True)
        self.assertEqual(len(self.calls),2)
        p=self.store.get_paper(self.p['id']); q=p['questions']; q[0]['stem']='老师新录入'; self.store.save_paper(p['id'],dict(version=1,questions=q))
        with self.assertRaises(ConflictError): self.ai.apply(job['id'],True,questions=[],transcription_ack=True)

    def test_unreadable_image_cannot_overwrite_existing_paper(self):
        self.prove(); self.response={'choices':[{'message':{'content':'{"image_status":"UNREADABLE","questions":[],"page_notes":["需补拍"]}'},'finish_reason':'stop'}]}
        job=self.ai.send(self.prepare_photo()['id'],True)
        with self.assertRaises(ValidationError): self.ai.apply(job['id'],True,questions=[],transcription_ack=True)
        self.assertEqual(self.store.get_paper(self.p['id'])['version'],1)

    def test_history_listing_does_not_ship_inline_image_payload(self):
        self.prove(); self.prepare_photo()
        self.assertNotIn('data:image',json.dumps(self.ai.jobs()))

    def test_key_change_does_not_allow_reusing_old_probe_success(self):
        with patch('vision.new_probe_code',return_value='384217'): job=self.ai.prepare(dict(mode='vision_probe'))
        self.ai.send(job['id'],True)
        self.ai.configure(dict(base_url='https://discovery-api.intern-ai.org.cn/v1',model='deepseek-v4.1-flash-1017',api_key='ANOTHER-FAKE'))
        self.ai.send(job['id'],True)
        with self.assertRaises(ValidationError): self.prepare_photo()
        self.assertEqual(len(self.calls),1)

    def test_reference_image_cannot_be_mistaken_for_student_work(self):
        self.prove()
        p=self.store.create_paper(dict(student_ref='S-REF',student_name='虚构参考测试',batch_id='B-REF',title='卷',documents=[dict(id=self.doc['id'],role='参考答案')],questions=self.p['questions']))
        with self.assertRaises(ValidationError): self.ai.prepare(dict(mode='vision_transcribe',paper_id=p['id'],version=1,**self.crop_args()))

    def test_exif_orientation_is_normalized_and_metadata_removed(self):
        im=Image.new('RGB',(80,120),'white'); exif=Image.Exif(); exif[274]=6; exif[270]='PRIVATE EXIF COMMENT'
        stream=io.BytesIO(); im.save(stream,format='JPEG',exif=exif)
        doc=save_document(self.store.root,'旋转合成.jpg',stream.getvalue())
        raw=vision.preview_document(self.store.root,doc['id'])
        with Image.open(io.BytesIO(raw)) as normalized:
            self.assertEqual(normalized.size,(120,80)); self.assertFalse(normalized.getexif())
        self.assertNotIn(b'PRIVATE EXIF',raw)

    def test_teacher_can_correct_question_number_without_losing_source_mapping(self):
        self.prove(); self.ocr_response(False); job=self.ai.send(self.prepare_photo()['id'],True)
        revised=job['result']['questions']; revised[0]['source_id']='Q01'; revised[0]['id']='Q05'
        self.ai.apply(job['id'],True,questions=revised,transcription_ack=True)
        self.assertEqual([q['id'] for q in self.store.get_paper(self.p['id'])['questions']],['Q05'])
        review=self.ai.get_job(job['id'])['teacher_transcription']
        self.assertEqual(review[0]['source_ocr_id'],'Q01')

    def test_unknown_placeholder_cannot_be_declared_resolved_and_graded(self):
        q=dict(id='Q01',stem='题目',answer='[不清]',recognition_notes='数字看不清',recognition_resolved=True,result='INCORRECT')
        with self.assertRaises(ValidationError): self.store.save_paper(self.p['id'],dict(version=1,questions=[q]))

    def test_deleting_doubt_text_does_not_resolve_recognition(self):
        self.prove(); self.ocr_response(); job=self.ai.send(self.prepare_photo()['id'],True)
        revised=job['result']['questions']; revised[0]['recognition_notes']=''; revised[0]['recognition_resolved']=False
        self.ai.apply(job['id'],True,questions=revised,transcription_ack=True)
        p=self.store.get_paper(self.p['id'])
        with self.assertRaises(ValidationError): self.ai.prepare(dict(paper_id=p['id'],version=2,questions=p['questions']))
        p['questions'][0]['result']='INCORRECT'
        with self.assertRaises(ValidationError): self.store.save_paper(p['id'],dict(version=2,questions=p['questions']))

    def test_invalid_ocr_keeps_local_diagnostics_but_redacts_session_key(self):
        self.prove()
        self.response={'choices':[{'message':{'content':'not JSON FAKE-NOT-REAL'},'finish_reason':'stop'}]}
        job=self.ai.send(self.prepare_photo()['id'],True)
        self.assertEqual(job['status'],'INVALID_RESULT')
        diagnostic=job['metadata'].get('diagnostic')
        self.assertIsNotNone(diagnostic)
        self.assertIn('not JSON',diagnostic['final_text']); self.assertNotIn('FAKE-NOT-REAL',json.dumps(diagnostic))
        self.assertEqual(diagnostic['kind'],'JSONDecodeError')

    def failed_job(self):
        self.prove(); self.response={'choices':[{'message':{'content':'invalid JSON'},'finish_reason':'stop'}]}
        return self.ai.send(self.prepare_photo()['id'],True)

    def manual_rows(self):
        return [dict(id='Q01',stem='求顶点',answer='(−2,3)',recognition_notes='负号待核对',recognition_resolved=False)]

    def test_manual_fallback_needs_no_key_or_network_and_keeps_failure(self):
        job=self.failed_job(); calls=len(self.calls); self.ai.clear_key()
        out=self.ai.apply_manual_transcription(job['id'],self.manual_rows(),True,True)
        self.assertEqual(out['status'],'INVALID_RESULT'); self.assertEqual(out['transcription_source_method'],'MANUAL_FALLBACK')
        self.assertEqual(len(self.calls),calls); self.assertEqual(out['applied_version'],2)
        p=self.store.get_paper(self.p['id']); self.assertEqual(p['confirmed_version'],0); self.assertEqual(p['questions'][0]['result'],'PENDING')
        self.assertFalse(p['questions'][0]['recognition_resolved']); self.assertEqual(self.store.event_count(),0)

    def test_manual_fallback_requires_explicit_confirmations(self):
        job=self.failed_job()
        for consent,ack in [(False,True),(True,False)]:
            with self.assertRaises(ValidationError): self.ai.apply_manual_transcription(job['id'],self.manual_rows(),consent,ack)
        self.assertEqual(self.store.get_paper(self.p['id'])['version'],1)

    def test_manual_fallback_is_idempotent_and_different_rewrite_conflicts(self):
        job=self.failed_job(); self.ai.apply_manual_transcription(job['id'],self.manual_rows(),True,True)
        self.ai.apply_manual_transcription(job['id'],self.manual_rows(),True,True)
        self.assertEqual(self.store.get_paper(self.p['id'])['version'],2)
        changed=self.manual_rows(); changed[0]['answer']='不同作答'
        with self.assertRaises(ConflictError): self.ai.apply_manual_transcription(job['id'],changed,True,True)

    def test_manual_fallback_cannot_overwrite_a_new_paper_version(self):
        job=self.failed_job(); q=self.store.get_paper(self.p['id'])['questions']; q[0]['stem']='新录入'
        self.store.save_paper(self.p['id'],dict(version=1,questions=q))
        with self.assertRaises(ConflictError): self.ai.apply_manual_transcription(job['id'],self.manual_rows(),True,True)

    def test_manual_fallback_accepts_unknown_but_never_changes_original_usage(self):
        job=self.failed_job()
        with self.store.db() as db: db.execute("UPDATE ai_jobs SET status='UNKNOWN',usage_json=NULL WHERE id=?",(job['id'],))
        out=self.ai.apply_manual_transcription(job['id'],self.manual_rows(),True,True)
        self.assertEqual(out['status'],'UNKNOWN'); self.assertIsNone(out['usage'])

    def test_manual_fallback_backup_keeps_source_and_unresolved_flags(self):
        job=self.failed_job(); self.ai.apply_manual_transcription(job['id'],self.manual_rows(),True,True)
        backup=self.store.backup(); p=self.store.get_paper(self.p['id']); p['questions'][0]['stem']='后续草稿'
        self.store.save_paper(p['id'],dict(version=2,questions=p['questions'])); self.store.restore(backup['id'],'RESTORE')
        restored=self.ai.get_job(job['id'])
        self.assertEqual(restored['status'],'INVALID_RESULT'); self.assertEqual(restored['transcription_source_method'],'MANUAL_FALLBACK')
        self.assertFalse(self.store.get_paper(self.p['id'])['questions'][0]['recognition_resolved'])

    def test_invalid_manual_snapshot_is_rejected_before_restore(self):
        job=self.failed_job(); self.ai.apply_manual_transcription(job['id'],self.manual_rows(),True,True)
        with self.store.db() as db:
            good=db.execute('SELECT teacher_json FROM transcription_reviews').fetchone()[0]
            db.execute("UPDATE transcription_reviews SET teacher_json='{}'")
        backup=self.store.backup()
        with self.store.db() as db: db.execute('UPDATE transcription_reviews SET teacher_json=?',(good,))
        with self.assertRaises(ValidationError): self.store.restore(backup['id'],'RESTORE')
        self.assertEqual(self.ai.get_job(job['id'])['transcription_source_method'],'MANUAL_FALLBACK')

    def test_teacher_export_distinguishes_recognition_doubts_from_wrong_causes(self):
        from exporting import export_content
        job=self.failed_job(); self.ai.apply_manual_transcription(job['id'],self.manual_rows(),True,True)
        _,blocks=export_content(self.store,'paper',self.p['id'],'teacher',2)
        report='\n'.join(text for kind,text in blocks)
        self.assertIn('识别疑点（不是学生错因）',report)
        self.assertIn('负号待核对',report); self.assertIn('待核清',report)

    def test_timeout_outcome_preserves_unknown_usage_and_never_retries(self):
        self.prove(); job=self.prepare_photo(); before=len(self.calls)
        def timeout(cfg,key,payload):
            self.calls.append(payload); raise TimeoutError('read timed out')
        self.ai.transport=timeout
        out=self.ai.send(job['id'],True)
        self.assertEqual(out['status'],'UNKNOWN'); self.assertIsNone(out['usage'])
        self.assertEqual(out['metadata'].get('outcome',{}).get('code'),'RESPONSE_TIMEOUT')
        self.assertIsInstance(out['metadata']['outcome']['elapsed_ms'],int)
        self.assertGreaterEqual(out['metadata']['outcome']['elapsed_ms'],0)
        self.assertIn('分题',out['metadata']['outcome']['next_step'])
        self.ai.send(job['id'],True); self.assertEqual(len(self.calls),before+1)
        self.assertEqual(self.store.event_count(),0)

    def test_non_timeout_transport_error_is_not_described_as_timeout(self):
        self.prove(); job=self.prepare_photo()
        def disconnected(cfg,key,payload): raise ConnectionResetError('reset')
        self.ai.transport=disconnected; out=self.ai.send(job['id'],True)
        self.assertEqual(out['status'],'UNKNOWN')
        self.assertEqual(out['metadata'].get('outcome',{}).get('code'),'CONNECTION_UNCERTAIN')
        self.assertNotIn('超时',out['metadata']['outcome']['summary'])

    def test_wrapped_timeout_has_evidence_based_outcome(self):
        import urllib.error
        self.prove(); job=self.prepare_photo()
        def wrapped(cfg,key,payload): raise urllib.error.URLError(TimeoutError('read timeout'))
        self.ai.transport=wrapped
        self.assertEqual(self.ai.send(job['id'],True)['metadata'].get('outcome',{}).get('code'),'RESPONSE_TIMEOUT')

    def test_truncated_output_is_not_salvaged_and_keeps_reported_usage(self):
        self.prove(); self.ocr_response(False); self.response['choices'][0]['finish_reason']='length'; self.response['usage']={'total_tokens':99}
        out=self.ai.send(self.prepare_photo()['id'],True)
        self.assertEqual(out['status'],'INVALID_RESULT'); self.assertIsNone(out['result']); self.assertEqual(out['usage']['total_tokens'],99)
        self.assertEqual(out['metadata'].get('outcome',{}).get('code'),'OUTPUT_TRUNCATED')
        self.assertEqual(self.store.get_paper(self.p['id'])['version'],1)

    def test_non_json_outcome_does_not_include_provider_text_or_secret(self):
        self.prove(); self.response={'choices':[{'message':{'content':'bad JSON FAKE-NOT-REAL'},'finish_reason':'stop'}]}
        out=self.ai.send(self.prepare_photo()['id'],True); summary=out['metadata'].get('outcome',{})
        self.assertEqual(summary.get('code'),'INVALID_JSON')
        self.assertNotIn('FAKE-NOT-REAL',json.dumps(summary)); self.assertNotIn('bad JSON',json.dumps(summary))

    def test_provider_rejection_records_safe_actionable_summary(self):
        from ai_service import ProviderFailure
        self.prove(); job=self.prepare_photo()
        def rejected(cfg,key,payload): raise ProviderFailure('HTTP_429')
        self.ai.transport=rejected; out=self.ai.send(job['id'],True)
        self.assertEqual(out['status'],'FAILED'); self.assertIsNone(out['usage'])
        self.assertEqual(out['metadata'].get('outcome',{}).get('code'),'PROVIDER_REJECTED')
        self.assertIn('429',out['metadata']['outcome']['summary'])

    def two_question_paper(self):
        p=self.store.get_paper(self.p['id'])
        p=self.store.save_paper(p['id'],dict(version=p['version'],questions=[
            dict(id='Q01',stem='第一题原题',answer='第一题原笔迹',result='PENDING'),
            dict(id='Q02',stem='第二题原题',answer='第二题原笔迹',result='PENDING')]))
        return p

    def target_job(self):
        self.prove(); p=self.two_question_paper()
        return self.ai.prepare(dict(mode='vision_transcribe',paper_id=p['id'],version=p['version'],target_question_id='Q02',**self.crop_args()))

    def test_target_question_must_belong_to_current_paper(self):
        self.prove()
        for target in ['Q99',123,['Q01']]:
            with self.subTest(target=target):
                with self.assertRaises(ValidationError):
                    self.ai.prepare(dict(mode='vision_transcribe',paper_id=self.p['id'],version=1,target_question_id=target,**self.crop_args()))

    def test_target_bound_locally_and_model_id_mismatch_stays_unresolved(self):
        job=self.target_job(); self.ocr_response(False)
        self.assertEqual(job['metadata'].get('target_question_id'),'Q02')
        self.assertNotIn('target_question_id',json.dumps(job['payload']))
        out=self.ai.send(job['id'],True); q=out['result']['questions'][0]
        self.assertEqual(q['id'],'Q01'); self.assertFalse(q['recognition_resolved'])
        self.assertIn('Q02',q['recognition_notes']); self.assertIn('Q01',q['recognition_notes'])
        self.assertEqual(self.store.get_paper(self.p['id'])['version'],2)

    def test_target_rejects_uncorrected_model_question_and_preserves_other_question(self):
        job=self.target_job(); self.ocr_response(False); out=self.ai.send(job['id'],True)
        wrong=out['result']['questions']
        with self.assertRaises(ValidationError): self.ai.apply(job['id'],True,questions=wrong,transcription_ack=True)
        self.assertEqual(self.store.get_paper(self.p['id'])['version'],2)
        corrected=[wrong[0]|dict(id='Q02',source_id='Q01',recognition_resolved=True)]
        self.ai.apply(job['id'],True,questions=corrected,transcription_ack=True)
        p=self.store.get_paper(self.p['id'])
        self.assertEqual(p['questions'][0]['answer'],'第一题原笔迹')
        self.assertEqual(p['questions'][1]['answer'],'(−2,3)'); self.assertEqual(p['version'],3)
        self.assertEqual(self.ai.get_job(job['id'])['teacher_transcription'][0]['source_ocr_id'],'Q01')
        self.assertEqual(self.store.event_count(),0)

    def test_target_mode_rejects_multiple_returned_questions(self):
        job=self.target_job(); self.ocr_response(False)
        result=json.loads(self.response['choices'][0]['message']['content'])
        result['questions'].append(result['questions'][0]|dict(id='Q02'))
        self.response['choices'][0]['message']['content']=json.dumps(result)
        out=self.ai.send(job['id'],True)
        self.assertEqual(out['status'],'INVALID_RESULT'); self.assertIsNone(out['result'])

    def test_target_manual_fallback_cannot_write_other_questions(self):
        job=self.target_job(); self.response={'choices':[{'message':{'content':'bad JSON'},'finish_reason':'stop'}]}
        self.ai.send(job['id'],True); self.ai.clear_key(); before=len(self.calls)
        wrong=self.manual_rows()
        with self.assertRaises(ValidationError): self.ai.apply_manual_transcription(job['id'],wrong,True,True)
        valid=[wrong[0]|dict(id='Q02')]
        with self.assertRaises(ValidationError): self.ai.apply_manual_transcription(job['id'],valid+wrong,True,True)
        self.ai.apply_manual_transcription(job['id'],valid,True,True)
        p=self.store.get_paper(self.p['id']); self.assertEqual(p['questions'][0]['answer'],'第一题原笔迹')
        self.assertEqual(len(self.calls),before); self.assertEqual(p['questions'][1]['id'],'Q02')

    def test_restore_rejects_target_record_bound_to_different_question(self):
        job=self.target_job(); self.response={'choices':[{'message':{'content':'bad JSON'},'finish_reason':'stop'}]}
        self.ai.send(job['id'],True); self.ai.apply_manual_transcription(job['id'],[self.manual_rows()[0]|dict(id='Q02')],True,True)
        with self.store.db() as db:
            good=db.execute('SELECT metadata_json FROM ai_jobs WHERE id=?',(job['id'],)).fetchone()[0]
            changed=json.loads(good); changed['target_question_id']='Q01'
            db.execute('UPDATE ai_jobs SET metadata_json=? WHERE id=?',(json.dumps(changed),job['id']))
        backup=self.store.backup()
        with self.store.db() as db: db.execute('UPDATE ai_jobs SET metadata_json=? WHERE id=?',(good,job['id']))
        with self.assertRaises(ValidationError): self.store.restore(backup['id'],'RESTORE')
        self.assertEqual(self.ai.get_job(job['id'])['metadata']['target_question_id'],'Q02')

    def change_target_in_database(self,job,target):
        with self.store.db() as db:
            original=db.execute('SELECT metadata_json FROM ai_jobs WHERE id=?',(job['id'],)).fetchone()[0]
            metadata=json.loads(original); metadata['target_question_id']=target
            db.execute('UPDATE ai_jobs SET metadata_json=? WHERE id=?',(json.dumps(metadata),job['id']))
        return original

    def test_unapplied_single_question_backup_rejects_nonexistent_target(self):
        job=self.target_job(); self.ocr_response(False); self.ai.send(job['id'],True)
        original=self.change_target_in_database(job,'Q99'); backup=self.store.backup()
        with self.store.db() as db: db.execute('UPDATE ai_jobs SET metadata_json=? WHERE id=?',(original,job['id']))
        with self.assertRaises(ValidationError): self.store.restore(backup['id'],'RESTORE')
        self.assertEqual(self.store.get_paper(self.p['id'])['version'],2)
        self.assertEqual(self.ai.get_job(job['id'])['metadata']['target_question_id'],'Q02')

    def test_applying_single_question_checks_target_is_still_in_paper(self):
        job=self.target_job(); self.ocr_response(False); out=self.ai.send(job['id'],True)
        self.change_target_in_database(job,'Q99')
        corrected=[out['result']['questions'][0]|dict(id='Q99',source_id='Q01',recognition_resolved=True)]
        with self.assertRaises(ValidationError): self.ai.apply(job['id'],True,questions=corrected,transcription_ack=True)
        self.assertEqual([q['id'] for q in self.store.get_paper(self.p['id'])['questions']],['Q01','Q02'])

    def test_manual_single_question_checks_target_is_still_in_paper(self):
        job=self.target_job(); self.response={'choices':[{'message':{'content':'bad JSON'},'finish_reason':'stop'}]}
        self.ai.send(job['id'],True); self.change_target_in_database(job,'Q99')
        with self.assertRaises(ValidationError): self.ai.apply_manual_transcription(job['id'],[self.manual_rows()[0]|dict(id='Q99')],True,True)
        self.assertEqual(self.store.get_paper(self.p['id'])['version'],2)

    def test_historical_target_removed_in_later_draft_can_restore_but_not_apply(self):
        job=self.target_job(); self.ocr_response(False); out=self.ai.send(job['id'],True)
        p=self.store.get_paper(self.p['id']); self.store.save_paper(p['id'],dict(version=p['version'],questions=[p['questions'][0]]))
        backup=self.store.backup(); self.store.restore(backup['id'],'RESTORE')
        corrected=[out['result']['questions'][0]|dict(id='Q02',source_id='Q01',recognition_resolved=True)]
        with self.assertRaises(ConflictError): self.ai.apply(job['id'],True,questions=corrected,transcription_ack=True)
        self.assertEqual(self.ai.get_job(job['id'])['metadata']['target_question_id'],'Q02')

    def checklist_job(self,ids=None):
        self.prove()
        p=self.store.get_paper(self.p['id'])
        return self.ai.prepare(dict(mode='vision_transcribe',paper_id=p['id'],version=p['version'],expected_question_ids=['Q01','Q02'] if ids is None else ids,**self.crop_args()))

    def test_checklist_is_local_and_missing_question_is_explicit(self):
        job=self.checklist_job(); self.ocr_response(False); out=self.ai.send(job['id'],True)
        self.assertEqual(job['metadata'].get('expected_question_ids'),['Q01','Q02'])
        self.assertNotIn('expected_question_ids',json.dumps(job['payload']))
        coverage=out['result'].get('coverage',{})
        self.assertEqual(coverage.get('missing'),['Q02']); self.assertFalse(coverage['complete'])
        self.assertEqual(out['result']['image_status'],'PARTIAL')
        self.ai.apply(job['id'],True,questions=out['result']['questions'],transcription_ack=True)
        p=self.store.get_paper(self.p['id']); q=next(q for q in p['questions'] if q['id']=='Q02')
        self.assertEqual(q['result'],'PENDING'); self.assertEqual(q['answer'],''); self.assertFalse(q['recognition_resolved'])
        self.assertIn('未识别',q['recognition_notes']); self.assertEqual(self.store.event_count(),0)

    def test_missing_existing_answer_is_preserved_but_cannot_be_graded(self):
        self.two_question_paper(); job=self.checklist_job(); self.ocr_response(False); out=self.ai.send(job['id'],True)
        self.ai.apply(job['id'],True,questions=out['result']['questions'],transcription_ack=True)
        p=self.store.get_paper(self.p['id']); q=p['questions'][1]
        self.assertEqual(q['answer'],'第二题原笔迹'); self.assertEqual(q['stem'],'第二题原题')
        self.assertEqual(q['result'],'PENDING'); self.assertFalse(q['recognition_resolved'])
        self.assertIn('此前',q['recognition_notes'])
        q['result']='INCORRECT'
        with self.assertRaises(ValidationError): self.store.save_paper(p['id'],dict(version=p['version'],questions=p['questions']))

    def test_checklist_does_not_modify_unrelated_questions(self):
        p=self.two_question_paper(); other=dict(id='Q03',stem='未涉及的第三题',answer='保留第三题',result='CORRECT')
        self.store.save_paper(p['id'],dict(version=p['version'],questions=p['questions']+[other]))
        before=self.store.get_paper(p['id'])['questions'][2]
        job=self.checklist_job(); self.ocr_response(False); out=self.ai.send(job['id'],True)
        self.ai.apply(job['id'],True,questions=out['result']['questions'],transcription_ack=True)
        self.assertEqual(self.store.get_paper(p['id'])['questions'][2],before)

    def test_read_question_outside_checklist_requires_teacher_correction(self):
        job=self.checklist_job(['Q02']); self.ocr_response(False); out=self.ai.send(job['id'],True)
        q=out['result']['questions'][0]
        self.assertEqual(out['result'].get('coverage',{}).get('unexpected'),['Q01']); self.assertFalse(q['recognition_resolved'])
        with self.assertRaises(ValidationError): self.ai.apply(job['id'],True,questions=[q],transcription_ack=True)
        corrected=[q|dict(id='Q02',source_id='Q01',recognition_resolved=True)]
        self.ai.apply(job['id'],True,questions=corrected,transcription_ack=True)
        p=self.store.get_paper(self.p['id']); self.assertEqual([q['id'] for q in p['questions']],['Q02'])
        self.assertEqual(self.ai.get_job(job['id'])['result']['coverage']['unexpected'],['Q01'])

    def test_no_checklist_does_not_claim_complete_question_coverage(self):
        self.prove(); self.ocr_response(False); out=self.ai.send(self.prepare_photo()['id'],True)
        self.assertIs(out['result'].get('coverage',{}).get('checked'),False)
        self.assertIsNone(out['result']['coverage']['complete'])

    def test_invalid_checklists_and_single_target_combination_are_rejected(self):
        self.prove()
        for ids in ['Q01,Q02',['Q01',' Q01 '],[''],[True],['x'*41],list(map(str,range(101))),None]:
            with self.subTest(ids=ids):
                with self.assertRaises(ValidationError): self.ai.prepare(dict(mode='vision_transcribe',paper_id=self.p['id'],version=1,expected_question_ids=ids,**self.crop_args()))
        with self.assertRaises(ValidationError): self.ai.prepare(dict(mode='vision_transcribe',paper_id=self.p['id'],version=1,expected_question_ids=['Q01'],target_question_id='Q01',**self.crop_args()))

    def test_checklist_manual_fallback_preserves_failure_and_adds_missing_pending(self):
        job=self.checklist_job(); self.response={'choices':[{'message':{'content':'bad JSON'},'finish_reason':'stop'}]}
        self.ai.send(job['id'],True); self.ai.clear_key(); before=len(self.calls)
        with self.assertRaises(ValidationError): self.ai.apply_manual_transcription(job['id'],[self.manual_rows()[0]|dict(id='Q99')],True,True)
        out=self.ai.apply_manual_transcription(job['id'],self.manual_rows(),True,True)
        self.assertEqual(out['status'],'INVALID_RESULT'); self.assertEqual(len(self.calls),before)
        p=self.store.get_paper(self.p['id']); self.assertEqual([q['id'] for q in p['questions']],['Q01','Q02'])
        self.assertFalse(p['questions'][1]['recognition_resolved']); self.assertEqual(p['questions'][1]['result'],'PENDING')

    def test_restore_rejects_invalid_checklist_on_unapplied_job(self):
        job=self.checklist_job()
        with self.store.db() as db:
            original=db.execute('SELECT metadata_json FROM ai_jobs WHERE id=?',(job['id'],)).fetchone()[0]
            metadata=json.loads(original); metadata['expected_question_ids']=['Q01','Q01']
            db.execute('UPDATE ai_jobs SET metadata_json=? WHERE id=?',(json.dumps(metadata),job['id']))
        backup=self.store.backup()
        with self.store.db() as db: db.execute('UPDATE ai_jobs SET metadata_json=? WHERE id=?',(original,job['id']))
        with self.assertRaises(ValidationError): self.store.restore(backup['id'],'RESTORE')

    def test_restore_rejects_saved_transcription_outside_checklist(self):
        job=self.checklist_job(); self.ocr_response(False); out=self.ai.send(job['id'],True)
        self.ai.apply(job['id'],True,questions=out['result']['questions'],transcription_ack=True)
        with self.store.db() as db:
            original=db.execute('SELECT metadata_json FROM ai_jobs WHERE id=?',(job['id'],)).fetchone()[0]
            metadata=json.loads(original); metadata['expected_question_ids']=['Q02']
            db.execute('UPDATE ai_jobs SET metadata_json=? WHERE id=?',(json.dumps(metadata),job['id']))
        backup=self.store.backup()
        with self.store.db() as db: db.execute('UPDATE ai_jobs SET metadata_json=? WHERE id=?',(original,job['id']))
        with self.assertRaises(ValidationError): self.store.restore(backup['id'],'RESTORE')

    def test_stream_setting_changes_image_payload_and_invalidates_old_probe(self):
        self.prove(); job=self.prepare_photo()
        self.ai.configure(dict(base_url='https://discovery-api.intern-ai.org.cn/v1',model='deepseek-v4.1-flash-1017',image_stream=True))
        self.assertEqual(self.ai.settings()['vision_status'],'NOT_VERIFIED')
        with self.assertRaises(ConflictError): self.ai.send(job['id'],True)
        self.prove(); new=self.prepare_photo(); self.assertTrue(new['payload']['stream'])
        self.assertEqual(new['payload']['stream_options'],{'include_usage':True})

    def test_missing_question_keeps_full_length_notes_and_can_repeat(self):
        p=self.two_question_paper(); notes='既有识别证据'*250
        self.assertEqual(len(notes),1500)
        p['questions'][1].update(recognition_notes=notes,recognition_resolved=False)
        self.store.save_paper(p['id'],dict(version=p['version'],questions=p['questions']))
        for _ in range(3):
            self.response=None; job=self.checklist_job(); self.ocr_response(False); out=self.ai.send(job['id'],True)
            self.ai.apply(job['id'],True,questions=out['result']['questions'],transcription_ack=True)
            p=self.store.get_paper(p['id']); q=p['questions'][1]
            self.assertEqual(q['recognition_notes'],notes)
            self.assertIn('未识别',q.get('recognition_notice','')); self.assertFalse(q['recognition_resolved'])
            self.assertEqual(q['answer'],'第二题原笔迹')
        from exporting import export_content
        _,blocks=export_content(self.store,'paper',p['id'],'teacher',p['version'])
        report='\n'.join(text for kind,text in blocks)
        self.assertIn(notes,report); self.assertIn('未识别',report)

    def test_manual_missing_question_also_keeps_full_notes(self):
        p=self.two_question_paper(); p['questions'][1].update(recognition_notes='注'*1500,recognition_resolved=False)
        self.store.save_paper(p['id'],dict(version=p['version'],questions=p['questions']))
        job=self.checklist_job(); self.response={'choices':[{'message':{'content':'bad JSON'},'finish_reason':'stop'}]}
        self.ai.send(job['id'],True); self.ai.apply_manual_transcription(job['id'],self.manual_rows(),True,True)
        q=self.store.get_paper(p['id'])['questions'][1]
        self.assertEqual(q['recognition_notes'],'注'*1500); self.assertIn('未识别',q.get('recognition_notice',''))
