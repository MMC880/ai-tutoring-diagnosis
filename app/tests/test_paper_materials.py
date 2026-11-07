"""Local synthetic material revision, never teacher approval of grades."""
import io,sys,tempfile,unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from store import Store,ValidationError,ConflictError
from files import save_document
from test_core import questions
try:from paper_materials import update_documents
except ImportError:update_documents=None

class PaperMaterialsTests(unittest.TestCase):
 def setUp(self):
  self.assertIsNotNone(update_documents,'原卷补交接口尚未实现')
  root=Path(__file__).resolve().parents[1]/'.qa-temp';root.mkdir(exist_ok=True)
  self.tmp=tempfile.TemporaryDirectory(dir=root);self.addCleanup(self.tmp.cleanup);self.store=Store(self.tmp.name)
  self.a,self.b=self.photo('red'),self.photo('blue')
  self.paper=self.store.create_paper(dict(student_ref='SYN-A',student_name='合成A',batch_id='SYN-M',title='合成卷',questions=questions(),documents=[self.a]))
 def photo(self,color):
  from PIL import Image
  raw=io.BytesIO();Image.new('RGB',(20,20),color).save(raw,format='PNG')
  return save_document(self.store.root,'合成.png',raw.getvalue())
 def payload(self,docs=None,**changes):
  return dict(version=1,student_id=self.paper['student_id'],documents=docs if docs is not None else [self.a,self.b],consent=True)|changes
 def update(self,payload=None):return update_documents(self.store,self.paper['id'],payload or self.payload())
 def test_append_creates_new_draft_without_changing_questions(self):
  result=self.update();self.assertEqual((result['version'],result['confirmed_version']),(2,0));self.assertEqual(result['questions'],self.paper['questions']);self.assertEqual([d['id'] for d in result['documents']],[self.a['id'],self.b['id']]);self.assertEqual(self.store.event_count(),0)
 def test_reordering_preserves_every_existing_document(self):
  first=self.update();p=self.payload([self.b,self.a],version=2);result=self.update(p)
  self.assertEqual(result['version'],3);self.assertEqual([d['id'] for d in result['documents']],[self.b['id'],self.a['id']])
 def test_unchanged_order_is_noop(self):
  result=self.update(self.payload([self.a]));self.assertEqual(result['version'],1)
 def test_confirmation_history_and_missing_not_auto_resolved(self):
  qs=questions();qs[0]['result']='MISSING';self.store.save_paper(self.paper['id'],dict(version=1,questions=qs));self.store.confirm(self.paper['id'],2,True)
  before=self.store.profile(self.paper['student_id'])['events'];result=self.update(self.payload(version=2))
  self.assertEqual((result['version'],result['confirmed_version']),(3,2));self.assertEqual(result['questions'][0]['result'],'MISSING');self.assertEqual(self.store.profile(self.paper['student_id'])['events'],before)
 def test_student_mismatch_refused_without_write(self):
  with self.assertRaises(ConflictError):self.update(self.payload(student_id='0'*32))
  self.assertEqual(self.store.get_paper(self.paper['id']),self.paper)
 def test_stale_version_replay_refused_without_extra_attachment(self):
  self.update()
  with self.assertRaises(ConflictError):self.update()
  self.assertEqual(len(self.store.get_paper(self.paper['id'])['documents']),2)
 def test_version_must_be_integer_not_boolean_or_float(self):
  for v in (True,1.0,'1',None):
   with self.subTest(version=v):
    with self.assertRaises(ValidationError):self.update(self.payload(version=v))
 def test_explicit_material_consent_required(self):
  for v in (False,'true',1,None):
   with self.subTest(consent=v):
    with self.assertRaises(ValidationError):self.update(self.payload(consent=v))
 def test_cannot_delete_or_replace_existing_documents(self):
  for docs in ([],[self.b]):
   with self.subTest(docs=bool(docs)):
    with self.assertRaises(ValidationError):self.update(self.payload(docs))
  self.assertEqual(self.store.get_paper(self.paper['id']),self.paper)
 def test_cannot_relabel_old_assignment_as_reference(self):
  with self.assertRaises(ValidationError):self.update(self.payload([dict(id=self.a['id'],role='参考答案')]))
 def test_duplicate_attachment_id_refused(self):
  with self.assertRaises(ValidationError):self.update(self.payload([self.a,self.a]))
 def test_reference_new_file_keeps_role(self):
  result=self.update(self.payload([self.a,dict(id=self.b['id'],role='参考答案')]))
  self.assertEqual(result['documents'][1]['role'],'参考答案')
 def test_more_than_twenty_and_missing_file_refused(self):
  for docs in ([self.a]+[self.b]*20,[self.a,dict(id='f'*32,role='作业')]):
   with self.subTest(count=len(docs)):
    with self.assertRaises(ValidationError):self.update(self.payload(docs))
  self.assertEqual(self.store.get_paper(self.paper['id']),self.paper)
 def test_backup_restores_new_material_order_and_old_confirmation(self):
  self.store.confirm(self.paper['id'],1,True);result=self.update();backup=self.store.backup()
  self.update(self.payload([self.b,self.a],version=2));self.store.restore(backup['id'],'RESTORE')
  self.assertEqual(self.store.get_paper(self.paper['id']),result);self.assertEqual(self.store.event_count(),2)
 def test_old_confirmation_uses_original_documents_after_supplement(self):
  self.store.confirm(self.paper['id'],1,True);event=self.store.profile(self.paper['student_id'])['events'][0]
  self.update();evidence=self.store.student_evidence(self.paper['student_id'],event['id'])
  self.assertEqual([d['id'] for d in evidence['documents']],[self.a['id']])
 def test_unconfirmed_supplement_does_not_change_duplicate_evidence(self):
  self.store.confirm(self.paper['id'],1,True)
  p=self.store.create_paper(dict(student_ref='SYN-A',student_name='合成A',batch_id='SYN-M2',title='合成重传卷',questions=questions(),documents=[self.a]));self.store.confirm(p['id'],1,True)
  before=self.store.profile(self.paper['student_id'])['archive_summary'];self.update()
  after=self.store.profile(self.paper['student_id'])['archive_summary']
  self.assertEqual(after['current_records'],before['current_records']);self.assertEqual(after['duplicate_count'],before['duplicate_count'])
 def test_first_change_keeps_original_material_anchor(self):
  self.update()
  with self.store.db() as db:versions=[r[0] for r in db.execute('SELECT version FROM paper_document_versions ORDER BY version')]
  self.assertEqual(versions,[0,1,2])
 def test_restore_rejects_missing_original_anchor_without_changing_live_records(self):
  import hashlib,json,sqlite3,zipfile
  self.update();before=self.store.get_paper(self.paper['id']);backup=self.store.backup();path=self.store.backup_path(backup['id'])
  with zipfile.ZipFile(path) as z:parts={name:z.read(name) for name in z.namelist() if name!='manifest.json'}
  staged=self.store.root/'synthetic-edit.sqlite3';staged.write_bytes(parts['database.sqlite3']);db=sqlite3.connect(staged)
  try:
   with db:db.execute('DELETE FROM paper_document_versions WHERE version=0')
  finally:db.close()
  parts['database.sqlite3']=staged.read_bytes()
  with zipfile.ZipFile(path,'w',zipfile.ZIP_DEFLATED) as z:
   for name,raw in parts.items():z.writestr(name,raw)
   z.writestr('manifest.json',json.dumps({name:hashlib.sha256(raw).hexdigest() for name,raw in parts.items()}))
  with self.assertRaises(ValidationError):self.store.restore(backup['id'],'RESTORE')
  self.assertEqual(self.store.get_paper(self.paper['id']),before)

 def test_restore_rejects_all_material_history_deleted(self):
  import hashlib,json,sqlite3,zipfile
  self.update();before=self.store.get_paper(self.paper['id']);backup=self.store.backup();path=self.store.backup_path(backup['id'])
  with zipfile.ZipFile(path) as z:parts={name:z.read(name) for name in z.namelist() if name!='manifest.json'}
  staged=self.store.root/'synthetic-edit.sqlite3';staged.write_bytes(parts['database.sqlite3']);db=sqlite3.connect(staged)
  try:
   with db:db.execute('DELETE FROM paper_document_versions')
  finally:db.close()
  parts['database.sqlite3']=staged.read_bytes()
  with zipfile.ZipFile(path,'w',zipfile.ZIP_DEFLATED) as z:
   for name,raw in parts.items():z.writestr(name,raw)
   z.writestr('manifest.json',json.dumps({name:hashlib.sha256(raw).hexdigest() for name,raw in parts.items()}))
  with self.assertRaises(ValidationError):self.store.restore(backup['id'],'RESTORE')
  self.assertEqual(self.store.get_paper(self.paper['id']),before)
 def test_legacy_backup_without_material_schema_restores_additively(self):
  import hashlib,json,sqlite3,zipfile
  backup=self.store.backup();path=self.store.backup_path(backup['id'])
  with zipfile.ZipFile(path) as z:parts={name:z.read(name) for name in z.namelist() if name!='manifest.json'}
  stage=self.store.root/'synthetic-legacy.sqlite3';stage.write_bytes(parts['database.sqlite3']);db=sqlite3.connect(stage)
  try:
   with db:
    db.execute('DROP TABLE paper_document_versions');db.execute('ALTER TABLE meta DROP COLUMN material_history_papers')
  finally:db.close()
  parts['database.sqlite3']=stage.read_bytes()
  with zipfile.ZipFile(path,'w',zipfile.ZIP_DEFLATED) as z:
   for name,raw in parts.items():z.writestr(name,raw)
   z.writestr('manifest.json',json.dumps({name:hashlib.sha256(raw).hexdigest() for name,raw in parts.items()}))
  self.update();self.store.restore(backup['id'],'RESTORE');self.assertEqual(self.store.get_paper(self.paper['id']),self.paper)
  self.update();self.assertEqual(self.store.get_paper(self.paper['id'])['version'],2)
