"""Teacher grading evidence, conflicts and AI/OCR preservation (synthetic only)."""
import json
from pathlib import Path
import sys
import tempfile
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from store import Store, ValidationError, checked_questions
from ai_service import AIService
from exporting import export_content
from test_ai import FakeTransport
from test_core import questions
import vision


class TeacherGradingTests(unittest.TestCase):
    def setUp(self):
        folder = Path(__file__).resolve().parents[1] / '.qa-temp'
        folder.mkdir(exist_ok=True)
        self.tmp = tempfile.TemporaryDirectory(dir=folder)
        self.addCleanup(self.tmp.cleanup)
        self.store = Store(self.tmp.name)

    def paper(self, **fields):
        q = questions()
        q[0].update(teacher_result='INCORRECT', teacher_mark='LOCAL_ONLY: 红叉，待核实',
                    grading_note='', grading_resolved=False)
        q[0].update(fields)
        return self.store.create_paper(dict(student_ref='SYN-TEACHER', student_name='合成教师样本',
                                            batch_id='SYN-TEACHER-B1', title='合成主判卷', questions=q))

    def test_original_teacher_fields_survive_roundtrip_and_confirmation(self):
        p = self.paper()
        self.assertEqual(p['questions'][0].get('teacher_result'), 'INCORRECT')
        self.store.confirm(p['id'], p['version'], True)
        event = self.store.profile(p['student_id'])['events'][0]
        self.assertEqual(event['question']['teacher_mark'], 'LOCAL_ONLY: 红叉，待核实')

    def test_conflict_rejected_atomically_before_any_event(self):
        p = self.paper(result='CORRECT')
        with self.assertRaisesRegex(ValidationError, '批改|分歧'):
            self.store.confirm(p['id'], p['version'], True)
        self.assertEqual(self.store.event_count(), 0)

    def test_conflict_requires_note_and_explicit_resolution(self):
        p = self.paper(result='CORRECT', grading_resolved=True)
        with self.assertRaises(ValidationError): self.store.confirm(p['id'], 1, True)
        qs = p['questions']
        qs[0].update(grading_note='核对原图后，老师将本次最终结果改为正确', grading_resolved=False)
        p = self.store.save_paper(p['id'], dict(version=1, questions=qs))
        with self.assertRaises(ValidationError): self.store.confirm(p['id'], p['version'], True)
        qs[0]['grading_resolved'] = True
        p = self.store.save_paper(p['id'], dict(version=p['version'], questions=qs))
        self.assertEqual(self.store.confirm(p['id'], p['version'], True)['added'], 2)
        self.assertEqual(self.store.profile(p['student_id'])['latest'][0]['result'], 'CORRECT')
        self.assertEqual(self.store.get_paper(p['id'])['questions'][0]['teacher_result'], 'INCORRECT')

    def test_pending_can_archive_without_claiming_evaluated_result(self):
        p = self.paper(result='PENDING', ai_result='CORRECT')
        self.store.confirm(p['id'], 1, True)
        self.assertEqual(self.store.summary('SYN-TEACHER-B1')['counts']['PENDING'], 1)

    def test_ai_disagreement_requires_review_even_when_final_keeps_teacher(self):
        p = self.paper(ai_result='CORRECT')
        with self.assertRaises(ValidationError): self.store.confirm(p['id'], 1, True)

    def test_invalid_teacher_status_and_ack_type_rejected(self):
        for fields in ({'teacher_result':'MASTERED'}, {'ai_result':'UNKNOWN'}, {'grading_resolved':'true'},
                       {'teacher_mark':'x'*1501}, {'grading_note':'x'*1501}):
            with self.subTest(fields=list(fields)):
                with self.assertRaises(ValidationError): checked_questions([questions()[0] | fields])

    def test_old_questions_still_confirm_without_new_fields(self):
        p = self.store.create_paper(dict(student_ref='OLD', batch_id='OLD', title='旧记录', questions=questions()))
        self.assertEqual(self.store.confirm(p['id'], 1, True)['added'], 2)

    def test_mock_ai_keeps_teacher_final_and_note_and_resets_old_resolution(self):
        p = self.paper(result='CORRECT', teacher_result='CORRECT', grading_resolved=True,
                       grading_note='此前核对说明')
        ai = AIService(self.store, FakeTransport())
        ai.configure(dict(base_url='https://discovery-api.intern-ai.org.cn/v1',
                          model='deepseek-v4.1-flash-1017', api_key='SYNTHETIC-NOT-A-KEY'))
        job = ai.prepare(dict(paper_id=p['id'], version=1, questions=p['questions']))
        payload = json.dumps(job['payload'], ensure_ascii=False)
        for local_only in ('LOCAL_ONLY', 'teacher_mark', 'teacher_result', 'grading_note', 'grading_resolved'):
            self.assertNotIn(local_only, payload)
        ai.send(job['id'], True)
        ai.apply(job['id'], True)
        q = self.store.get_paper(p['id'])['questions'][0]
        self.assertEqual(q['teacher_result'], 'CORRECT')
        self.assertEqual(q['result'], 'CORRECT')
        self.assertEqual(q.get('ai_result'), 'INCORRECT')
        self.assertIn('LOCAL_ONLY', q['teacher_mark'])
        self.assertFalse(q['grading_resolved'])
        self.assertEqual(self.store.event_count(), 0)

    def test_ocr_replacement_preserves_raw_teacher_evidence_and_revokes_resolution(self):
        p = self.paper(grading_resolved=True, grading_note='旧核对说明', ai_result='CORRECT')
        replacement = [questions()[0] | dict(answer='新转写', result='PENDING')]
        q = vision.merge_transcription(dict(metadata={}), p, replacement)[0]
        self.assertEqual(q.get('teacher_result'), 'INCORRECT')
        self.assertIn('LOCAL_ONLY', q.get('teacher_mark', ''))
        self.assertFalse(q.get('grading_resolved', True))
        self.assertEqual(q['result'], 'PENDING')
        self.assertNotIn('ai_result', q)  # The old AI opinion refers to old transcription.

    def test_backup_and_teacher_report_keep_evidence(self):
        p = self.paper(ai_result='CORRECT', grading_note='老师核清后保留原判', grading_resolved=True)
        self.store.confirm(p['id'], 1, True)
        title, blocks = export_content(self.store, 'paper', p['id'], 'teacher', 1)
        text = '\n'.join(body for _, body in blocks)
        for required in ('老师原批改', 'LOCAL_ONLY', 'AI候选判定', '老师核清后保留原判'):
            self.assertIn(required, text)
        backup = self.store.backup()
        self.store.restore(backup['id'], 'RESTORE')
        self.assertEqual(self.store.get_paper(p['id'])['questions'][0]['teacher_result'], 'INCORRECT')

    def test_legacy_import_keeps_teacher_evidence_and_conflict_guard(self):
        p = self.paper(result='CORRECT', ai_result='CORRECT')
        legacy = questions()
        legacy[0]['result'] = 'CORRECT'
        p = self.store.save_paper(p['id'], dict(version=1, questions=legacy, imported=True))
        self.assertEqual(p['questions'][0].get('teacher_result'), 'INCORRECT')
        self.assertIn('LOCAL_ONLY', p['questions'][0].get('teacher_mark',''))
        with self.assertRaises(ValidationError): self.store.confirm(p['id'], p['version'], True)

    def test_json_import_cannot_grant_resolution_or_clear_teacher_mark(self):
        p = self.paper(result='CORRECT', ai_result='CORRECT', grading_resolved=True, grading_note='旧核对')
        imported = p['questions']
        imported[0].update(teacher_result='', teacher_mark='', grading_note='文件自称老师确认', grading_resolved=True)
        p = self.store.save_paper(p['id'], dict(version=1, questions=imported, imported=True))
        self.assertEqual(p['questions'][0].get('teacher_result'), 'INCORRECT')
        self.assertFalse(p['questions'][0].get('grading_resolved', True))
        with self.assertRaises(ValidationError): self.store.confirm(p['id'], p['version'], True)

    def test_plain_draft_omission_keeps_evidence_and_cannot_drop_evidenced_question(self):
        p = self.paper(result='CORRECT')
        legacy = questions()
        p = self.store.save_paper(p['id'], dict(version=1, questions=legacy))
        self.assertEqual(p['questions'][0].get('teacher_result'), 'INCORRECT')
        with self.assertRaises(ValidationError):
            self.store.save_paper(p['id'], dict(version=p['version'], questions=legacy[1:], imported=True))

    def test_teacher_marked_placeholder_is_not_discarded_by_other_ocr_question(self):
        p = self.paper()
        p['questions'] = [p['questions'][0] | dict(stem='待录入原题', answer='')]
        result = vision.merge_transcription(dict(metadata={}), p, [questions()[1]])
        self.assertEqual([q['id'] for q in result], ['Q01','Q02'])
        self.assertIn('LOCAL_ONLY', result[0]['teacher_mark'])

    def test_report_includes_standalone_review_note(self):
        q = questions()
        q[0]['grading_note'] = '单独核对说明应保留'
        p = self.store.create_paper(dict(student_ref='NOTE', batch_id='NOTE', title='备注样例', questions=q))
        _, blocks = export_content(self.store, 'paper', p['id'], 'teacher', 1)
        self.assertIn('单独核对说明应保留', '\n'.join(body for _,body in blocks))

    def test_legacy_edit_does_not_inherit_old_conflict_acknowledgement(self):
        p = self.paper(result='CORRECT', ai_result='CORRECT', grading_resolved=True, grading_note='旧核清说明')
        legacy = questions()
        legacy[0].update(result='CORRECT', answer='另一段新转写')
        p = self.store.save_paper(p['id'], dict(version=1, questions=legacy))
        self.assertFalse(p['questions'][0].get('grading_resolved', True))
        with self.assertRaises(ValidationError): self.store.confirm(p['id'], p['version'], True)

    def test_import_keeps_unresolved_recognition_and_cannot_grant_ocr_ack(self):
        p = self.paper(result='PENDING', recognition_notes='负号待核清', recognition_resolved=False)
        imported = questions()
        imported[0].update(result='INCORRECT', recognition_resolved=True)
        p = self.store.save_paper(p['id'], dict(version=1, questions=imported, imported=True))
        q = p['questions'][0]
        self.assertEqual(q['recognition_notes'], '负号待核清')
        self.assertFalse(q['recognition_resolved'])
        self.assertEqual(q['result'], 'PENDING')
        self.store.confirm(p['id'], p['version'], True)
        self.assertEqual(self.store.summary('SYN-TEACHER-B1')['counts']['PENDING'], 1)

    def test_legacy_manual_omission_does_not_drop_recognition_gate(self):
        p = self.paper(result='PENDING', recognition_notes='小数点待核清', recognition_resolved=False)
        with self.assertRaises(ValidationError):
            self.store.save_paper(p['id'], dict(version=1, questions=questions()))
        self.assertFalse(self.store.get_paper(p['id'])['questions'][0]['recognition_resolved'])
