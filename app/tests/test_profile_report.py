"""A teacher draft must describe fixed evidence and reject stale exports."""
import io,json,sys,tempfile,unittest,zipfile
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from store import Store,ValidationError,ConflictError
from exporting import word_bytes,print_html
from files import save_document
from PIL import Image
try:
    from profile_report import build_profile_report,report_content
except ModuleNotFoundError:
    build_profile_report=report_content=None


class ProfileReportTests(unittest.TestCase):
    def setUp(self):
        self.assertIsNotNone(build_profile_report,'个人学情报告尚未实现')
        root=Path(__file__).resolve().parents[1]/'.qa-temp';root.mkdir(exist_ok=True)
        self.tmp=tempfile.TemporaryDirectory(dir=root);self.addCleanup(self.tmp.cleanup)
        self.store=Store(self.tmp.name);self.sequence=0

    def paper(self,student='SYN-A',confirmed=True,questions=None,documents=None):
        self.sequence+=1
        p=self.store.create_paper(dict(student_ref=student,student_name='合成'+student,batch_id='SYN-'+str(self.sequence),
            title='合成数学卷',questions=questions or [dict(id='Q01',stem='求y=(x+1)²−4的顶点',answer='原错误',
            result='INCORRECT',knowledge='顶点式',cause='待核实')],documents=documents or []))
        if confirmed:self.store.confirm(p['id'],1,True)
        return p

    def report(self,student=None):
        return build_profile_report(self.store,student or self.store.bootstrap()['students'][0]['id'])

    def text(self,report):return '\n'.join(block[1] for block in report['blocks'])

    def exercise(self,p):
        e=self.store.create_exercise(dict(paper_id=p['id'],question_id='Q01',level='基础巩固',
            stem='合成复测题',answer='2',explanation='合成教师讲解'))
        self.store.approve_exercise(e['id'],1,True);return e

    def retest(self,e,version=1,result='CORRECT'):
        self.sequence+=1
        return self.store.record_retest(dict(exercise_id=e['id'],version=version,result=result,
            condition='独立完成',answer='合成作答',consent=True,request_id='SYN-RT-'+str(self.sequence)))

    def test_no_confirmation_does_not_invent_problem_or_mastery(self):
        self.paper(confirmed=False);r=self.report()
        self.assertEqual(r['record_count'],0)
        self.assertIn('暂无已确认原卷记录',self.text(r))
        self.assertIn('教师核对稿',r['title'])

    def test_missing_student_rejected(self):
        with self.assertRaises(ValidationError):self.report('0'*32)

    def test_five_results_are_separate_and_pending_missing_are_not_errors(self):
        questions=[dict(id='Q'+str(i),stem='合成题'+str(i),answer='合成原答',result=result,knowledge='合成知识')
                   for i,result in enumerate(('CORRECT','INCORRECT','PARTIAL','PENDING','MISSING'))]
        self.paper(questions=questions);r=self.report()
        self.assertEqual(r['record_count'],5)
        self.assertEqual(r['summary_counts'],dict(CORRECT=1,INCORRECT=1,PARTIAL=1,PENDING=1,MISSING=1))
        self.assertIn('缺材料不记为不会',self.text(r))

    def test_report_is_student_specific(self):
        a=self.paper();self.paper('SYN-B',questions=[dict(id='Q01',stem='乙生专属题',answer='乙生原答',result='INCORRECT')])
        r=self.report(a['student_id']);text=self.text(r)
        self.assertIn('合成SYN-A',text);self.assertNotIn('乙生专属题',text)
        self.assertNotIn('合成SYN-B',text)

    def test_same_source_and_question_deduplicated_while_history_is_retained(self):
        raw=io.BytesIO();Image.new('RGB',(12,12),'white').save(raw,format='PNG')
        doc=save_document(self.store.root,'synthetic.png',raw.getvalue())
        self.paper(documents=[doc['id']]);self.paper(documents=[doc['id']])
        r=self.report();self.assertEqual(r['record_count'],1);self.assertEqual(r['history_count'],2)

    def test_unchanged_report_fingerprint_is_deterministic(self):
        self.paper();first=self.report();second=self.report()
        self.assertEqual(first,second);self.assertRegex(first['fingerprint'],r'^[a-f0-9]{64}$')
        self.assertEqual(report_content(self.store,first['student_id'],first['fingerprint']),
            (first['title'],first['blocks']))

    def test_draft_keeps_confirmed_answer_and_invalidates_previous_preview(self):
        p=self.paper();old=self.report();q=p['questions'];q[0]['answer']='新草稿不作学情'
        self.store.save_paper(p['id'],dict(version=1,questions=q));new=self.report()
        self.assertNotEqual(old['fingerprint'],new['fingerprint'])
        self.assertIn('原错误',self.text(new));self.assertNotIn('新草稿不作学情',self.text(new))
        with self.assertRaises(ConflictError):report_content(self.store,p['student_id'],old['fingerprint'])

    def test_second_pending_revision_of_unclassified_paper_also_invalidates_preview(self):
        p=self.paper(questions=[dict(id='Q01',stem='无知识标签题',answer='原答',result='INCORRECT')])
        q=p['questions'];q[0]['answer']='待审一';v=self.store.save_paper(p['id'],dict(version=1,questions=q))
        old=self.report();q[0]['answer']='待审二';self.store.save_paper(p['id'],dict(version=v['version'],questions=q))
        with self.assertRaises(ConflictError):report_content(self.store,p['student_id'],old['fingerprint'])

    def test_other_student_change_does_not_invalidate_this_student_preview(self):
        a=self.paper();r=self.report(a['student_id']);self.paper('SYN-B')
        self.assertEqual(self.report(a['student_id'])['fingerprint'],r['fingerprint'])

    def test_original_reclassification_does_not_relabel_fixed_exercise_source(self):
        p=self.paper();self.exercise(p);q=p['questions'];q[0]['knowledge']='新关联'
        v=self.store.save_paper(p['id'],dict(version=1,questions=q));self.store.confirm(p['id'],v['version'],True)
        text=self.text(self.report());self.assertIn('新关联',text)
        self.assertIn('建立时知识：顶点式',text)

    def test_old_retest_cannot_mark_untested_new_version_as_observed(self):
        p=self.paper();e=self.exercise(p);self.retest(e)
        self.store.update_exercise(e['id'],dict(version=1,level=e['level'],stem='新版',answer='3',explanation='新讲解'))
        self.store.approve_exercise(e['id'],2,True)
        text=self.text(self.report());self.assertIn('当前版本V2：等待复测',text)
        self.assertIn('历史复测V1',text)

    def test_new_retest_changes_fingerprint_and_remains_separate_from_original(self):
        p=self.paper();e=self.exercise(p);old=self.report();self.retest(e);new=self.report()
        self.assertNotEqual(old['fingerprint'],new['fingerprint'])
        self.assertEqual(new['summary_counts']['INCORRECT'],1)
        self.assertIn('独立答对，仍需后续观察',self.text(new))

    def test_all_exercise_versions_show_their_actual_stems_without_retests(self):
        p=self.paper();e=self.exercise(p)
        self.store.update_exercise(e['id'],dict(version=1,level=e['level'],stem='新版独有题面',answer='3',explanation='新讲解'))
        text=self.text(self.report())
        self.assertIn('练习V1 · 已批准 · 历史题面',text)
        self.assertIn('合成复测题',text)
        self.assertIn('练习V2 · 待审 · 当前题面',text)
        self.assertIn('新版独有题面',text)

    def test_unknown_legacy_exercise_source_is_not_inferred(self):
        p=self.paper();e=self.exercise(p)
        with self.store.db() as db:db.execute('DELETE FROM exercise_origins WHERE exercise_id=?',(e['id'],))
        self.assertIn('固定原题来源待核实',self.text(self.report()))

    def test_invalid_fingerprint_and_student_audience_rejected(self):
        p=self.paper();r=self.report()
        for value in ('',None,'../bad'):
            with self.assertRaises(ValidationError):report_content(self.store,p['student_id'],value)
        with self.assertRaises(ValidationError):report_content(self.store,p['student_id'],r['fingerprint'],'student')

    def test_readonly_word_and_print_keep_teacher_label_and_escape_text(self):
        p=self.paper();before=self.store.profile(p['student_id']);r=self.report()
        title,blocks=report_content(self.store,p['student_id'],r['fingerprint'])
        with zipfile.ZipFile(io.BytesIO(word_bytes(title,blocks))) as z:
            self.assertIsNone(z.testzip());xml=z.read('word/document.xml').decode()
            self.assertIn('教师核对稿',xml);self.assertIn('m:oMath',xml)
        html=print_html(title,blocks+[('text','<img src=x onerror=bad>')])
        self.assertNotIn('<img src=x',html);self.assertIn('&lt;img',html)
        self.assertEqual(self.store.profile(p['student_id']),before)


if __name__=='__main__':unittest.main()
