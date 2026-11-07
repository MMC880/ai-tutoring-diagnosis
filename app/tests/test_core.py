import base64
import io
import json
from pathlib import Path
import sqlite3
import sys
import tempfile
import unittest
import zipfile

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
try:
    from store import Store, ValidationError, ConflictError
    from files import save_document
except ModuleNotFoundError:
    Store = None


def questions():
    return [dict(id='Q01', stem='求顶点', answer='(-2,3)', result='INCORRECT',
                 correct_answer='(2,3)', knowledge='顶点式', cause='待核实'),
            dict(id='Q02', stem='解方程', answer='2或3', result='CORRECT',
                 correct_answer='2或3', knowledge='方程', cause='')]


class LocalCoreTests(unittest.TestCase):
    def setUp(self):
        self.assertIsNotNone(Store, '尚未实现本地存储与附件核心')
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.store = Store(self.root)

    def paper(self, student='SYN-01', batch='B1'):
        return self.store.create_paper(dict(batch_id=batch, title='数学作业',
            student_ref=student, student_name='虚构学生'+student,
            questions=questions(), documents=[]))

    def confirm(self, paper):
        return self.store.confirm(paper['id'], paper['version'], True)

    def exercise(self, paper):
        return self.store.create_exercise(dict(paper_id=paper['id'], question_id='Q01',
            level='基础巩固', stem='求y=(x+1)²-4的顶点', answer='(-1,-4)', explanation='令x+1=0'))

    def test_survives_store_restart(self):
        p = self.paper(); self.confirm(p)
        self.assertEqual(Store(self.root).get_paper(p['id'])['confirmed_version'], 1)

    def test_unreviewed_is_not_in_profile_or_class(self):
        p = self.paper()
        self.assertEqual(self.store.profile(p['student_id'])['events'], [])
        self.assertEqual(self.store.summary('B1')['confirmed_students'], 0)

    def test_explicit_consent_required(self):
        p = self.paper()
        with self.assertRaises(ValidationError): self.store.confirm(p['id'], 1, False)
        self.assertEqual(self.store.event_count(), 0)

    def test_repeat_confirmation_is_idempotent(self):
        p = self.paper(); self.confirm(p); receipt = self.confirm(p)
        self.assertEqual(receipt['added'], 0)
        self.assertEqual(self.store.event_count(), 2)

    def test_revision_keeps_history_and_latest_result(self):
        p = self.paper(); self.confirm(p)
        q = questions(); q[0]['result'] = 'CORRECT'
        p = self.store.save_paper(p['id'], dict(version=1, questions=q))
        self.confirm(p)
        profile = self.store.profile(p['student_id'])
        self.assertEqual(len(profile['events']), 4)
        self.assertEqual(self.store.summary('B1')['rows'][0]['counts']['CORRECT'], 1)
        self.assertEqual(profile['events'][0]['result'], 'INCORRECT')

    def test_stale_draft_cannot_overwrite_or_confirm(self):
        p = self.paper(); q = questions(); q[0]['answer'] = '改写识别'
        self.store.save_paper(p['id'], dict(version=1, questions=q))
        with self.assertRaises(ConflictError): self.store.confirm(p['id'], 1, True)
        with self.assertRaises(ConflictError): self.store.save_paper(p['id'], dict(version=1, questions=q))

    def test_confirmed_question_cannot_silently_disappear(self):
        p = self.paper(); self.confirm(p)
        with self.assertRaises(ValidationError): self.store.save_paper(p['id'], dict(version=1, questions=questions()[:1]))

    def test_student_and_batch_isolation(self):
        a = self.paper(); b = self.paper('SYN-02', 'B2'); self.confirm(a)
        self.assertEqual(self.store.profile(b['student_id'])['events'], [])
        self.assertEqual(self.store.summary('B2')['confirmed_students'], 0)

    def test_duplicate_original_submission_is_rejected(self):
        self.paper()
        with self.assertRaises(ConflictError): self.paper()

    def test_missing_and_pending_not_counted_as_wrong(self):
        p = self.paper(); q = questions(); q[0]['result'] = 'MISSING'; q[1]['result'] = 'PENDING'
        p = self.store.save_paper(p['id'], dict(version=1, questions=q)); self.confirm(p)
        summary = self.store.summary('B1')
        self.assertEqual(summary['counts']['INCORRECT'], 0)
        self.assertEqual(summary['binary_denominator'], 0)

    def test_invalid_result_rejected_without_write(self):
        payload = dict(batch_id='B1', title='试卷', student_ref='S1', student_name='样例', questions=questions(), documents=[])
        payload['questions'][0]['result'] = 'MASTERED'
        with self.assertRaises(ValidationError): self.store.create_paper(payload)
        self.assertEqual(len(self.store.bootstrap()['papers']), 0)

    def test_exercise_requires_confirmed_problem(self):
        p = self.paper()
        with self.assertRaises(ValidationError): self.exercise(p)

    def test_unconfirmed_revision_cannot_start_new_exercise(self):
        p = self.paper(); self.confirm(p)
        q = questions(); q[0]['answer'] = '新转写尚待审核'
        self.store.save_paper(p['id'], dict(version=1, questions=q))
        with self.assertRaises(ValidationError): self.exercise(p)

    def test_same_batch_question_mismatch_cannot_confirm(self):
        p = self.paper(); self.confirm(p)
        other = self.paper('SYN-02')
        q = questions(); q[0]['stem'] = '另一张试卷的题'
        other = self.store.save_paper(other['id'], dict(version=1, questions=q))
        with self.assertRaises(ConflictError): self.confirm(other)
        self.assertEqual(self.store.event_count(), 2)

    def test_old_historical_stem_does_not_authorize_different_current_question(self):
        p = self.paper(); self.confirm(p)
        q = questions(); q[0]['stem'] = '修正后的原题'
        p = self.store.save_paper(p['id'], dict(version=1, questions=q)); self.confirm(p)
        other = self.paper('SYN-02')
        with self.assertRaises(ConflictError): self.confirm(other)
        self.assertEqual(self.store.summary('B1')['confirmed_students'], 1)

    def test_valid_docx_and_pdf_extract_local_text(self):
        from docx import Document
        from pypdf import PdfWriter
        from pypdf.generic import DictionaryObject, NameObject, DecodedStreamObject
        d = Document(); d.add_paragraph('LOCAL MATH 2027')
        b = io.BytesIO(); d.save(b)
        meta = save_document(self.root, '作业.docx', b.getvalue())
        self.assertIn('LOCAL MATH 2027', meta['extracted_text'])
        b = io.BytesIO(); writer = PdfWriter(); page = writer.add_blank_page(595, 842)
        font = DictionaryObject({NameObject('/Type'):NameObject('/Font'), NameObject('/Subtype'):NameObject('/Type1'), NameObject('/BaseFont'):NameObject('/Helvetica')})
        page[NameObject('/Resources')] = DictionaryObject({NameObject('/Font'): DictionaryObject({NameObject('/F1'):font})})
        stream = DecodedStreamObject(); stream.set_data(b'BT /F1 12 Tf 80 700 Td (LOCAL PDF 2027) Tj ET')
        page[NameObject('/Contents')] = stream; writer.write(b)
        meta = save_document(self.root, '作业.pdf', b.getvalue())
        self.assertIn('LOCAL PDF 2027', meta['extracted_text'])

    def test_backup_restore_keeps_attachment_bytes(self):
        from PIL import Image
        from files import get_document
        b = io.BytesIO(); Image.new('RGB', (20, 20), 'white').save(b, format='PNG')
        meta = save_document(self.root, '合成.png', b.getvalue())
        p = self.store.create_paper(dict(batch_id='B1', title='作业', student_ref='S1', student_name='样例', questions=questions(), documents=[meta]))
        self.confirm(p); backup = self.store.backup(); self.store.restore(backup['id'], 'RESTORE')
        doc, path = get_document(self.root, meta['id'])
        self.assertEqual(path.read_bytes(), b.getvalue())

    def test_retest_requires_approved_specific_version(self):
        p = self.paper(); self.confirm(p); ex = self.exercise(p)
        payload = dict(exercise_id=ex['id'], version=ex['version'], answer='(-1,-4)', condition='独立完成', result='CORRECT', consent=True, request_id='attempt-001')
        with self.assertRaises(ValidationError): self.store.record_retest(payload)
        self.store.approve_exercise(ex['id'], ex['version'], True)
        self.store.record_retest(payload)
        self.assertEqual(len(self.store.profile(p['student_id'])['retests']), 1)
        self.assertEqual(self.store.summary('B1')['counts']['INCORRECT'], 1)

    def test_retest_retry_is_idempotent_and_conflict_is_rejected(self):
        p = self.paper(); self.confirm(p); ex = self.exercise(p); self.store.approve_exercise(ex['id'], 1, True)
        payload = dict(exercise_id=ex['id'], version=1, answer='-1,-4', condition='带提示', result='CORRECT', consent=True, request_id='same-request')
        self.store.record_retest(payload); self.store.record_retest(payload)
        self.assertEqual(len(self.store.profile(p['student_id'])['retests']), 1)
        payload['answer'] = 'different'
        with self.assertRaises(ConflictError): self.store.record_retest(payload)

    def test_editing_exercise_invalidates_approval(self):
        p = self.paper(); self.confirm(p); ex = self.exercise(p); self.store.approve_exercise(ex['id'], 1, True)
        ex = self.store.update_exercise(ex['id'], dict(version=1, stem='另一道新题', answer='另一个答案', explanation='新说明', level='综合运用'))
        self.assertEqual(ex['status'], 'DRAFT')
        with self.assertRaises(ConflictError): self.store.approve_exercise(ex['id'], 1, True)

    def test_backup_restore_preserves_records_and_requires_confirmation(self):
        p = self.paper(); self.confirm(p); backup = self.store.backup()
        self.paper('SYN-02', 'B2')
        with self.assertRaises(ValidationError): self.store.restore(backup['id'], 'NO')
        self.store.restore(backup['id'], 'RESTORE')
        self.assertEqual(len(self.store.bootstrap()['papers']), 1)
        self.assertEqual(self.store.event_count(), 2)

    def test_tampered_backup_does_not_change_current_database(self):
        p = self.paper(); self.confirm(p); backup = self.store.backup()
        path = self.root/'backups'/backup['id']
        path.write_bytes(b'not a zip')
        with self.assertRaises(ValidationError): self.store.restore(backup['id'], 'RESTORE')
        self.assertEqual(self.store.event_count(), 2)

    def test_database_transaction_failure_is_not_partial_confirmation(self):
        p = self.paper()
        from contextlib import closing
        with closing(sqlite3.connect(self.root/'records.sqlite3')) as db, db:
            db.execute("CREATE TRIGGER fail_q02 BEFORE INSERT ON review_events WHEN NEW.question_id='Q02' BEGIN SELECT RAISE(ABORT,'test rollback'); END")
        with self.assertRaises(sqlite3.DatabaseError): self.confirm(p)
        self.assertEqual(self.store.event_count(), 0)
        self.assertEqual(self.store.get_paper(p['id'])['confirmed_version'], 0)

    def test_attachment_rejects_path_and_fake_extension(self):
        with self.assertRaises(ValidationError): save_document(self.root, '../escape.png', b'hello')
        with self.assertRaises(ValidationError): save_document(self.root, 'fake.docx', b'<script>')

    def test_docx_zip_expansion_limit_and_doctype(self):
        content = io.BytesIO()
        with zipfile.ZipFile(content, 'w') as z:
            z.writestr('[Content_Types].xml','<Types/>')
            z.writestr('word/document.xml','<!DOCTYPE x [<!ENTITY y "boom">]><x/>')
        with self.assertRaises(ValidationError): save_document(self.root, 'unsafe.docx', content.getvalue())


if __name__ == '__main__': unittest.main()
