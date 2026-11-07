"""Synthetic local teaching references; no student files or model network calls."""
import io
from pathlib import Path
import sys
import tempfile
import unittest

sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from docx import Document
from store import Store, ValidationError, ConflictError, checked_questions
from files import save_document
from test_core import questions
try:
    from teaching import Library
except ImportError:
    Library=None


class TeachingTests(unittest.TestCase):
    def setUp(self):
        self.assertIsNotNone(Library,'尚未实现本地教学资料库')
        folder=Path(__file__).resolve().parents[1]/'.qa-temp';folder.mkdir(exist_ok=True)
        self.tmp=tempfile.TemporaryDirectory(dir=folder);self.addCleanup(self.tmp.cleanup)
        self.store=Store(self.tmp.name);self.lib=Library(self.store)
        raw=io.BytesIO();doc=Document();doc.add_paragraph('合成分式教案：分母不能为零');doc.save(raw)
        self.doc=save_document(self.store.root,'synthetic-lesson.docx',raw.getvalue())

    def source(self):
        return self.lib.create(dict(document_id=self.doc['id'],title='合成分式教案',kind='教案',scope='初中数学·分式',edition='合成V1'))

    def entry(self,**fields):
        return dict(knowledge='分式取值限制',locator='第一节，第1段',content='分母不能为零；化简后仍保留原限制。',question_type='化简并求值')|fields

    def approved(self):
        m=self.source();m=self.lib.save(m['id'],m['version'],dict(entries=[self.entry()]))
        return self.lib.approve(m['id'],m['version'],True)

    def reference(self,m):
        return dict(material_id=m['id'],version=m['version'],entry_id=m['entries'][0]['id'])

    def paper(self,ref):
        q=questions();q[0]['knowledge']='分式取值限制';q[0]['teaching_ref']=ref
        return self.store.create_paper(dict(student_ref='SYN-REF',batch_id='SYN-REF',title='合成卷',questions=q))

    def test_import_stays_draft_and_preview_is_local(self):
        m=self.source()
        self.assertEqual(m['status'],'DRAFT');self.assertEqual(m['entries'],[])
        self.assertIn('分母不能为零',m['document']['extracted_text'])
        self.assertEqual(self.lib.catalog(),[])

    def test_same_document_hash_is_idempotent(self):
        a=self.source();b=self.source()
        self.assertEqual(a['id'],b['id']);self.assertEqual(len(self.lib.list()),1)

    def test_file_cannot_supply_approval(self):
        m=self.lib.create(dict(document_id=self.doc['id'],scope='初中数学',status='APPROVED',consent=True))
        self.assertEqual(m['status'],'DRAFT')
        with self.assertRaises(ValidationError):self.lib.approve(m['id'],m['version'],False)

    def test_approval_needs_entry_and_locator(self):
        m=self.source()
        with self.assertRaises(ValidationError):self.lib.approve(m['id'],m['version'],True)
        m=self.lib.save(m['id'],m['version'],dict(entries=[self.entry(locator='')]))
        with self.assertRaises(ValidationError):self.lib.approve(m['id'],m['version'],True)

    def test_approved_entry_is_in_catalog_with_source(self):
        m=self.approved();entry=self.lib.catalog()[0]
        self.assertEqual(entry['reference'],self.reference(m))
        self.assertEqual(entry['locator'],'第一节，第1段')
        self.assertEqual(entry['source_title'],'合成分式教案')

    def test_source_revision_does_not_rewrite_old_reference(self):
        m=self.approved();ref=self.reference(m)
        m2=self.lib.save(m['id'],m['version'],dict(entries=[m['entries'][0]|dict(content='新草稿内容')]))
        self.assertEqual(m2['status'],'DRAFT')
        old=self.lib.reference(ref)
        self.assertEqual(old['content'],self.entry()['content']);self.assertFalse(old['is_current'])
        self.assertEqual(self.lib.catalog()[0]['reference'],ref)
        with self.assertRaises(ConflictError):self.lib.save(m['id'],m['version'],dict(entries=[]))

    def test_unapproved_or_wrong_entry_reference_is_rejected(self):
        m=self.source();m=self.lib.save(m['id'],m['version'],dict(entries=[self.entry()]))
        with self.assertRaises(ValidationError):self.paper(self.reference(m))
        m=self.lib.approve(m['id'],m['version'],True)
        with self.assertRaises(ValidationError):self.paper(self.reference(m)|dict(entry_id='a'*32))

    def test_selected_reference_roundtrips_to_history(self):
        m=self.approved();ref=self.reference(m);p=self.paper(ref)
        self.store.confirm(p['id'],1,True)
        self.assertEqual(self.store.profile(p['student_id'])['events'][0]['question']['teaching_ref'],ref)
        info=self.lib.paper_links(p['id'])['links']['Q01']
        self.assertEqual(info['source_title'],'合成分式教案')

    def test_knowledge_must_match_selected_entry(self):
        m=self.approved();p=self.paper(self.reference(m));q=p['questions'];q[0]['knowledge']='另一知识点'
        with self.assertRaises(ValidationError):self.store.save_paper(p['id'],dict(version=1,questions=q))

    def test_import_cannot_replace_or_remove_local_reference(self):
        m=self.approved();ref=self.reference(m);p=self.paper(ref)
        q=p['questions'];q[0]['teaching_ref']=None
        p=self.store.save_paper(p['id'],dict(version=1,questions=q,imported=True))
        self.assertEqual(p['questions'][0]['teaching_ref'],ref)

    def test_import_preserves_bound_knowledge_even_when_incoming_label_differs(self):
        m=self.approved();ref=self.reference(m);p=self.paper(ref)
        q=p['questions'];q[0]['knowledge']='导入文本的另一分类';q[0]['teaching_ref']=None
        p=self.store.save_paper(p['id'],dict(version=1,questions=q,imported=True))
        self.assertEqual(p['questions'][0]['teaching_ref'],ref)
        self.assertEqual(p['questions'][0]['knowledge'],'分式取值限制')

    def test_ocr_and_ai_keep_selected_reference_and_knowledge(self):
        import grading,vision
        m=self.approved();ref=self.reference(m);p=self.paper(ref);q=p['questions'][0]
        result=grading.merge_suggestion(q,dict(result='INCORRECT',correct_answer='参考',knowledge='模型另拟标签',cause='待核实'))
        self.assertEqual(checked_questions([result])[0]['teaching_ref'],ref)
        self.assertEqual(result['knowledge'],'分式取值限制')
        new=vision.merge_transcription(dict(metadata={}),p,[q|dict(answer='新转写',knowledge='',result='PENDING')])[0]
        self.assertEqual(new['teaching_ref'],ref);self.assertEqual(new['knowledge'],'分式取值限制')

    def test_reference_shape_rejects_boolean_version(self):
        for ref in ({'material_id':'a'*32,'version':True,'entry_id':'b'*32},{'material_id':'../x','version':1,'entry_id':'b'*32}):
            with self.assertRaises(ValidationError):checked_questions([questions()[0]|dict(teaching_ref=ref)])

    def test_backup_restore_preserves_material_and_pinned_reference(self):
        m=self.approved();ref=self.reference(m);p=self.paper(ref);self.store.confirm(p['id'],1,True)
        backup=self.store.backup();self.store.restore(backup['id'],'RESTORE')
        self.assertEqual(Library(self.store).reference(ref)['content'],self.entry()['content'])
        self.assertEqual(self.store.get_paper(p['id'])['questions'][0]['teaching_ref'],ref)

    def test_import_checks_actual_source_hash(self):
        p=self.store.root/'documents'/self.doc['storage_name'];p.write_bytes(b'changed')
        with self.assertRaises(ValidationError):self.source()

    def test_history_and_teacher_report_include_pinned_source(self):
        from exporting import export_content
        m=self.approved();ref=self.reference(m);p=self.paper(ref);self.store.confirm(p['id'],1,True)
        self.lib.save(m['id'],m['version'],dict(entries=[m['entries'][0]|dict(content='另一个新草稿')]))
        event=self.store.profile(p['student_id'])['events'][0]
        evidence=self.store.student_evidence(p['student_id'],event['id'])
        self.assertEqual(evidence['teaching_reference']['content'],self.entry()['content'])
        _,blocks=export_content(self.store,'paper',p['id'],'teacher',1)
        text='\n'.join(body for _,body in blocks)
        self.assertIn('第一节，第1段',text);self.assertIn('合成分式教案',text)

    def test_changed_original_cannot_be_approved(self):
        m=self.source();m=self.lib.save(m['id'],m['version'],dict(entries=[self.entry()]))
        (self.store.root/'documents'/self.doc['storage_name']).write_bytes(b'changed after import')
        with self.assertRaises(ValidationError):self.lib.approve(m['id'],m['version'],True)

    def test_restore_missing_library_original_rejected_before_replacement(self):
        import hashlib,json,zipfile
        m=self.approved();ref=self.reference(m);p=self.paper(ref)
        backup=self.store.backup();path=self.store.backup_path(backup['id'])
        with zipfile.ZipFile(path) as archive:
            files={name:archive.read(name) for name in archive.namelist() if name!='manifest.json'}
        del files['documents/'+self.doc['storage_name']]
        manifest={name:hashlib.sha256(raw).hexdigest() for name,raw in files.items()}
        with zipfile.ZipFile(path,'w',compression=zipfile.ZIP_DEFLATED) as archive:
            for name,raw in files.items():archive.writestr(name,raw)
            archive.writestr('manifest.json',json.dumps(manifest))
        with self.assertRaises(ValidationError):self.store.restore(backup['id'],'RESTORE')
        self.assertEqual(self.store.get_paper(p['id'])['questions'][0]['teaching_ref'],ref)

    def damaged_backup(self,mutate):
        import hashlib,json,sqlite3,zipfile
        backup=self.store.backup();path=self.store.backup_path(backup['id'])
        with zipfile.ZipFile(path) as archive:
            files={name:archive.read(name) for name in archive.namelist() if name!='manifest.json'}
        stage=self.store.root/'synthetic-backup-edit.sqlite3';stage.write_bytes(files['database.sqlite3'])
        db=sqlite3.connect(stage)
        try:
            with db:mutate(db,files)
        finally:db.close()
        files['database.sqlite3']=stage.read_bytes()
        with zipfile.ZipFile(path,'w',compression=zipfile.ZIP_DEFLATED) as archive:
            for name,raw in files.items():archive.writestr(name,raw)
            archive.writestr('manifest.json',json.dumps({name:hashlib.sha256(raw).hexdigest() for name,raw in files.items()}))
        return backup['id']

    def test_restore_rejects_header_source_identity_mismatch(self):
        m=self.approved();ref=self.reference(m);p=self.paper(ref)
        def mutate(db,files):
            db.execute('UPDATE teaching_materials SET document_id=?,document_sha256=? WHERE id=?',('a'*32,'b'*64,m['id']))
        ident=self.damaged_backup(mutate)
        with self.assertRaises(ValidationError):self.store.restore(ident,'RESTORE')
        self.assertEqual(self.lib.reference(ref)['content'],self.entry()['content'])
        self.assertEqual(self.store.get_paper(p['id'])['version'],1)

    def test_restore_rejects_nonmath_material_body(self):
        import json
        m=self.approved()
        def mutate(db,files):
            for table in ('teaching_materials','teaching_material_versions'):
                rows=db.execute('SELECT rowid,body_json FROM '+table).fetchall()
                for rowid,raw in rows:
                    body=json.loads(raw);body['subject']='英语'
                    db.execute('UPDATE '+table+' SET body_json=? WHERE rowid=?',(json.dumps(body),rowid))
        ident=self.damaged_backup(mutate)
        with self.assertRaises(ValidationError):self.store.restore(ident,'RESTORE')
        self.assertEqual(self.lib.get(m['id'])['subject'],'数学')

    def test_restore_rejects_original_metadata_identity_mismatch(self):
        import json
        m=self.approved()
        def mutate(db,files):
            name='documents/'+self.doc['id']+'.json';meta=json.loads(files[name]);meta['id']='a'*32
            files[name]=json.dumps(meta).encode()
        ident=self.damaged_backup(mutate)
        with self.assertRaises(ValidationError):self.store.restore(ident,'RESTORE')
        self.assertEqual(self.lib.get(m['id'])['document']['id'],self.doc['id'])
