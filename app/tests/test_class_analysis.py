"""Class knowledge signals count students, never infer mastery."""
import io
from pathlib import Path
import sys
import tempfile
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from docx import Document
from PIL import Image
from files import save_document
from store import Store
from teaching import Library


class ClassAnalysisTests(unittest.TestCase):
    def setUp(self):
        root = Path(__file__).resolve().parents[1] / '.qa-temp'
        root.mkdir(exist_ok=True)
        self.tmp = tempfile.TemporaryDirectory(dir=root)
        self.addCleanup(self.tmp.cleanup)
        self.store = Store(self.tmp.name)
        self.library = Library(self.store)

    def question(self, ident='Q01', result='INCORRECT', reference=None, **values):
        q = dict(id=ident, stem='合成题干', answer='原答', result=result,
                 knowledge='顶点式', question_type='求顶点', cause='待核实') | values
        if reference:
            q['teaching_ref'] = reference
            q['knowledge'] = self.library.reference(reference)['knowledge']
        return q

    def paper(self, student='SYN-A', questions=None, batch='SYN-CLASS', documents=None, confirmed=True):
        paper = self.store.create_paper(dict(student_ref=student, student_name='合成'+student,
            batch_id=batch, title='合成数学作业', questions=questions or [self.question()],
            documents=documents or []))
        if confirmed:
            self.store.confirm(paper['id'], paper['version'], True)
        return paper

    def references(self):
        raw = io.BytesIO()
        doc = Document(); doc.add_paragraph('合成教学参考'); doc.save(raw)
        source = save_document(self.store.root, 'synthetic.docx', raw.getvalue())
        material = self.library.create(dict(document_id=source['id'],title='合成参考',scope='初中数学',kind='教案'))
        material = self.library.save(material['id'], material['version'], dict(entries=[
            dict(knowledge='顶点式', locator='合成第1节', content='令括号为零'),
            dict(knowledge='顶点式', locator='合成第2节', content='另一个同名考点')]))
        material = self.library.approve(material['id'], material['version'], True)
        return material, [dict(material_id=material['id'], entry_id=e['id'], version=material['version']) for e in material['entries']]

    def analysis(self, batch='SYN-CLASS'):
        return self.store.summary(batch)['class_analysis']

    def test_multiple_errors_count_one_student_and_partial_is_included(self):
        self.paper(questions=[self.question('Q01'), self.question('Q02'), self.question('Q03', 'PARTIAL')])
        self.paper('SYN-B')
        group = self.analysis()['groups'][0]
        self.assertEqual(group['affected_student_count'], 2)
        self.assertEqual(group['wrong_count'], 4)
        self.assertEqual(group['counts']['INCORRECT'], 3)
        self.assertEqual(group['counts']['PARTIAL'], 1)
        self.assertEqual({s['student_ref'] for s in group['affected_students']}, {'SYN-A','SYN-B'})

    def test_stable_entry_groups_different_types_and_versions(self):
        material, refs = self.references()
        self.paper(questions=[self.question(reference=refs[0])])
        material = self.library.save(material['id'], material['version'], dict(entries=[
            e | dict(knowledge='二次函数顶点') for e in material['entries']]))
        material = self.library.approve(material['id'], material['version'], True)
        ref = dict(material_id=material['id'],entry_id=material['entries'][0]['id'],version=material['version'])
        self.paper('SYN-B', [self.question(reference=ref,question_type='求对称轴')])
        groups = self.analysis()['groups']
        self.assertEqual(len(groups), 1)
        self.assertEqual(groups[0]['basis'], 'TEACHING_ENTRY')
        self.assertEqual(set(groups[0]['knowledge_names']), {'顶点式','二次函数顶点'})
        self.assertEqual(set(groups[0]['question_types']), {'求顶点','求对称轴'})

    def test_same_name_different_entries_and_unlinked_labels_are_separate(self):
        _, refs = self.references()
        self.paper(questions=[self.question('Q01',reference=refs[0]),self.question('Q02',reference=refs[1]),self.question('Q03')])
        groups = self.analysis()['groups']
        self.assertEqual(len(groups), 3)
        self.assertEqual(sorted(g['basis'] for g in groups), ['LABEL_ONLY','TEACHING_ENTRY','TEACHING_ENTRY'])
        self.assertTrue(all(g['affected_student_count']==1 for g in groups))

    def test_label_only_keeps_question_types_separate(self):
        self.paper(questions=[self.question('Q01'),self.question('Q02',question_type='求对称轴')])
        self.assertEqual(len(self.analysis()['groups']), 2)

    def test_pending_missing_and_correct_are_not_affected_students(self):
        self.paper('SYN-A',[self.question(result='MISSING')])
        self.paper('SYN-B',[self.question(result='PENDING')])
        self.paper('SYN-C',[self.question(result='CORRECT')])
        group = self.analysis()['groups'][0]
        self.assertEqual(group['affected_student_count'], 0)
        self.assertEqual(group['affected_students'], [])
        self.assertEqual(group['counts'],dict(CORRECT=1,INCORRECT=0,PARTIAL=0,PENDING=1,MISSING=1))

    def test_unconfirmed_draft_omitted_and_reconfirmation_replaces_current_result(self):
        p = self.paper()
        self.paper('SYN-B', confirmed=False)
        questions = p['questions']; questions[0]['result']='CORRECT'
        saved = self.store.save_paper(p['id'],dict(version=p['version'],questions=questions))
        old = self.analysis()['groups'][0]
        self.assertEqual(old['affected_student_count'],1)
        self.assertFalse(old['evidence'][0]['source_ready'])
        self.store.confirm(p['id'],saved['version'],True)
        new = self.analysis()['groups'][0]
        self.assertEqual(new['affected_student_count'],0)
        self.assertEqual(len(new['evidence']),1)
        self.assertEqual(new['evidence'][0]['revision'],2)
        self.assertEqual(len(self.store.profile('SYN-A')['events']),2)

    def test_same_photo_does_not_merge_different_students(self):
        raw=io.BytesIO();Image.new('RGB',(12,12),'white').save(raw,format='PNG')
        document=save_document(self.store.root,'synthetic.png',raw.getvalue())
        self.paper(documents=[document['id']])
        self.paper('SYN-B',documents=[document['id']])
        result=self.analysis();group=result['groups'][0]
        self.assertEqual(result['duplicate_count'],0)
        self.assertEqual(len(group['evidence']),2)
        self.assertEqual(group['affected_student_count'],2)

    def test_batch_isolation_and_unclassified_counts(self):
        self.paper('SYN-A',[self.question(knowledge='',question_type='')])
        self.paper('SYN-OTHER',batch='SYN-OTHER')
        result=self.analysis()
        self.assertEqual(result['groups'],[])
        self.assertEqual(result['unclassified_count'],1)

    def test_evidence_keeps_student_paper_event_and_teacher_source(self):
        p=self.paper(questions=[self.question(teacher_mark='原教师批注')])
        e=self.analysis()['groups'][0]['evidence'][0]
        self.assertEqual((e['student_id'],e['student_ref'],e['paper_id'],e['question_id'],e['batch_id'],e['revision']),
            (p['student_id'],'SYN-A',p['id'],'Q01','SYN-CLASS',1))
        original=self.store.student_evidence(p['student_id'],e['event_id'])
        self.assertEqual(original['event']['question']['teacher_mark'],'原教师批注')

    def test_empty_batch_has_empty_analysis(self):
        self.assertEqual(self.analysis()['groups'],[])
        self.assertEqual(self.analysis()['duplicate_count'],0)

    def test_different_question_numbers_join_same_knowledge_without_inventing_repeated_errors(self):
        self.paper('SYN-A',[self.question('Q01')]);self.paper('SYN-B',[self.question('Q22')])
        g=self.analysis()['groups'][0]
        self.assertEqual(g['affected_student_count'],2)
        self.assertEqual({e['question_id'] for e in g['evidence']},{'Q01','Q22'})
        self.assertNotIn('mastery',g)

    def test_summary_is_read_only_and_keeps_original_question_statistics(self):
        self.paper()
        before=self.store.profile('SYN-A')['events']
        summary=self.store.summary('SYN-CLASS')
        self.assertIn('class_analysis',summary)
        self.assertEqual(summary['counts']['INCORRECT'],1)
        self.assertEqual(summary['rows'][0]['id'],'Q01')
        self.assertEqual(self.store.profile('SYN-A')['events'],before)


if __name__ == '__main__': unittest.main()
