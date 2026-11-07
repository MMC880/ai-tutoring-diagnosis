"""Synthetic batch intake metadata; no actual student input or model calls."""
import hashlib,io,json,sys,tempfile,unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from store import Store
from files import save_document
from test_core import questions
try:from intake import intake_overview
except ImportError:intake_overview=None

class IntakeTests(unittest.TestCase):
 def setUp(self):
  self.assertIsNotNone(intake_overview,'批次收件摘要尚未实现')
  root=Path(__file__).resolve().parents[1]/'.qa-temp';root.mkdir(exist_ok=True)
  self.tmp=tempfile.TemporaryDirectory(dir=root);self.addCleanup(self.tmp.cleanup);self.store=Store(self.tmp.name)
 def paper(self,ref='SYN-01',batch='SYN-B1',qs=None,docs=None):
  return self.store.create_paper(dict(student_ref=ref,student_name='合成'+ref,batch_id=batch,title='合成卷',questions=qs or questions(),documents=docs or []))
 def photo(self,color='white'):
  from PIL import Image
  data=io.BytesIO();Image.new('RGB',(40,40),color).save(data,format='PNG')
  return save_document(self.store.root,'合成照片.png',data.getvalue())
 def batch(self):return intake_overview(self.store)['batches'][0]
 def test_empty_has_no_invented_roster_or_missing_students(self):
  self.assertEqual(intake_overview(self.store),dict(batches=[]))
 def test_only_received_papers_and_minimal_metadata(self):
  p=self.paper();b=self.batch();r=b['papers'][0]
  self.assertEqual((b['paper_count'],b['waiting_papers'],b['confirmed_papers']),(1,1,0))
  self.assertEqual((r['id'],r['student_ref'],r['review_state']),(p['id'],'SYN-01','DRAFT'))
  self.assertNotIn('questions',r);self.assertNotIn('documents',r);self.assertNotIn('stem',json.dumps(b));self.assertNotIn('answer',json.dumps(b))
  self.assertIsNone(b['expected_students']);self.assertIsNone(r['expected_pages'])
 def test_confirmed_missing_and_pending_are_not_finished(self):
  qs=questions();qs[0]['result']='MISSING';qs[1]['result']='PENDING'
  p=self.paper(qs=qs);self.store.confirm(p['id'],1,True)
  b=self.batch();r=b['papers'][0]
  self.assertEqual((b['confirmed_papers'],b['issue_papers']),(1,1))
  self.assertEqual((r['pending_questions'],r['missing_questions'],r['review_state']),(1,1,'CONFIRMED'))
 def test_revision_needs_review_again(self):
  p=self.paper();self.store.confirm(p['id'],1,True);qs=questions();qs[0]['answer']='修订答案'
  self.store.save_paper(p['id'],dict(version=1,questions=qs));r=self.batch()['papers'][0]
  self.assertEqual((r['review_state'],r['version'],r['confirmed_version']),('REVISED',2,1));self.assertEqual(self.batch()['waiting_papers'],1)
 def test_same_content_reupload_warned_without_merging(self):
  a,b=self.photo(),self.photo();self.assertNotEqual(a['id'],b['id']);p=self.paper(docs=[a,b])
  row=self.batch()['papers'][0]
  self.assertEqual((row['assignment_attachments'],row['photo_count'],row['duplicate_attachments']),(2,2,1))
  self.assertEqual(len(self.store.get_paper(p['id'])['documents']),2)
 def test_cross_student_same_photo_is_ownership_hint_not_dedup(self):
  a=self.paper(docs=[self.photo()]);b=self.paper(ref='SYN-02',docs=[self.photo()]);rows=self.batch()['papers']
  self.assertEqual(len(rows),2)
  for row in rows:
   others=row['shared_photos'];self.assertEqual(len(others),1);self.assertNotEqual(others[0]['student_id'],row['student_id'])
  self.assertEqual(self.store.event_count(),0);self.assertEqual({r['id'] for r in rows},{a['id'],b['id']})
 def test_same_printed_question_different_photo_not_duplicate(self):
  self.paper(docs=[self.photo('red')]);self.paper(ref='SYN-02',docs=[self.photo('blue')])
  self.assertTrue(all(not row['shared_photos'] for row in self.batch()['papers']))
 def test_reference_photos_never_count_as_assignment_or_duplicate(self):
  doc=self.photo();self.paper(docs=[dict(id=doc['id'],role='参考答案')]);self.paper(ref='SYN-02',docs=[doc])
  rows=self.batch()['papers'];first=next(r for r in rows if r['student_ref']=='SYN-01')
  self.assertEqual((first['assignment_attachments'],first['reference_attachments'],first['photo_count']),(0,1,0));self.assertTrue(all(not r['shared_photos'] for r in rows))
 def test_same_student_other_batch_not_cross_student_warning(self):
  doc=self.photo();self.paper(docs=[doc]);self.paper(batch='SYN-B2',docs=[doc])
  result=intake_overview(self.store);self.assertEqual(len(result['batches']),2);self.assertTrue(all(not b['papers'][0]['shared_photos'] for b in result['batches']))
 def test_issue_counter_counts_papers_not_number_of_flags(self):
  qs=questions();qs[0]['result']='MISSING';qs[1]['result']='PENDING';self.paper(qs=qs,docs=[self.photo(),self.photo()])
  self.assertEqual(self.batch()['issue_papers'],1)
 def test_unresolved_recognition_and_teacher_disagreement_flagged(self):
  qs=questions();qs[0].update(recognition_notes='字迹待核',recognition_resolved=False);qs[0]['result']='PENDING'
  qs[1].update(teacher_result='INCORRECT',ai_result='CORRECT',grading_resolved=False)
  self.paper(qs=qs);r=self.batch()['papers'][0]
  self.assertEqual(r['recognition_questions'],1);self.assertEqual(r['grading_questions'],1)
 def test_repeat_read_is_zero_write_and_no_body_exposure(self):
  self.paper(docs=[self.photo()]);db=self.store.root/'records.sqlite3'
  before=hashlib.sha256(db.read_bytes()).hexdigest();first=intake_overview(self.store);second=intake_overview(self.store)
  self.assertEqual(first,second);self.assertEqual(hashlib.sha256(db.read_bytes()).hexdigest(),before)
  self.assertNotIn('extracted_text',json.dumps(first));self.assertEqual(self.store.event_count(),0)
 def test_clearing_doubt_text_does_not_clear_unresolved_flag(self):
  qs=questions();qs[0].update(result='PENDING',recognition_notes='',recognition_resolved=False)
  self.paper(qs=qs);self.assertEqual(self.batch()['papers'][0]['recognition_questions'],1)
 def test_notice_only_is_unresolved_but_ordinary_pending_is_not_recognition(self):
  qs=questions();qs[0].update(result='PENDING',recognition_notice='原图有识读疑点',recognition_resolved=False);qs[1]['result']='PENDING'
  self.paper(qs=qs);r=self.batch()['papers'][0]
  self.assertEqual((r['recognition_questions'],r['pending_questions']),(1,2))
