"""The queue is one read-only row per exercise, never a due-date diagnosis."""
import json
from pathlib import Path
import sys,tempfile,unittest
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from store import Store
try:
    from practice_queue import practice_queue_overview
except ModuleNotFoundError:
    practice_queue_overview=None


class PracticeQueueTests(unittest.TestCase):
    def setUp(self):
        self.assertIsNotNone(practice_queue_overview,'补练复测待办清单尚未实现')
        root=Path(__file__).resolve().parents[1]/'.qa-temp';root.mkdir(exist_ok=True)
        self.tmp=tempfile.TemporaryDirectory(dir=root);self.addCleanup(self.tmp.cleanup)
        self.store=Store(self.tmp.name);self.seq=0

    def paper(self,student='SYN-A',batch='SYN-B'):
        p=self.store.create_paper(dict(student_ref=student,student_name='合成'+student,batch_id=batch,
            title='合成数学卷',questions=[dict(id='Q01',stem='合成原题',answer='原错误答案',
            result='INCORRECT',knowledge='顶点式',cause='待核实')]))
        self.store.confirm(p['id'],1,True);return p

    def exercise(self,p=None,approve=False):
        e=self.store.create_exercise(dict(paper_id=(p or self.paper())['id'],question_id='Q01',
            level='基础巩固',stem='合成复测题',answer='秘密教师答案',explanation='秘密教师讲解'))
        if approve:self.store.approve_exercise(e['id'],1,True)
        return e

    def retest(self,e,result='CORRECT',condition='独立完成',request=None):
        self.seq+=1
        return self.store.record_retest(dict(exercise_id=e['id'],version=1,result=result,condition=condition,
            answer='' if result=='MISSING' else '学生复测答案',consent=True,request_id=request or 'SYN-RT-'+str(self.seq)))

    def queue(self):return practice_queue_overview(self.store)
    def row(self):return self.queue()['items'][0]

    def test_empty_has_no_invented_tasks_or_roster(self):
        self.assertEqual(self.queue()['items'],[])
        self.assertEqual(self.queue()['batches'],[])
        self.assertTrue(all(n==0 for n in self.queue()['counts'].values()))

    def test_existing_paper_without_exercises_is_empty_not_missing_retest(self):
        self.paper();q=self.queue();self.assertEqual(q['items'],[]);self.assertEqual(q['batches'],['SYN-B'])

    def test_draft_and_approved_exercise_have_distinct_next_actions(self):
        e=self.exercise();self.assertEqual(self.row()['action'],'REVIEW_DRAFT')
        self.store.approve_exercise(e['id'],1,True)
        self.assertEqual(self.row()['action'],'WAITING_RETEST')
        self.assertIsNone(self.row()['latest_retest_id'])

    def test_each_observation_has_expected_action(self):
        cases=[('INCORRECT','独立完成','NEEDS_REVIEW'),('PARTIAL','独立完成','NEEDS_REVIEW'),
               ('CORRECT','有提示完成','NEEDS_INDEPENDENT_RETEST'),('CORRECT','完成条件待核实','CONDITION_UNCONFIRMED'),
               ('MISSING','独立完成','RETEST_UNRESOLVED'),('PENDING','独立完成','RETEST_UNRESOLVED'),
               ('CORRECT','独立完成','OBSERVE')]
        for index,(result,condition,action) in enumerate(cases):
            e=self.exercise(self.paper('SYN-'+str(index),'SYN-'+str(index)),approve=True)
            self.retest(e,result,condition)
            row=next(r for r in self.queue()['items'] if r['id']==e['id'])
            self.assertEqual(row['action'],action)
            self.assertEqual(row['last_retest']['condition'],condition)

    def test_new_draft_is_priority_without_overwriting_old_correct_retest(self):
        e=self.exercise(approve=True);self.retest(e)
        self.store.update_exercise(e['id'],dict(version=1,level=e['level'],stem='新版待审',answer='3',explanation='新讲解'))
        row=self.row();self.assertEqual((row['version'],row['action']),(2,'REVIEW_DRAFT'))
        self.assertEqual(row['observation'],'INDEPENDENT_CORRECT_OBSERVE')
        self.assertEqual(row['last_retest']['version'],1)
        self.assertEqual(row['approved_versions'],[1])

    def test_missing_fixed_source_is_unverified_not_inferred(self):
        e=self.exercise(approve=True)
        with self.store.db() as db:db.execute('DELETE FROM exercise_origins WHERE exercise_id=?',(e['id'],))
        row=self.row();self.assertEqual(row['action'],'SOURCE_UNVERIFIED')
        self.assertIsNone(row['source_event_id']);self.assertIsNone(row['source_revision'])

    def test_approved_new_version_without_retest_waits_even_if_old_version_correct(self):
        e=self.exercise(approve=True);self.retest(e)
        self.store.update_exercise(e['id'],dict(version=1,level=e['level'],stem='新版已批准',answer='3',explanation='新讲解'))
        self.store.approve_exercise(e['id'],2,True)
        row=self.row()
        self.assertEqual(row['action'],'WAITING_RETEST')
        self.assertEqual(row['current_observation'],'WAITING_RETEST')
        self.assertEqual(row['current_retest_count'],0)
        self.assertIsNone(row['current_retest_id'])
        self.assertEqual(row['last_retest']['version'],1)
        self.assertEqual(row['observation'],'INDEPENDENT_CORRECT_OBSERVE')

    def test_late_old_version_retest_does_not_replace_current_version_observation(self):
        e=self.exercise(approve=True)
        self.store.update_exercise(e['id'],dict(version=1,level=e['level'],stem='新版',answer='3',explanation='新讲解'))
        self.store.approve_exercise(e['id'],2,True)
        self.store.record_retest(dict(exercise_id=e['id'],version=2,result='CORRECT',condition='独立完成',
            answer='3',consent=True,request_id='SYN-V2'))
        self.retest(e,result='INCORRECT')
        row=self.row()
        self.assertEqual(row['action'],'OBSERVE')
        self.assertEqual(row['current_observation'],'INDEPENDENT_CORRECT_OBSERVE')
        self.assertEqual(row['current_retest_count'],1)
        self.assertEqual(row['current_last_retest']['version'],2)
        self.assertEqual(row['last_retest']['version'],1)
        self.assertEqual(row['observation'],'NEEDS_REVIEW')

    def test_old_error_alone_does_not_mark_untested_new_version_as_failed(self):
        e=self.exercise(approve=True);self.retest(e,result='INCORRECT')
        self.store.update_exercise(e['id'],dict(version=1,level=e['level'],stem='新版',answer='3',explanation='新讲解'))
        self.store.approve_exercise(e['id'],2,True)
        self.assertEqual(self.row()['action'],'WAITING_RETEST')

    def test_student_batch_and_paper_identity_are_kept(self):
        a=self.paper();b=self.paper('SYN-B','SYN-OTHER')
        first=self.exercise(a);second=self.exercise(b);q=self.queue()
        rows={r['id']:r for r in q['items']}
        self.assertEqual((rows[first['id']]['student_id'],rows[first['id']]['paper_id'],rows[first['id']]['batch_id']),
                         (a['student_id'],a['id'],'SYN-B'))
        self.assertEqual(rows[second['id']]['student_ref'],'SYN-B')
        self.assertEqual(q['batches'],['SYN-B','SYN-OTHER'])

    def test_repeat_retest_is_one_task_and_preserves_latest_id(self):
        e=self.exercise(approve=True);r=self.retest(e,request='SYN-SAME');self.retest(e,request='SYN-SAME')
        row=self.row();self.assertEqual(len(self.queue()['items']),1)
        self.assertEqual(row['retest_count'],1);self.assertEqual(row['latest_retest_id'],r['retest']['id'])

    def test_new_retest_changes_snapshot_identity_even_when_result_same(self):
        e=self.exercise(approve=True);self.retest(e);old=self.row()['latest_retest_id'];self.retest(e)
        self.assertNotEqual(self.row()['latest_retest_id'],old)
        self.assertEqual(self.row()['retest_count'],2)

    def test_later_paper_revision_keeps_original_source_and_updates_paper_guard(self):
        p=self.paper();self.exercise(p);qs=p['questions'];qs[0].update(knowledge='后来关联',result='CORRECT')
        updated=self.store.save_paper(p['id'],dict(version=1,questions=qs))
        self.store.confirm(p['id'],updated['version'],True)
        row=self.row();self.assertEqual((row['paper_version'],row['confirmed_version']),(2,2))
        self.assertEqual(row['knowledge'],'顶点式');self.assertEqual(row['source_revision'],1)

    def test_metadata_does_not_include_answers_or_teaching_content(self):
        self.exercise(approve=True);body=json.dumps(self.queue(),ensure_ascii=False)
        for text in ('秘密教师答案','秘密教师讲解','原错误答案','合成复测题'):
            self.assertNotIn(text,body)
        self.assertNotIn('answer',self.row());self.assertNotIn('explanation',self.row())

    def test_reading_does_not_write_events_or_invent_due_date(self):
        self.exercise();before=self.store.event_count();first=self.queue();second=self.queue()
        self.assertEqual(first,second);self.assertEqual(self.store.event_count(),before)
        self.assertNotIn('due_at',first['items'][0]);self.assertEqual(first['counts']['REVIEW_DRAFT'],1)


if __name__=='__main__':unittest.main()
