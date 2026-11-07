import copy
import json
from pathlib import Path
import sqlite3
import sys
import tempfile
import unittest
from concurrent.futures import ThreadPoolExecutor
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from store import Store,ValidationError,ConflictError
from ai_service import AIService
from tutoring_fixture import candidate_result


class TutoringTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.addCleanup(self.tmp.cleanup)
        self.store=Store(self.tmp.name);self.calls=[];self.response=candidate_result()
        self.ai=AIService(self.store,self.transport)
        self.ai.configure(dict(base_url='https://discovery-api.intern-ai.org.cn/v1',model='deepseek-v4.1-flash-1017',api_key='FAKE-TUTOR-KEY'))
        self.p=self.store.create_paper(dict(student_ref='PRIVATE-ID',student_name='PRIVATE-NAME',batch_id='PRIVATE-BATCH',title='PRIVATE-TITLE',questions=[
            dict(id='Q03',stem='求y=-(x-2)²+3的顶点和对称轴',answer='(-2,3)，x=-2',correct_answer='(2,3)，x=2',knowledge='二次函数·顶点式',question_type='顶点式读数',cause='待核实',result='INCORRECT')]))

    def transport(self,cfg,key,payload):
        self.calls.append(payload)
        return {'choices':[{'message':{'content':json.dumps(self.response,ensure_ascii=False)},'finish_reason':'stop'}],'usage':{'total_tokens':20}}

    def confirm(self):self.store.confirm(self.p['id'],self.store.get_paper(self.p['id'])['version'],True)

    def prepare(self,version=1):
        return self.ai.prepare(dict(mode='tutoring_generate',paper_id=self.p['id'],version=version,question_id='Q03'))

    def ready(self):
        self.confirm();return self.ai.send(self.prepare()['id'],True)

    def apply(self,job,level='基础巩固',consent=True):return self.ai.apply_tutoring(job['id'],level,consent)

    def draft(self,job,level='基础巩固'):
        return self.ai.get_job(job['id'])['metadata']['practice_drafts'][level]['exercise_id']

    def test_prepare_sends_nothing_and_payload_is_one_deidentified_question(self):
        self.confirm();job=self.prepare()
        body=json.dumps(job['payload'],ensure_ascii=False)
        for private in ['PRIVATE-ID','PRIVATE-NAME','PRIVATE-BATCH','PRIVATE-TITLE',self.p['id'],'FAKE-TUTOR-KEY']:
            self.assertNotIn(private,body)
        self.assertEqual(len(json.loads(job['payload']['messages'][1]['content'])['source']),8)
        self.assertEqual(self.calls,[]);self.assertEqual(self.store.bootstrap()['exercises'],[])
        self.assertEqual(job['metadata']['source_snapshot'],self.store.get_paper(self.p['id'])['questions'][0])

    def test_unconfirmed_source_is_rejected(self):
        with self.assertRaises(ValidationError):self.prepare()

    def test_correct_pending_and_missing_are_not_tutoring_error_sources(self):
        for state in ['CORRECT','PENDING','MISSING']:
            with self.subTest(state=state):
                p=self.store.get_paper(self.p['id']);p['questions'][0]['result']=state
                p=self.store.save_paper(p['id'],dict(version=p['version'],questions=p['questions']));self.confirm()
                with self.assertRaises(ValidationError):self.prepare(p['version'])

    def test_stale_source_version_is_rejected(self):
        self.confirm();p=self.store.get_paper(self.p['id']);p['questions'][0]['cause']='新备注'
        self.store.save_paper(p['id'],dict(version=1,questions=p['questions']));self.confirm()
        with self.assertRaises(ConflictError):self.prepare(1)

    def test_return_is_candidate_not_approved_or_automatic_draft(self):
        self.response['status']='APPROVED';self.response['verified']=True
        job=self.ready()
        self.assertEqual(job['status'],'SUCCEEDED')
        self.assertEqual(job['result']['verification_status'],'TEACHER_REVIEW_REQUIRED')
        self.assertEqual(len(job['result']['lesson']),6);self.assertEqual(len(job['result']['exercises']),3)
        self.assertEqual(self.store.bootstrap()['exercises'],[]);self.assertEqual(self.store.event_count(),1)

    def test_echoed_session_key_is_never_persisted_even_as_json_escapes(self):
        self.confirm()
        for escaped in [False,True]:
            with self.subTest(escaped=escaped):
                result=candidate_result();result['lesson']['review']='FAKE-TUTOR-KEY'
                content=json.dumps(result,ensure_ascii=False)
                encoded=''.join('\\u%04x'%ord(c) for c in 'FAKE-TUTOR-KEY')
                if escaped:content=content.replace('FAKE-TUTOR-KEY',encoded)
                self.ai.transport=lambda *args:dict(choices=[dict(message=dict(content=content),finish_reason='stop')],usage=dict(total_tokens=20))
                job=self.ai.send(self.prepare()['id'],True)
                self.assertEqual(job['status'],'INVALID_RESULT')
                self.assertEqual(job['usage']['total_tokens'],20)
                saved=json.dumps(job,ensure_ascii=False)
                self.assertNotIn('FAKE-TUTOR-KEY',saved);self.assertNotIn(encoded,saved)
                self.assertEqual(self.store.bootstrap()['exercises'],[])

    def test_diagnostic_omits_escaped_key_on_truncated_or_malformed_response(self):
        self.confirm()
        encoded=''.join('\\u%04x'%ord(c) for c in 'FAKE-TUTOR-KEY')
        for finish,malformed in [('length',False),('stop',True)]:
            with self.subTest(finish=finish,malformed=malformed):
                result=candidate_result();result['lesson']['review']='FAKE-TUTOR-KEY'
                content=json.dumps(result,ensure_ascii=False).replace('FAKE-TUTOR-KEY',encoded)
                if malformed:content=content[:-1]
                self.ai.transport=lambda *args:dict(choices=[dict(message=dict(content=content),finish_reason=finish)],usage=dict(total_tokens=20))
                job=self.ai.send(self.prepare()['id'],True)
                self.assertEqual(job['status'],'INVALID_RESULT')
                self.assertEqual(job['usage']['total_tokens'],20)
                diagnostic=job['metadata']['diagnostic']['final_text']
                self.assertNotIn(encoded,diagnostic)
                self.assertNotIn('FAKE-TUTOR-KEY',diagnostic)
                self.assertIsNone(job['result'])

    def test_missing_steps_duplicate_levels_and_empty_answers_are_invalid(self):
        self.confirm()
        bad=[];a=candidate_result();del a['lesson']['review'];bad.append(a)
        a=candidate_result();a['exercises'][1]['level']='基础巩固';bad.append(a)
        a=candidate_result();a['exercises'][0]['answer']='';bad.append(a)
        a=candidate_result();a['exercises'][1]['stem']=a['exercises'][0]['stem'];bad.append(a)
        for value in bad:
            self.response=value
            out=self.ai.send(self.prepare()['id'],True)
            self.assertEqual(out['status'],'INVALID_RESULT');self.assertEqual(out['usage']['total_tokens'],20)
        self.assertEqual(self.store.bootstrap()['exercises'],[])

    def test_explicit_selection_only_creates_draft_and_is_idempotent(self):
        job=self.ready()
        with self.assertRaises(ValidationError):self.apply(job,consent=False)
        with self.assertRaises(ValidationError):self.apply(job,level='任意难度')
        self.apply(job);self.apply(job)
        e=self.store.get_exercise(self.draft(job))
        self.assertEqual(e['paper_id'],self.p['id']);self.assertEqual(e['question_id'],'Q03')
        self.assertEqual(e['status'],'DRAFT');self.assertEqual(len(self.store.bootstrap()['exercises']),1)
        self.assertIn('知识点归纳',e['explanation']);self.assertEqual(self.store.event_count(),1)

    def test_each_other_level_requires_separate_apply(self):
        job=self.ready();self.apply(job);self.apply(job,'综合运用')
        self.assertEqual(len(self.store.bootstrap()['exercises']),2)
        self.assertTrue(all(e['status']=='DRAFT' for e in self.store.bootstrap()['exercises']))

    def test_repeat_does_not_overwrite_teacher_revision(self):
        job=self.ready();self.apply(job);ident=self.draft(job)
        e=self.store.get_exercise(ident)
        self.store.update_exercise(ident,dict(version=1,level=e['level'],stem='教师修订新题',answer='教师新答案',explanation='教师新说明'))
        self.apply(job)
        self.assertEqual(self.store.get_exercise(ident)['stem'],'教师修订新题');self.assertEqual(len(self.store.bootstrap()['exercises']),1)

    def test_source_change_blocks_new_level_but_repeat_is_read_only(self):
        job=self.ready();self.apply(job);p=self.store.get_paper(self.p['id']);p['questions'][0]['result']='CORRECT'
        self.store.save_paper(p['id'],dict(version=1,questions=p['questions']));self.confirm()
        self.apply(job)
        with self.assertRaises(ConflictError):self.apply(job,'综合运用')
        self.assertEqual(len(self.store.bootstrap()['exercises']),1)

    def test_exercise_and_job_mapping_roll_back_together(self):
        job=self.ready()
        with self.store.db() as db:db.execute("CREATE TRIGGER fail_tutor BEFORE UPDATE OF metadata_json ON ai_jobs BEGIN SELECT RAISE(ABORT,'synthetic failure'); END")
        with self.assertRaises(sqlite3.DatabaseError):self.apply(job)
        self.assertEqual(self.store.bootstrap()['exercises'],[])
        self.assertFalse(self.ai.get_job(job['id'])['metadata'].get('practice_drafts'))
        with self.store.db() as db:db.execute('DROP TRIGGER fail_tutor')
        self.apply(job);self.assertEqual(len(self.store.bootstrap()['exercises']),1)

    def test_concurrent_same_level_creates_one_draft(self):
        job=self.ready()
        with ThreadPoolExecutor(max_workers=2) as pool:list(pool.map(lambda _:self.apply(job),range(2)))
        self.assertEqual(len(self.store.bootstrap()['exercises']),1)

    def test_regular_apply_cannot_put_tutoring_content_into_paper(self):
        job=self.ready()
        with self.assertRaises(ValidationError):self.ai.apply(job['id'],True)
        self.assertEqual(self.store.get_paper(self.p['id'])['version'],1)

    def test_student_export_requires_approval_and_excludes_teacher_material(self):
        from exporting import export_content
        job=self.ready();self.apply(job);ident=self.draft(job)
        with self.assertRaises(ValidationError):export_content(self.store,'exercise',ident,'student',1)
        self.store.approve_exercise(ident,1,True)
        _,blocks=export_content(self.store,'exercise',ident,'student',1);text='\n'.join(v for _,v in blocks)
        self.assertNotIn('教师核对答案',text);self.assertNotIn(candidate_result()['lesson']['review'],text)
        self.assertIn(candidate_result()['exercises'][0]['stem'],text)

    def test_restore_preserves_legitimate_teacher_edit_and_mapping(self):
        job=self.ready();self.apply(job);ident=self.draft(job);e=self.store.get_exercise(ident)
        self.store.approve_exercise(ident,1,True)
        self.store.update_exercise(ident,dict(version=1,level='综合运用',stem='教师新题面',answer='新答案',explanation='新说明'))
        backup=self.store.backup();self.store.restore(backup['id'],'RESTORE')
        self.assertEqual(self.store.get_exercise(ident)['version'],2);self.assertEqual(self.draft(job),ident)

    def test_restore_rejects_mapping_to_missing_exercise(self):
        job=self.ready();self.apply(job)
        with self.store.db() as db:
            original=db.execute('SELECT metadata_json FROM ai_jobs WHERE id=?',(job['id'],)).fetchone()[0]
            meta=json.loads(original);meta['practice_drafts']['基础巩固']['exercise_id']='0'*32
            db.execute('UPDATE ai_jobs SET metadata_json=? WHERE id=?',(json.dumps(meta),job['id']))
        backup=self.store.backup()
        with self.store.db() as db:db.execute('UPDATE ai_jobs SET metadata_json=? WHERE id=?',(original,job['id']))
        with self.assertRaises(ValidationError):self.store.restore(backup['id'],'RESTORE')
        self.assertEqual(len(self.store.bootstrap()['exercises']),1)

    def test_restore_rejects_unapplied_job_with_wrong_source_snapshot(self):
        job=self.ready()
        with self.store.db() as db:
            original=db.execute('SELECT metadata_json FROM ai_jobs WHERE id=?',(job['id'],)).fetchone()[0]
            meta=json.loads(original);meta['source_snapshot']['answer']='不属于确认的内容'
            db.execute('UPDATE ai_jobs SET metadata_json=? WHERE id=?',(json.dumps(meta),job['id']))
        backup=self.store.backup()
        with self.store.db() as db:db.execute('UPDATE ai_jobs SET metadata_json=? WHERE id=?',(original,job['id']))
        with self.assertRaises(ValidationError):self.store.restore(backup['id'],'RESTORE')
