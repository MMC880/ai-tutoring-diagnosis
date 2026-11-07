"""Synthetic per-student archive and immutable evidence contract."""
import io
from pathlib import Path
import sys
import tempfile
import unittest

sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from PIL import Image
from store import Store, ValidationError
from files import save_document


class StudentArchiveTests(unittest.TestCase):
    def setUp(self):
        folder=Path(__file__).resolve().parents[1]/'.qa-temp';folder.mkdir(exist_ok=True)
        self.tmp=tempfile.TemporaryDirectory(dir=folder);self.addCleanup(self.tmp.cleanup)
        self.store=Store(self.tmp.name)

    def photo(self):
        raw=io.BytesIO();Image.new('RGB',(40,40),'blue').save(raw,format='PNG')
        return save_document(self.store.root,'synthetic.png',raw.getvalue())|dict(role='作业')

    def make(self,student='A',batch='B1',result='INCORRECT',documents=None,knowledge='分式取值限制',confirmed=True):
        q=dict(id='Q01',stem='化简并写限制',answer='x+1',correct_answer='x+1，x≠1',result=result,
               knowledge=knowledge,cause='待核实',teacher_result=result,teacher_mark='合成原批注')
        p=self.store.create_paper(dict(student_ref=student,student_name='合成学生'+student,batch_id=batch,
                                      title='合成数学卷',documents=documents or [],questions=[q]))
        if confirmed:self.store.confirm(p['id'],1,True)
        return p

    def evidence(self,p):
        return self.store.profile(p['student_id'])['events'][0]

    def test_student_archive_counts_and_source_are_isolated(self):
        a=self.make();b=self.make('B',result='CORRECT')
        archive=self.store.profile(a['student_id'])
        self.assertEqual(archive.get('archive_summary',{}).get('counts',{}).get('INCORRECT'),1)
        self.assertEqual(len(archive['current_evidence']),1)
        self.assertTrue(all(e['student_id']==a['student_id'] for e in archive['events']))
        with self.assertRaises(ValidationError):self.store.student_evidence(b['student_id'],self.evidence(a)['id'])

    def test_old_snapshot_keeps_original_answer_and_teacher_note(self):
        p=self.make();event=self.evidence(p)
        q=p['questions'];q[0].update(answer='新作答记录',teacher_mark='新的老师批注',cause='新的核对说明')
        p=self.store.save_paper(p['id'],dict(version=1,questions=q))
        out=self.store.student_evidence(p['student_id'],event['id'])
        self.assertEqual(out['event']['question']['answer'],'x+1')
        self.assertEqual(out['event']['question']['teacher_mark'],'合成原批注')
        self.assertTrue(out['has_pending_revision']);self.assertTrue(out['is_latest'])
        self.store.confirm(p['id'],p['version'],True)
        out=self.store.student_evidence(p['student_id'],event['id'])
        self.assertFalse(out['is_latest']);self.assertNotEqual(out['latest_event_id'],event['id'])
        self.assertEqual(out['event']['question']['answer'],'x+1')

    def test_same_photo_deduplicates_summary_without_erasing_history(self):
        doc=self.photo();p=self.make(documents=[doc]);self.make(batch='B2',documents=[doc])
        archive=self.store.profile(p['student_id'])
        self.assertEqual(archive['archive_summary']['counts']['INCORRECT'],1)
        self.assertEqual(len(archive['current_evidence']),1)
        self.assertEqual(len(archive['events']),2)
        self.assertEqual(archive['archive_summary']['duplicate_count'],1)

    def test_same_photo_other_student_does_not_share_evidence(self):
        doc=self.photo();a=self.make(documents=[doc]);b=self.make('B',documents=[doc])
        for p in (a,b):
            archive=self.store.profile(p['student_id'])
            self.assertEqual(archive['archive_summary']['counts']['INCORRECT'],1)
            self.assertEqual(archive['archive_summary']['duplicate_count'],0)

    def test_unclassified_confirmed_question_still_counts(self):
        p=self.make(knowledge='')
        archive=self.store.profile(p['student_id'])
        self.assertEqual(archive['archive_summary']['counts']['INCORRECT'],1)
        self.assertEqual(archive['learning_analysis']['unclassified_count'],1)

    def test_drafts_are_not_confirmed_evidence(self):
        p=self.make(confirmed=False)
        archive=self.store.profile(p['student_id'])
        self.assertEqual(archive['archive_summary']['pending_papers'],1)
        self.assertEqual(archive['archive_summary']['confirmed_papers'],0)
        self.assertEqual(archive['current_evidence'],[])

    def test_source_documents_are_from_the_matched_paper(self):
        doc=self.photo();p=self.make(documents=[doc]);event=self.evidence(p)
        out=self.store.student_evidence(p['student_id'],event['id'])
        self.assertEqual(out['paper']['id'],p['id'])
        self.assertEqual(out['student']['id'],p['student_id'])
        self.assertEqual([d['id'] for d in out['documents']],[doc['id']])

    def test_invalid_event_ids_are_rejected(self):
        p=self.make()
        for value in (True,0,-1,'1 OR 1=1',None,1000000):
            with self.subTest(value=value):
                with self.assertRaises(ValidationError):self.store.student_evidence(p['student_id'],value)

    def test_backup_restore_keeps_event_and_attachment_trace(self):
        doc=self.photo();p=self.make(documents=[doc]);event=self.evidence(p)
        backup=self.store.backup();self.store.restore(backup['id'],'RESTORE')
        out=self.store.student_evidence(p['student_id'],event['id'])
        self.assertEqual(out['event']['question']['teacher_mark'],'合成原批注')
        self.assertEqual(out['documents'][0]['sha256'],doc['sha256'])

    def test_pending_new_draft_keeps_last_confirmed_archive(self):
        p=self.make();q=p['questions'];q[0]['result']='PENDING'
        self.store.save_paper(p['id'],dict(version=1,questions=q))
        archive=self.store.profile(p['student_id'])
        self.assertEqual(archive['current_evidence'][0]['result'],'INCORRECT')
        self.assertEqual(archive['archive_summary']['pending_papers'],1)

    def test_same_pdf_and_word_file_repeat_is_one_current_record(self):
        from pypdf import PdfWriter
        from docx import Document
        pdf=io.BytesIO();writer=PdfWriter();writer.add_blank_page(width=595,height=842);writer.write(pdf)
        word=io.BytesIO();document=Document();document.add_paragraph('Synthetic original answer');document.save(word)
        for index,(name,raw) in enumerate((('synthetic.pdf',pdf.getvalue()),('synthetic.docx',word.getvalue()))):
            with self.subTest(name=name):
                doc=save_document(self.store.root,name,raw)|dict(role='作业')
                p=self.make(student='FILE'+str(index),batch='F1',documents=[doc])
                self.make(student='FILE'+str(index),batch='F2',documents=[doc])
                archive=self.store.profile(p['student_id'])
                self.assertEqual(archive['archive_summary']['current_records'],1)
                self.assertEqual(archive['archive_summary']['duplicate_count'],1)
                self.assertEqual(len(archive['events']),2)
