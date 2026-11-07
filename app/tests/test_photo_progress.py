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
from store import Store,ValidationError
from ai_service import AIService
try:
    from photo_progress import photo_progress
except ImportError:photo_progress=None


class PhotoProgressTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.addCleanup(self.tmp.cleanup)
        self.store=Store(self.tmp.name);self.calls=[];self.bad=False
        self.docs=[]
        for color in ['white','yellow','blue']:
            stream=io.BytesIO();Image.new('RGB',(180,160),color).save(stream,format='PNG')
            self.docs.append(save_document(self.store.root,'PRIVATE-NAME-'+color+'.png',stream.getvalue()))
        self.p=self.store.create_paper(dict(student_ref='SYN-P1',student_name='PRIVATE-NAME',batch_id='SYN-P',title='多页',documents=[self.docs[1],self.docs[0],self.docs[2]|{'role':'参考答案'}],questions=[dict(id='Q01',stem='待录入原题',answer='',correct_answer='',knowledge='',cause='',result='PENDING')]))
        self.ai=AIService(self.store,self.transport);self.ai.configure(dict(base_url='https://discovery-api.intern-ai.org.cn/v1',model='deepseek-v4.1-flash-1017',api_key='FAKE-PHOTO-PROGRESS'))
        with patch('vision.new_probe_code',return_value='384217'):job=self.ai.prepare(dict(mode='vision_probe'))
        self.ai.send(job['id'],True)

    def transport(self,cfg,key,payload):
        self.calls.append(payload)
        if len(payload['messages'][0]['content'])<150:content=json.dumps(dict(code='384217'))
        elif self.bad:content='not JSON'
        else:content=json.dumps(dict(image_status='READABLE',questions=[dict(id='Q01',stem='合成题',answer='1',uncertainties=[])],page_notes=[]))
        return dict(choices=[dict(message=dict(content=content),finish_reason='stop')])

    def prepare(self,doc=None,paper=None):
        p=paper or self.store.get_paper(self.p['id'])
        return self.ai.prepare(dict(mode='vision_transcribe',paper_id=p['id'],version=p['version'],document_id=(doc or self.docs[1])['id'],crop=[0,0,180,160],masks=[]))

    def progress(self,p=None):
        self.assertIsNotNone(photo_progress,'逐图状态接口尚未实现')
        return photo_progress(self.store,(p or self.p)['id'])

    def test_only_assignment_images_in_attachment_order_and_nothing_sent(self):
        count=len(self.calls);out=self.progress()
        self.assertEqual([x['document_id'] for x in out['images']],[self.docs[1]['id'],self.docs[0]['id']])
        self.assertEqual(out['images_without_saved_record'],2);self.assertEqual(len(self.calls),count)
        self.assertEqual(self.store.event_count(),0)

    def test_model_returned_is_not_saved_and_payload_not_exposed(self):
        job=self.ai.send(self.prepare()['id'],True);out=self.progress();row=out['images'][0]
        self.assertEqual(row['latest']['id'],job['id']);self.assertEqual(row['latest']['status'],'SUCCEEDED');self.assertIsNone(row['saved'])
        for secret in ['data:image','messages','合成题','FAKE-PHOTO-PROGRESS','PRIVATE-NAME-yellow.png']:
            if secret.startswith('PRIVATE'):continue # Filename is an explicit local-only label.
            self.assertNotIn(secret,json.dumps(out,ensure_ascii=False))

    def test_failed_latest_preserves_older_saved_transcription_as_history(self):
        job=self.ai.send(self.prepare()['id'],True)
        self.ai.apply(job['id'],True,questions=job['result']['questions'],transcription_ack=True)
        self.bad=True;failed=self.ai.send(self.prepare()['id'],True)
        out=self.progress();row=out['images'][0]
        self.assertEqual(row['latest']['id'],failed['id']);self.assertEqual(row['latest']['status'],'INVALID_RESULT')
        self.assertEqual(row['saved']['id'],job['id']);self.assertEqual(row['saved']['applied_version'],2)
        self.assertEqual(row['saved']['source_method'],'MODEL_REVIEW');self.assertEqual(out['images_with_saved_record'],1)
        self.assertEqual(out['confirmed_version'],0)

    def test_manual_fallback_saved_separate_from_original_failure(self):
        self.bad=True;job=self.ai.send(self.prepare()['id'],True)
        q=dict(id='Q01',stem='人工照录',answer='1',recognition_notes='',recognition_resolved=True)
        self.ai.apply_manual_transcription(job['id'],[q],True,True)
        row=self.progress()['images'][0]
        self.assertEqual(row['latest']['status'],'INVALID_RESULT');self.assertEqual(row['saved']['source_method'],'MANUAL_FALLBACK')
        self.assertEqual(self.store.event_count(),0)

    def test_unknown_transcription_method_is_not_called_teacher_saved(self):
        job=self.ai.send(self.prepare()['id'],True)
        self.ai.apply(job['id'],True,questions=job['result']['questions'],transcription_ack=True)
        with self.store.db() as db:
            db.execute('UPDATE transcription_reviews SET teacher_json=? WHERE job_id=?',(json.dumps(dict(source_method='UNRECOGNIZED',questions=job['result']['questions'])),job['id']))
        self.assertIsNone(self.progress()['images'][0]['saved'])

    def test_older_photo_history_not_lost_beyond_global_last30(self):
        job=self.prepare()
        for _ in range(32):self.ai.prepare(dict(mode='probe'))
        self.assertNotIn(job['id'],[j['id'] for j in self.ai.jobs()])
        self.assertEqual(self.progress()['images'][0]['latest']['id'],job['id'])

    def test_other_paper_and_unlinked_metadata_never_guess_image(self):
        other=self.store.create_paper(dict(student_ref='SYN-P2',student_name='其他虚构',batch_id='SYN-P',title='其他卷',documents=[self.docs[1]],questions=self.p['questions']))
        self.prepare(paper=other);bad=self.prepare()
        with self.store.db() as db:db.execute('UPDATE ai_jobs SET metadata_json=? WHERE id=?',('{broken',bad['id']))
        out=self.progress();self.assertEqual(out['unlinked_jobs'],1)
        self.assertTrue(all(row['latest'] is None for row in out['images']))

    def test_read_only_and_missing_paper_and_no_ai_table(self):
        before=self.store.bootstrap();out=self.progress();self.assertEqual(self.store.bootstrap(),before)
        with self.assertRaises(ValidationError):photo_progress(self.store,'0'*32)
        blank=Store(Path(self.tmp.name)/'blank')
        p=blank.create_paper(dict(student_ref='X',student_name='虚构X',batch_id='B',title='无AI表',questions=self.p['questions']))
        self.assertEqual(photo_progress(blank,p['id'])['images'],[])
