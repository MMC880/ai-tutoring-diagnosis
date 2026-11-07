import sys,tempfile,unittest,json
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from store import Store

class LearningJourneyTests(unittest.TestCase):
    def setUp(self):
        folder=Path(__file__).resolve().parents[1]/'.qa-temp';folder.mkdir(exist_ok=True)
        self.tmp=tempfile.TemporaryDirectory(dir=folder);self.addCleanup(self.tmp.cleanup);self.store=Store(self.tmp.name)
        self.p=self.paper('A');self.e=self.exercise(self.p)
    def paper(self,s):
        p=self.store.create_paper(dict(student_ref=s,batch_id='SYN-B',title='合成卷',questions=[dict(id='Q01',stem='求顶点',answer='(-2,3)',knowledge='顶点式',result='INCORRECT')]))
        self.store.confirm(p['id'],1,True);return p
    def exercise(self,p):return self.store.create_exercise(dict(paper_id=p['id'],question_id='Q01',level='基础巩固',stem='求新抛物线顶点',answer='(1,2)',explanation='教师讲解：令括号为零'))
    def journey(self):return self.store.profile('A')['learning_journeys'][0]
    def retest(self,condition='独立完成',result='CORRECT',request='SYN-RT',version=1,answer='(1,2)'):
        return self.store.record_retest(dict(exercise_id=self.e['id'],version=version,answer=answer,condition=condition,result=result,request_id=request,consent=True))
    def test_new_exercise_keeps_exact_original_confirmation(self):
        j=self.journey();self.assertEqual(j['source']['revision'],1);self.assertEqual(j['source']['question']['answer'],'(-2,3)')
        self.assertEqual(j['observation'],'WAITING_APPROVAL')
    def test_revised_original_does_not_rewrite_exercise_source(self):
        q=self.p['questions'];q[0].update(answer='(2,3)',result='CORRECT')
        p=self.store.save_paper(self.p['id'],dict(version=1,questions=q));self.store.confirm(p['id'],p['version'],True)
        j=self.journey();self.assertEqual(j['source']['result'],'INCORRECT');self.assertTrue(j['source_has_later_confirmation'])
    def test_one_independent_correct_is_observation_not_mastery(self):
        self.store.approve_exercise(self.e['id'],1,True);self.retest()
        j=self.journey();self.assertEqual(j['observation'],'INDEPENDENT_CORRECT_OBSERVE');self.assertEqual(j['retests'][0]['exercise_snapshot']['stem'],self.e['stem'])
        self.assertEqual(self.store.profile('A')['archive_summary']['counts']['INCORRECT'],1)
    def test_hinted_and_unclear_are_not_independent_success(self):
        self.store.approve_exercise(self.e['id'],1,True)
        self.retest('有提示完成',request='SYN-1');self.assertEqual(self.journey()['observation'],'NEEDS_INDEPENDENT_RETEST')
        self.retest('完成条件待核实',request='SYN-2');self.assertEqual(self.journey()['observation'],'CONDITION_UNCONFIRMED')
    def test_missing_pending_and_blank_do_not_become_success(self):
        self.store.approve_exercise(self.e['id'],1,True)
        for i,result in enumerate(['MISSING','PENDING','CORRECT']):
            self.retest(result=result,request='SYN-'+str(i),answer='' if result=='CORRECT' else '材料待补')
            self.assertEqual(self.journey()['observation'],'RETEST_UNRESOLVED')
    def test_old_approved_version_late_retest_preserves_actual_question(self):
        self.store.approve_exercise(self.e['id'],1,True)
        self.store.update_exercise(self.e['id'],dict(version=1,level='基础巩固',stem='新题面V2',answer='2',explanation='新讲解'))
        self.retest();j=self.journey();self.assertTrue(j['current_draft']);self.assertEqual(j['retests'][0]['exercise_snapshot']['stem'],self.e['stem']);self.assertEqual(j['exercise']['stem'],'新题面V2')
    def test_student_isolation_and_duplicate_retest(self):
        other=self.paper('B');self.exercise(other);self.store.approve_exercise(self.e['id'],1,True);self.retest();self.retest()
        self.assertEqual(len(self.store.profile('A')['learning_journeys']),1);self.assertEqual(len(self.journey()['retests']),1)
        self.assertEqual(self.store.profile('B')['learning_journeys'][0]['retests'],[])
    def test_legacy_source_not_inferred_and_backup_roundtrip(self):
        with self.store.db() as db:db.execute('DELETE FROM exercise_origins WHERE exercise_id=?',(self.e['id'],))
        self.assertIsNone(self.journey()['source'])
        backup=self.store.backup();self.store.restore(backup['id'],'RESTORE');self.assertIsNone(self.journey()['source'])
    def test_original_link_cannot_cross_student_on_restore(self):
        from learning_journey import validate_restored
        from store import ValidationError
        self.paper('B');other=self.store.profile('B')['events'][0]
        with self.store.db() as db:
            db.execute('UPDATE exercise_origins SET source_event_id=? WHERE exercise_id=?',(other['id'],self.e['id']))
            with self.assertRaises(ValidationError):validate_restored(db)
    def test_exact_original_survives_backup_with_old_version_retest(self):
        self.store.approve_exercise(self.e['id'],1,True);self.retest()
        backup=self.store.backup();self.store.restore(backup['id'],'RESTORE')
        self.assertEqual(self.journey()['source']['revision'],1)
        self.assertEqual(self.journey()['retests'][0]['exercise_snapshot']['source_event_id'],self.journey()['source']['id'])
    def test_restore_rejects_exercise_version_with_other_student(self):
        import learning_journey
        from store import ValidationError
        self.store.approve_exercise(self.e['id'],1,True);other=self.paper('B')
        with self.store.db() as db:
            body=json.loads(db.execute('SELECT body_json FROM exercise_versions WHERE exercise_id=? AND version=1',(self.e['id'],)).fetchone()[0]);body['student_id']=other['student_id']
            db.execute('UPDATE exercise_versions SET body_json=? WHERE exercise_id=? AND version=1',(json.dumps(body),self.e['id']))
            with self.assertRaises(ValidationError):learning_journey.validate_restored(db)
