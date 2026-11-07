"""Teacher-confirmed knowledge identities, not AI synonym inference."""
import io
from pathlib import Path
import sys,tempfile,unittest
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from docx import Document
from PIL import Image
from store import Store
from teaching import Library
from files import save_document


class KnowledgePatternTests(unittest.TestCase):
    def setUp(self):
        folder=Path(__file__).resolve().parents[1]/'.qa-temp';folder.mkdir(exist_ok=True)
        self.tmp=tempfile.TemporaryDirectory(dir=folder);self.addCleanup(self.tmp.cleanup)
        self.store=Store(self.tmp.name);self.lib=Library(self.store);self.sequence=0

    def material(self,title='合成顶点式讲义'):
        self.sequence+=1;raw=io.BytesIO();d=Document();d.add_paragraph(title+str(self.sequence));d.save(raw)
        document=save_document(self.store.root,'synthetic-reference.docx',raw.getvalue())
        m=self.lib.create(dict(document_id=document['id'],title=title,scope='初中数学',kind='教案'))
        entries=[dict(knowledge='顶点式符号',locator='合成第1节',content='令括号为零，再代回。'),
                 dict(knowledge='顶点式符号',locator='合成第2节',content='同名但需要老师分别确认的另一条目。')]
        m=self.lib.save(m['id'],m['version'],dict(entries=entries));return self.lib.approve(m['id'],m['version'],True)

    def ref(self,m,index=0):return dict(material_id=m['id'],entry_id=m['entries'][index]['id'],version=m['version'])

    def make(self,ref=None,kind='求顶点',label='顶点式符号',result='INCORRECT',student='SYN-A',documents=None,confirmed=True):
        self.sequence+=1
        if ref:label=self.lib.reference(ref)['knowledge']
        q=dict(id='Q01',stem='求抛物线顶点',answer='(-2,3)',result=result,knowledge=label,question_type=kind,cause='待核实')
        if ref:q['teaching_ref']=ref
        p=self.store.create_paper(dict(student_ref=student,batch_id='SYN-'+str(self.sequence),title='合成作业'+str(self.sequence),questions=[q],documents=documents or []))
        if confirmed:self.store.confirm(p['id'],1,True)
        return p

    def groups(self,student='SYN-A'):return self.store.profile(student)['learning_analysis']['groups']

    def test_same_entry_different_question_types_share_one_knowledge_group(self):
        m=self.material();self.make(self.ref(m));self.make(self.ref(m),kind='求对称轴')
        groups=self.groups();self.assertEqual(len(groups),1)
        self.assertEqual(groups[0]['wrong_count'],2)
        self.assertEqual(set(groups[0]['question_types']),{'求顶点','求对称轴'})
        self.assertEqual(groups[0]['basis'],'TEACHING_ENTRY')

    def test_renaming_same_entry_keeps_one_group_and_historical_names(self):
        m=self.material();old=self.ref(m);p=self.make(old)
        entries=[e|dict(knowledge='二次函数顶点横坐标') if i==0 else e for i,e in enumerate(m['entries'])]
        new=self.lib.save(m['id'],m['version'],dict(entries=entries));new=self.lib.approve(new['id'],new['version'],True)
        self.make(self.ref(new));groups=self.groups();self.assertEqual(len(groups),1)
        g=groups[0];self.assertEqual(set(g['knowledge_names']),{'顶点式符号','二次函数顶点横坐标'})
        self.assertEqual(g['knowledge'],'二次函数顶点横坐标')
        self.assertEqual({e['teaching_ref']['version'] for e in g['evidence']},{m['version'],new['version']})
        self.assertEqual(self.store.get_paper(p['id'])['questions'][0]['knowledge'],'顶点式符号')

    def test_same_label_different_entries_do_not_merge(self):
        m=self.material();self.make(self.ref(m));self.make(self.ref(m,1))
        self.assertEqual(len(self.groups()),2)
        self.assertTrue(all(g['wrong_count']==1 for g in self.groups()))

    def test_same_label_different_materials_do_not_merge(self):
        a=self.material();b=self.material('另一份合成讲义');self.make(self.ref(a));self.make(self.ref(b))
        self.assertEqual(len(self.groups()),2)

    def test_unbound_label_does_not_merge_into_teaching_group(self):
        m=self.material();self.make(self.ref(m));self.make()
        groups=self.groups();self.assertEqual(len(groups),2)
        self.assertEqual({g['basis'] for g in groups},{'TEACHING_ENTRY','LABEL_ONLY'})

    def test_unbound_legacy_labels_still_group_conservatively(self):
        self.make();self.make(kind='求对称轴');self.make(label='二次函数顶点式')
        groups=self.groups();self.assertEqual(len(groups),3)
        self.assertTrue(all(g['basis']=='LABEL_ONLY' for g in groups))

    def test_draft_rebinding_does_not_move_confirmed_evidence(self):
        m=self.material();p=self.make(self.ref(m));self.make(self.ref(m))
        q=p['questions'];q[0]['teaching_ref']=self.ref(m,1)
        saved=self.store.save_paper(p['id'],dict(version=1,questions=q))
        groups=self.groups();self.assertEqual(len(groups),1)
        self.assertEqual(groups[0]['wrong_count'],2)
        self.assertEqual(groups[0]['teaching_entry']['entry_id'],m['entries'][0]['id'])
        self.store.confirm(saved['id'],saved['version'],True)
        self.assertEqual(len(self.groups()),2)
        self.assertEqual(len(self.store.profile('SYN-A')['events']),3)

    def test_same_documents_duplicate_keeps_last_group_only(self):
        m=self.material();raw=io.BytesIO();Image.new('RGB',(25,25),'red').save(raw,format='PNG')
        doc=save_document(self.store.root,'synthetic-work.png',raw.getvalue())
        self.make(self.ref(m),documents=[doc]);self.make(self.ref(m,1),documents=[doc])
        profile=self.store.profile('SYN-A');groups=profile['learning_analysis']['groups']
        self.assertEqual(len(groups),1);self.assertEqual(groups[0]['wrong_count'],1)
        self.assertEqual(groups[0]['teaching_entry']['entry_id'],m['entries'][1]['id'])
        self.assertEqual(profile['archive_summary']['duplicate_count'],1)

    def test_partial_pending_missing_and_right_keep_distinct_evidence(self):
        m=self.material()
        for kind,result in [('求顶点','PARTIAL'),('求对称轴','PENDING'),('平移','MISSING'),('作图','CORRECT')]:self.make(self.ref(m),kind=kind,result=result)
        g=self.groups()[0];self.assertEqual(g['wrong_count'],1)
        self.assertEqual(g['wrong_paper_count'],1)
        self.assertEqual(g['counts'],dict(CORRECT=1,INCORRECT=0,PARTIAL=1,PENDING=1,MISSING=1))

    def test_knowledge_group_remains_separate_for_each_student(self):
        m=self.material();self.make(self.ref(m));self.make(self.ref(m),student='SYN-B')
        self.assertEqual(self.groups()[0]['wrong_count'],1)
        self.assertEqual(self.groups('SYN-B')[0]['wrong_count'],1)

    def test_reconfirmed_correct_updates_group_without_removing_history(self):
        m=self.material();p=self.make(self.ref(m));q=p['questions'];q[0]['result']='CORRECT'
        saved=self.store.save_paper(p['id'],dict(version=1,questions=q));self.store.confirm(p['id'],saved['version'],True)
        g=self.groups()[0];self.assertEqual(g['wrong_count'],0);self.assertEqual(g['signal'],'NO_CURRENT_ERROR')
        self.assertIsNone(g['practice_source']);self.assertEqual(len(self.store.profile('SYN-A')['events']),2)

    def test_stable_group_id_survives_renaming(self):
        m=self.material();self.make(self.ref(m));ident=self.groups()[0]['id']
        new=self.lib.save(m['id'],m['version'],dict(entries=[e|dict(knowledge='改名') for e in m['entries']]))
        new=self.lib.approve(new['id'],new['version'],True);self.make(self.ref(new))
        self.assertEqual(len(self.groups()),1);self.assertEqual(self.groups()[0]['id'],ident)
