"""Knowledge progress must retain fixed source and exact retest conditions."""
import io
from pathlib import Path
import sys
import tempfile
import unittest

sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from store import Store
from teaching import Library
from files import save_document
from docx import Document


class KnowledgeFollowupTests(unittest.TestCase):
    def setUp(self):
        root=Path(__file__).resolve().parents[1]/'.qa-temp';root.mkdir(exist_ok=True)
        self.tmp=tempfile.TemporaryDirectory(dir=root);self.addCleanup(self.tmp.cleanup)
        self.store=Store(self.tmp.name);self.library=Library(self.store)
        self.sequence=0

    def paper(self,student='SYN-A',knowledge='顶点式',kind='求顶点',reference=None):
        self.sequence+=1
        q=dict(id='Q01',stem='合成求顶点',answer='(-2,3)',knowledge=knowledge,
               question_type=kind,result='INCORRECT',cause='待核实')
        if reference:q['teaching_ref']=reference;q['knowledge']=self.library.reference(reference)['knowledge']
        p=self.store.create_paper(dict(student_ref=student,batch_id='SYN-'+str(self.sequence),title='合成数学卷',questions=[q]))
        self.store.confirm(p['id'],1,True)
        return p

    def exercise(self,paper):
        return self.store.create_exercise(dict(paper_id=paper['id'],question_id='Q01',level='基础巩固',
            stem='合成新题',answer='(-1,-4)',explanation='合成教师讲解'))

    def retest(self,exercise,result='CORRECT',condition='独立完成',version=1,answer='(-1,-4)',request=None):
        self.sequence+=1
        return self.store.record_retest(dict(exercise_id=exercise['id'],version=version,result=result,
            answer=answer,condition=condition,consent=True,request_id=request or 'SYN-RT-'+str(self.sequence)))

    def profile(self,student='SYN-A'):return self.store.profile(student)
    def followup(self):return self.profile()['learning_analysis']['groups'][0]['followup']

    def references(self):
        raw=io.BytesIO();doc=Document();doc.add_paragraph('合成教案');doc.save(raw)
        source=save_document(self.store.root,'synthetic.docx',raw.getvalue())
        m=self.library.create(dict(document_id=source['id'],title='合成知识',scope='初中数学',kind='教案'))
        m=self.library.save(m['id'],m['version'],dict(entries=[
            dict(knowledge='顶点式',locator='第1节',content='令括号为零'),
            dict(knowledge='顶点式',locator='第2节',content='另一个同名知识')]))
        m=self.library.approve(m['id'],m['version'],True)
        return m,[dict(material_id=m['id'],entry_id=e['id'],version=m['version']) for e in m['entries']]

    def test_confirmed_knowledge_without_exercise_has_empty_progress(self):
        self.paper();f=self.followup()
        self.assertEqual((f['exercise_count'],f['retest_count'],f['items']),(0,0,[]))

    def test_draft_and_approved_exercises_remain_waiting_not_completed(self):
        e=self.exercise(self.paper());f=self.followup()
        self.assertEqual(f['items'][0]['observation'],'WAITING_APPROVAL')
        self.assertEqual(f['items'][0]['approved_version_count'],0)
        self.store.approve_exercise(e['id'],1,True);f=self.followup()
        self.assertEqual(f['items'][0]['observation'],'WAITING_RETEST')
        self.assertEqual(f['items'][0]['approved_version_count'],1)
        self.assertEqual(f['retest_count'],0)

    def test_independent_correct_does_not_change_original_error_or_mastery(self):
        e=self.exercise(self.paper());self.store.approve_exercise(e['id'],1,True);self.retest(e)
        profile=self.profile();f=profile['learning_analysis']['groups'][0]['followup']
        self.assertEqual(f['observations']['INDEPENDENT_CORRECT_OBSERVE'],1)
        self.assertEqual(f['items'][0]['last_retest']['condition'],'独立完成')
        self.assertEqual(profile['archive_summary']['counts']['INCORRECT'],1)
        self.assertNotIn('mastery',f)

    def test_hinted_correct_is_not_independent_success(self):
        e=self.exercise(self.paper());self.store.approve_exercise(e['id'],1,True);self.retest(e,condition='有提示完成')
        f=self.followup();self.assertEqual(f['observations']['NEEDS_INDEPENDENT_RETEST'],1)
        self.assertEqual(f['observations'].get('INDEPENDENT_CORRECT_OBSERVE',0),0)

    def test_unknown_condition_and_unresolved_latest_retest_are_separate(self):
        e=self.exercise(self.paper());self.store.approve_exercise(e['id'],1,True)
        self.retest(e,condition='完成条件待核实')
        self.assertEqual(self.followup()['items'][0]['observation'],'CONDITION_UNCONFIRMED')
        self.retest(e,result='PENDING',answer='')
        f=self.followup();self.assertEqual(f['items'][0]['observation'],'RETEST_UNRESOLVED')
        self.assertEqual(f['retest_count'],2)

    def test_two_exercises_keep_latest_observations_separate(self):
        p=self.paper();first=self.exercise(p);second=self.exercise(p)
        for e in (first,second):self.store.approve_exercise(e['id'],1,True)
        self.retest(first);self.retest(second,result='INCORRECT')
        f=self.followup();self.assertEqual(f['exercise_count'],2)
        self.assertEqual(f['observations']['INDEPENDENT_CORRECT_OBSERVE'],1)
        self.assertEqual(f['observations']['NEEDS_REVIEW'],1)

    def test_history_count_and_latest_record_follow_append_order_not_uuid(self):
        e=self.exercise(self.paper());self.store.approve_exercise(e['id'],1,True)
        self.retest(e);self.retest(e,result='INCORRECT',answer='新错误')
        f=self.followup();self.assertEqual(f['retest_count'],2)
        self.assertEqual(f['items'][0]['last_retest']['result'],'INCORRECT')
        self.assertEqual(f['observations']['NEEDS_REVIEW'],1)
        self.assertEqual(len(self.profile()['learning_journeys'][0]['retests']),2)

    def test_original_corrected_keeps_old_exercise_source_and_history(self):
        p=self.paper();e=self.exercise(p);q=p['questions'];q[0]['result']='CORRECT'
        updated=self.store.save_paper(p['id'],dict(version=1,questions=q));self.store.confirm(p['id'],updated['version'],True)
        f=self.followup();self.assertEqual(f['exercise_count'],1)
        self.assertTrue(f['items'][0]['source_has_later_confirmation'])
        self.assertEqual(f['items'][0]['source_revision'],1)

    def test_reassigned_original_does_not_relabel_old_exercise(self):
        p=self.paper();self.exercise(p);q=p['questions'];q[0]['knowledge']='方程'
        updated=self.store.save_paper(p['id'],dict(version=1,questions=q));self.store.confirm(p['id'],updated['version'],True)
        profile=self.profile()
        self.assertEqual(profile['learning_analysis']['groups'][0]['followup']['exercise_count'],0)
        self.assertEqual(profile['learning_analysis']['unmatched_followup_count'],1)
        self.assertEqual(profile['learning_journeys'][0]['source']['question']['knowledge'],'顶点式')

    def test_stable_teaching_identity_matches_across_names_versions_and_types(self):
        m,refs=self.references();p=self.paper(reference=refs[0]);self.exercise(p)
        m=self.library.save(m['id'],m['version'],dict(entries=[e|dict(knowledge='二次函数顶点') for e in m['entries']]))
        m=self.library.approve(m['id'],m['version'],True)
        ref=dict(material_id=m['id'],entry_id=m['entries'][0]['id'],version=m['version'])
        self.paper(reference=ref,kind='求对称轴')
        self.assertEqual(len(self.profile()['learning_analysis']['groups']),1)
        self.assertEqual(self.followup()['exercise_count'],1)

    def test_same_name_different_entries_and_labels_do_not_share_exercises(self):
        _,refs=self.references()
        self.exercise(self.paper(reference=refs[0]));self.paper(reference=refs[1]);self.paper()
        groups=self.profile()['learning_analysis']['groups']
        self.assertEqual(len(groups),3)
        self.assertEqual(sorted(g['followup']['exercise_count'] for g in groups),[0,0,1])

    def test_student_isolation_and_repeated_profile_reads_are_read_only(self):
        e=self.exercise(self.paper());self.store.approve_exercise(e['id'],1,True);self.retest(e,request='SYN-SAME');self.retest(e,request='SYN-SAME')
        self.paper(student='SYN-B');before=self.profile()['events']
        self.assertEqual(self.followup()['retest_count'],1)
        self.assertEqual(self.profile('SYN-B')['learning_analysis']['groups'][0]['followup']['exercise_count'],0)
        self.assertEqual(self.profile()['events'],before)

    def test_old_version_retest_stays_old_while_new_exercise_is_pending(self):
        e=self.exercise(self.paper());self.store.approve_exercise(e['id'],1,True)
        self.store.update_exercise(e['id'],dict(version=1,level=e['level'],stem='新题面V2',answer='2',explanation='新讲解'))
        self.retest(e,version=1)
        item=self.followup()['items'][0]
        self.assertTrue(item['current_draft'])
        self.assertEqual(item['current_version'],2)
        self.assertEqual(item['last_retest']['version'],1)
        self.assertEqual(item['observation'],'INDEPENDENT_CORRECT_OBSERVE')

    def test_legacy_source_missing_is_not_inferred_from_current_original(self):
        e=self.exercise(self.paper())
        with self.store.db() as db:db.execute('DELETE FROM exercise_origins WHERE exercise_id=?',(e['id'],))
        profile=self.profile();self.assertEqual(self.followup()['exercise_count'],0)
        self.assertEqual(profile['learning_analysis']['unmatched_followup_count'],1)
        self.assertIsNone(profile['learning_journeys'][0]['source'])


if __name__=='__main__':unittest.main()
