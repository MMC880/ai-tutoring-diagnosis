import io,json,sys,tempfile,unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from docx import Document
from store import Store,ValidationError
from ai_service import AIService
from teaching import Library
from files import save_document
from tutoring_fixture import candidate_result

class GroundedTutoringTests(unittest.TestCase):
    def setUp(self):
        folder=Path(__file__).resolve().parents[1]/'.qa-temp';folder.mkdir(exist_ok=True)
        self.tmp=tempfile.TemporaryDirectory(dir=folder);self.addCleanup(self.tmp.cleanup)
        self.store=Store(self.tmp.name);self.lib=Library(self.store);self.calls=[]
        self.ai=AIService(self.store,self.transport)
        self.ai.configure(dict(base_url='https://example.com/v1',model='SYN-MODEL',api_key='FAKE-GROUNDED-KEY'))
        raw=io.BytesIO();d=Document();d.add_paragraph('合成顶点讲解');d.save(raw)
        doc=save_document(self.store.root,'PRIVATE-TEACHING-FILE.docx',raw.getvalue())
        m=self.lib.create(dict(document_id=doc['id'],title='PRIVATE-TITLE',scope='初中数学',kind='教案'))
        m=self.lib.save(m['id'],m['version'],dict(entries=[dict(knowledge='顶点式',question_type='求顶点',locator='合成第1节',content='令括号为零，再代回原式。无需发送的额外备注。')]))
        self.m=self.lib.approve(m['id'],m['version'],True)
        self.ref=dict(material_id=m['id'],version=m['version'],entry_id=m['entries'][0]['id'])
        self.p=self.store.create_paper(dict(student_ref='PRIVATE-STUDENT',batch_id='PRIVATE-BATCH',title='PRIVATE-PAPER',questions=[dict(id='Q01',stem='求y=(x-2)²+3的顶点',answer='(-2,3)',knowledge='顶点式',result='INCORRECT',teaching_ref=self.ref)]))
        self.store.confirm(self.p['id'],1,True)
    def transport(self,cfg,key,payload):
        self.calls.append(payload);return dict(choices=[dict(message=dict(content=json.dumps(candidate_result(),ensure_ascii=False)),finish_reason='stop')])
    def prepare(self,**extra):return self.ai.prepare(dict(mode='tutoring_generate',paper_id=self.p['id'],version=1,question_id='Q01',**extra))
    def selected(self):return self.prepare(include_teaching=True,teaching_excerpt='令括号为零，再代回原式。')
    def test_default_omits_reference_and_original_document(self):
        job=self.prepare();self.assertNotIn('teaching',json.loads(job['payload']['messages'][1]['content']));self.assertEqual(self.calls,[])
    def test_only_explicit_excerpt_is_outbound(self):
        job=self.selected();body=json.dumps(job['payload'],ensure_ascii=False);sent=json.loads(job['payload']['messages'][1]['content'])
        self.assertEqual(sent['teaching'],dict(knowledge='顶点式',question_type='求顶点',content='令括号为零，再代回原式。'))
        for private in ['PRIVATE',self.m['id'],self.ref['entry_id'],'额外备注']:self.assertNotIn(private,body)
        self.assertEqual(self.calls,[])
    def test_local_metadata_preserves_fixed_provenance(self):
        job=self.selected();ctx=job['metadata']['teaching_context'];self.assertEqual(ctx['reference'],self.ref)
        self.assertEqual(ctx['locator'],'合成第1节');self.assertEqual(ctx['excerpt'],'令括号为零，再代回原式。')
    def test_selection_requires_boolean_and_nonempty_bounded_excerpt(self):
        for extra in [dict(include_teaching='yes',teaching_excerpt='正文'),dict(include_teaching=True,teaching_excerpt=''),dict(include_teaching=True,teaching_excerpt='字'*4001),dict(teaching_excerpt='未选择却传正文')]:
            with self.subTest(extra=str(extra)[:50]):
                with self.assertRaises(ValidationError):self.prepare(**extra)
    def test_cannot_select_reference_for_unbound_question(self):
        p=self.store.create_paper(dict(student_ref='OTHER',batch_id='SYN',title='合成',questions=[dict(id='Q01',stem='题',answer='1',result='INCORRECT')]))
        self.store.confirm(p['id'],1,True)
        with self.assertRaises(ValidationError):self.ai.prepare(dict(mode='tutoring_generate',paper_id=p['id'],version=1,question_id='Q01',include_teaching=True,teaching_excerpt='节选'))
    def test_new_material_draft_does_not_rewrite_job_reference(self):
        job=self.selected();m=self.m
        self.lib.save(m['id'],m['version'],dict(entries=[m['entries'][0]|dict(content='新内容')]))
        self.assertEqual(self.selected()['metadata']['teaching_context'],job['metadata']['teaching_context'])
    def test_selected_candidate_creates_only_draft_with_teacher_provenance(self):
        job=self.ai.send(self.selected()['id'],True);job=self.ai.apply_tutoring(job['id'],'基础巩固',True)
        e=self.store.get_exercise(job['metadata']['practice_drafts']['基础巩固']['exercise_id'])
        self.assertEqual(e['status'],'DRAFT');self.assertIn('合成第1节',e['explanation']);self.assertIn('PRIVATE-TITLE',e['explanation'])
        self.assertNotIn('PRIVATE',e['stem']);self.assertEqual(self.store.event_count(),1)
    def test_backup_restores_grounded_job_and_draft(self):
        job=self.ai.send(self.selected()['id'],True);self.ai.apply_tutoring(job['id'],'基础巩固',True)
        backup=self.store.backup();self.store.restore(backup['id'],'RESTORE')
        self.assertEqual(self.ai.get_job(job['id'])['metadata']['teaching_context']['reference'],self.ref)

    def test_restore_context_rejects_extra_sibling_material(self):
        import tutoring
        job=self.selected();body=json.loads(job['payload']['messages'][1]['content']);body['raw_document']='PRIVATE'
        with self.store.db() as db:
            with self.assertRaises(ValidationError):tutoring.validate_context(db,job['metadata']['source_snapshot'],job['metadata'],body)
