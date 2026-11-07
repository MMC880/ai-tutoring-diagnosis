import io
from pathlib import Path
import sys
import tempfile
import unittest
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from store import Store,ValidationError,ConflictError
from files import save_document
from PIL import Image


class LearningEvidenceTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.addCleanup(self.tmp.cleanup)
        self.store=Store(self.tmp.name)

    def make(self,batch='B1',result='INCORRECT',knowledge='顶点式',kind='求顶点',student='S1',documents=None,confirmed=True):
        q=dict(id='Q02',stem='求这条抛物线的顶点',answer='(-2,3)',result=result,knowledge=knowledge,cause='待核实')
        if kind is not None:q['question_type']=kind
        p=self.store.create_paper(dict(student_ref=student,student_name='虚构'+student,batch_id=batch,title=batch+'数学作业',questions=[q],documents=documents or []))
        if confirmed:self.store.confirm(p['id'],p['version'],True)
        return self.store.get_paper(p['id'])

    def analysis(self,student='S1'):
        a=self.store.profile(student).get('learning_analysis')
        self.assertIsNotNone(a,'档案缺少持续问题汇总')
        return a

    def picture(self,color):
        raw=io.BytesIO();Image.new('RGB',(50,50),color).save(raw,format='PNG')
        return save_document(self.store.root,'合成.png',raw.getvalue())

    def test_drafts_do_not_enter_learning_evidence(self):
        self.make(confirmed=False)
        self.assertEqual(self.analysis()['groups'],[])

    def test_two_confirmed_papers_show_repeat_signal_and_source(self):
        self.make();p2=self.make('B2')
        g=self.analysis()['groups'][0]
        self.assertEqual(g['wrong_count'],2);self.assertEqual(g['wrong_paper_count'],2)
        self.assertEqual(g['signal'],'REPEATED_ACROSS_PAPERS')
        self.assertEqual(g['practice_source']['paper_id'],p2['id']);self.assertEqual(g['practice_source']['question_id'],'Q02')
        self.assertEqual(len(g['evidence']),2)

    def test_two_errors_in_one_paper_are_not_two_independent_attempts(self):
        p=self.make(confirmed=False)
        q=p['questions'][0]; self.store.save_paper(p['id'],dict(version=1,questions=[q,q|dict(id='Q03',stem='另一道顶点题')]))
        self.store.confirm(p['id'],2,True)
        g=self.analysis()['groups'][0]
        self.assertEqual(g['wrong_count'],2);self.assertEqual(g['wrong_paper_count'],1)
        self.assertEqual(g['signal'],'MULTIPLE_IN_PAPER')

    def test_revision_counts_only_latest_confirmation_but_keeps_history(self):
        p=self.make();p['questions'][0]['result']='CORRECT'
        self.store.save_paper(p['id'],dict(version=1,questions=p['questions']));self.store.confirm(p['id'],2,True)
        a=self.analysis();g=a['groups'][0]
        self.assertEqual(g['wrong_count'],0);self.assertEqual(g['counts']['CORRECT'],1)
        self.assertIsNone(g['practice_source']);self.assertEqual(len(self.store.profile('S1')['events']),2)

    def test_pending_missing_and_partial_have_distinct_counts(self):
        self.make(result='PENDING');self.make('B2',result='MISSING');self.make('B3',result='PARTIAL')
        g=self.analysis()['groups'][0]
        self.assertEqual(g['counts']['PENDING'],1);self.assertEqual(g['counts']['MISSING'],1)
        self.assertEqual(g['counts']['PARTIAL'],1);self.assertEqual(g['wrong_count'],1)
        self.assertEqual(g['wrong_paper_count'],1)

    def test_question_types_and_students_do_not_mix(self):
        self.make(kind='求顶点');self.make('B2',kind='求交点');self.make('B3',student='OTHER')
        groups=self.analysis()['groups']
        self.assertEqual(len(groups),2);self.assertEqual({g['question_type'] for g in groups},{'求顶点','求交点'})
        self.assertTrue(all(g['wrong_count']==1 for g in groups))

    def test_empty_labels_remain_unclassified_and_old_records_work(self):
        self.make(knowledge='',kind=None);self.make('B2',kind=None)
        a=self.analysis();self.assertEqual(a['unclassified_count'],1)
        self.assertEqual(len(a['groups']),1);self.assertEqual(a['groups'][0]['question_type'],'')

    def test_same_photo_same_question_is_conservatively_one_evidence(self):
        doc=self.picture('red');self.make(documents=[doc]);p2=self.make('B2',documents=[doc])
        a=self.analysis();g=a['groups'][0]
        self.assertEqual(g['wrong_count'],1);self.assertEqual(g['wrong_paper_count'],1)
        self.assertEqual(a['duplicate_count'],1);self.assertEqual(g['evidence'][0]['paper_id'],p2['id'])
        self.assertEqual(len(self.store.profile('S1')['events']),2)

    def test_latest_confirmation_of_duplicate_photo_wins(self):
        doc=self.picture('red');self.make(documents=[doc]);self.make('B2',result='CORRECT',documents=[doc])
        g=self.analysis()['groups'][0];self.assertEqual(g['wrong_count'],0);self.assertEqual(g['counts']['CORRECT'],1)

    def test_distinct_photos_and_reference_only_photos_are_not_deduplicated(self):
        self.make(documents=[self.picture('red')]);self.make('B2',documents=[self.picture('blue')])
        doc=self.picture('white');reference=doc|dict(role='参考答案')
        self.make('B3',documents=[reference]);self.make('B4',documents=[reference])
        a=self.analysis();self.assertEqual(a['duplicate_count'],0);self.assertEqual(a['groups'][0]['wrong_paper_count'],4)

    def test_unconfirmed_label_change_does_not_move_group_or_authorize_practice(self):
        p=self.make();p['questions'][0]['knowledge']='另一个知识点'
        self.store.save_paper(p['id'],dict(version=1,questions=p['questions']))
        g=self.analysis()['groups'][0]
        self.assertEqual(g['knowledge'],'顶点式');self.assertIsNone(g['practice_source'])
        self.assertEqual(g['review_source']['paper_id'],p['id'])

    def test_retest_correct_does_not_erase_original_wrong_evidence(self):
        p=self.make();e=self.store.create_exercise(dict(paper_id=p['id'],question_id='Q02',level='基础巩固',stem='新题',answer='新答案',explanation='示范'))
        self.store.approve_exercise(e['id'],1,True)
        self.store.record_retest(dict(exercise_id=e['id'],version=1,answer='新答案',condition='独立完成',result='CORRECT',consent=True,request_id='SYN-RT1'))
        self.assertEqual(self.analysis()['groups'][0]['wrong_count'],1)
        self.assertEqual(len(self.store.profile('S1')['retests']),1)

    def test_question_type_round_trip_empty_compatibility_and_bound(self):
        p=self.make();self.assertEqual(p['questions'][0].get('question_type'),'求顶点')
        p2=self.make('B2',kind='');self.assertNotIn('question_type',p2['questions'][0])
        with self.assertRaises(ValidationError):self.make('B3',kind='类'*201)

    def test_whitespace_is_normalized_but_synonyms_are_not_guessed(self):
        self.make(knowledge='  顶点式  ');self.make('B2',knowledge='顶点式');self.make('B3',knowledge='二次函数顶点公式')
        g=self.analysis()['groups'];self.assertEqual(len(g),2)
        self.assertEqual(sorted(x['wrong_count'] for x in g),[1,2])

    def test_same_photo_questions_kept_in_different_copies_are_one_assignment(self):
        doc=self.picture('red');p=self.make(documents=[doc],confirmed=False)
        q=p['questions'][0]
        self.store.save_paper(p['id'],dict(version=1,questions=[q,q|dict(id='Q03',stem='另一题')]))
        self.store.confirm(p['id'],2,True);self.make('B2',documents=[doc])
        a=self.analysis();g=a['groups'][0]
        self.assertEqual(g['wrong_count'],2);self.assertEqual(a['duplicate_count'],1)
        self.assertEqual(g['paper_count'],1);self.assertEqual(g['wrong_paper_count'],1)
        self.assertEqual(g['signal'],'MULTIPLE_IN_PAPER')

    def test_exercise_creation_rejects_stale_original_version_even_after_reconfirmation(self):
        p=self.make();p['questions'][0]['cause']='新确认备注'
        self.store.save_paper(p['id'],dict(version=1,questions=p['questions']));self.store.confirm(p['id'],2,True)
        fields=dict(paper_id=p['id'],question_id='Q02',paper_version=1,level='基础巩固',stem='新题',answer='答案',explanation='讲解')
        with self.assertRaises(ConflictError):self.store.create_exercise(fields)
        self.assertEqual(self.store.bootstrap()['exercises'],[])
        fields['paper_version']=2
        self.assertEqual(self.store.create_exercise(fields)['question_id'],'Q02')

    def test_explicit_exercise_source_version_must_be_integer(self):
        p=self.make()
        for value in [True,None,'1',0]:
            with self.subTest(value=value):
                with self.assertRaises(ValidationError):self.store.create_exercise(dict(paper_id=p['id'],question_id='Q02',paper_version=value,level='基础巩固',stem='新题',answer='答案',explanation=''))
