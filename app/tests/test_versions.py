import io
import json
from pathlib import Path
import sqlite3
import sys
import tempfile
import unittest
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from store import Store, ValidationError, ConflictError
from exporting import export_content
from test_core import questions


class ExerciseVersionTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(); self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name); self.store = Store(self.root)
        self.p = self.store.create_paper(dict(student_ref='S1', student_name='虚构1', batch_id='B1', title='试卷', questions=questions()))
        self.store.confirm(self.p['id'], 1, True)
        self.e = self.store.create_exercise(dict(paper_id=self.p['id'], question_id='Q01', level='基础巩固', stem='旧练习 y=(x+1)²−4', answer='旧答案(-1,-4)', explanation='旧讲解'))

    def update(self):
        return self.store.update_exercise(self.e['id'], dict(version=1, level='综合运用', stem='新练习 y=(x−2)²−1', answer='新答案(2,-1)', explanation='新讲解'))

    def retest(self, version=1):
        return self.store.record_retest(dict(exercise_id=self.e['id'], version=version, answer='(-1,-4)', condition='独立完成', result='CORRECT', consent=True, request_id='late-answer'))

    def test_old_approved_version_retains_content_and_approval(self):
        self.store.approve_exercise(self.e['id'], 1, True); self.update()
        old = self.store.get_exercise(self.e['id'], 1)
        self.assertEqual(old['stem'], '旧练习 y=(x+1)²−4'); self.assertEqual(old['status'], 'APPROVED')
        self.assertEqual(self.store.get_exercise(self.e['id'])['status'], 'DRAFT')
        self.assertEqual(len(self.store.exercise_versions(self.e['id'])), 2)

    def test_old_approved_late_retest_uses_old_snapshot(self):
        self.store.approve_exercise(self.e['id'], 1, True); self.update(); self.retest()
        r = self.store.profile(self.p['student_id'])['retests'][0]
        self.assertEqual(json.loads(r['snapshot_json'])['answer'], '旧答案(-1,-4)')
        self.assertEqual(r['version'], 1)
        self.assertEqual(self.store.summary('B1')['counts']['INCORRECT'], 1)

    def test_old_unapproved_version_is_not_retroactively_approved(self):
        self.update()
        with self.assertRaises(ValidationError): self.retest()
        with self.assertRaises(ConflictError): self.store.approve_exercise(self.e['id'], 1, True)
        with self.assertRaises(ValidationError): export_content(self.store, 'exercise', self.e['id'], 'student', 1)

    def test_old_student_export_is_bound_to_approved_snapshot(self):
        self.store.approve_exercise(self.e['id'], 1, True); self.update()
        title, blocks = export_content(self.store, 'exercise', self.e['id'], 'student', 1)
        content = json.dumps(blocks, ensure_ascii=False)
        self.assertIn('旧练习', content); self.assertNotIn('新练习', content)
        self.assertNotIn('旧答案', content); self.assertNotIn('旧讲解', content)
        with self.assertRaises(ConflictError): self.store.get_exercise(self.e['id'], 99)

    def test_backup_restore_includes_old_approved_versions(self):
        self.store.approve_exercise(self.e['id'], 1, True); self.update()
        b = self.store.backup(); self.store.restore(b['id'], 'RESTORE')
        self.assertEqual(self.store.get_exercise(self.e['id'], 1)['status'], 'APPROVED')
        self.assertEqual(self.store.get_exercise(self.e['id'], 2)['status'], 'DRAFT')

    def test_old_database_backfills_only_current_provable_version(self):
        self.update()
        db = sqlite3.connect(self.store.db_path)
        try:
            db.execute('DROP TABLE IF EXISTS exercise_versions'); db.commit()
        finally: db.close()
        migrated = Store(self.root)
        versions = migrated.exercise_versions(self.e['id'])
        self.assertEqual([v['version'] for v in versions], [2])
        with self.assertRaises(ConflictError): migrated.get_exercise(self.e['id'], 1)

    def test_old_database_retest_snapshot_recovers_provable_old_version(self):
        self.store.approve_exercise(self.e['id'], 1, True); self.retest(); self.update()
        db = sqlite3.connect(self.store.db_path)
        try:
            db.execute('DROP TABLE IF EXISTS exercise_versions'); db.commit()
        finally: db.close()
        migrated = Store(self.root)
        self.assertEqual(migrated.get_exercise(self.e['id'], 1)['status'], 'APPROVED')
        self.assertEqual(len(migrated.exercise_versions(self.e['id'])), 2)

    def test_corrupt_historical_snapshot_does_not_replace_current_data(self):
        self.store.approve_exercise(self.e['id'],1,True); self.retest()
        with self.store.db() as db:
            good=db.execute('SELECT snapshot_json FROM retests').fetchone()[0]
            db.execute("UPDATE retests SET snapshot_json='not JSON'")
        bad=self.store.backup()
        with self.store.db() as db: db.execute('UPDATE retests SET snapshot_json=?',(good,))
        with self.assertRaises(ValidationError): self.store.restore(bad['id'],'RESTORE')
        restored=self.store.profile(self.p['student_id'])['retests'][0]['snapshot_json']
        self.assertEqual(restored,good)

    def test_semantically_invalid_snapshot_does_not_replace_current_data(self):
        self.store.approve_exercise(self.e['id'],1,True); self.retest()
        with self.store.db() as db:
            good=db.execute('SELECT snapshot_json FROM retests').fetchone()[0]
            db.execute("UPDATE retests SET snapshot_json='{}'")
        bad=self.store.backup()
        with self.store.db() as db: db.execute('UPDATE retests SET snapshot_json=?',(good,))
        with self.assertRaises(ValidationError): self.store.restore(bad['id'],'RESTORE')
        self.assertEqual(self.store.profile(self.p['student_id'])['retests'][0]['snapshot_json'],good)
