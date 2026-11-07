"""Synthetic actual-date provenance, never inferred from upload timestamps."""
import hashlib,io,json,sqlite3,sys,tempfile,threading,unittest,zipfile
from contextlib import contextmanager
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from store import Store,ValidationError,ConflictError
from profile_report import build_profile_report,report_content
from paper_materials import update_documents
from files import save_document
from PIL import Image
try:from assignment_dates import update,validate_date
except ModuleNotFoundError:update=validate_date=None


class AssignmentDateTests(unittest.TestCase):
    def setUp(self):
        self.assertIsNotNone(update,'作业日期尚未实现')
        root=Path(__file__).resolve().parents[1]/'.qa-temp';root.mkdir(exist_ok=True)
        self.tmp=tempfile.TemporaryDirectory(dir=root);self.addCleanup(self.tmp.cleanup);self.store=Store(self.tmp.name)
        self.p=self.paper()

    def paper(self,**extra):
        return self.store.create_paper(dict(student_ref='SYN-A',student_name='合成A',batch_id='SYN-B',title='合成数学卷',
            questions=[dict(id='Q01',stem='合成原题',answer='原答',result='INCORRECT',knowledge='分式',cause='待核实')])|extra)

    def change(self,value,version=1):return update(self.store,self.p['id'],dict(version=version,assignment_date=value))

    def rewrite_backup(self,backup,sql):
        target=self.store.backup_path(backup['id'])
        with zipfile.ZipFile(target) as z:files={n:z.read(n) for n in z.namelist() if n!='manifest.json'}
        stage=Path(self.tmp.name)/'synthetic-probe.sqlite3';stage.write_bytes(files['database.sqlite3'])
        db=sqlite3.connect(stage)
        try:
            with db:db.executescript(sql)
        finally:db.close()
        files['database.sqlite3']=stage.read_bytes()
        manifest={n:hashlib.sha256(raw).hexdigest() for n,raw in files.items()}
        with zipfile.ZipFile(target,'w',zipfile.ZIP_DEFLATED) as z:
            for n,raw in files.items():z.writestr(n,raw)
            z.writestr('manifest.json',json.dumps(manifest))

    def test_unknown_date_is_empty_not_today(self):self.assertEqual(self.p['assignment_date'],'')

    def test_create_can_record_teacher_provided_date(self):
        p=self.paper(batch_id='SYN-OTHER',assignment_date='2026-10-20')
        self.assertEqual(p['assignment_date'],'2026-10-20');self.assertEqual(self.store.event_count(),0)

    def test_invalid_dates_rejected_without_writes(self):
        for value in ('2026-02-30','2026-2-03','2026/02/03','0000-01-01','2026-01-01T00:00:00',None,True,12):
            with self.subTest(value=value):
                with self.assertRaises(ValidationError):self.change(value)
        self.assertEqual(self.store.get_paper(self.p['id']),self.p)

    def test_date_only_change_creates_pending_revision_preserving_grades(self):
        self.store.confirm(self.p['id'],1,True);before=self.store.profile(self.p['student_id'])['events']
        p=self.change('2026-10-20');self.assertEqual((p['version'],p['confirmed_version']),(2,1))
        self.assertEqual(p['questions'],self.p['questions']);self.assertEqual(self.store.profile(self.p['student_id'])['events'],before)

    def test_same_date_is_idempotent(self):
        self.change('2026-10-20');p=self.change('2026-10-20',2);self.assertEqual(p['version'],2)
        with self.store.db() as db:self.assertEqual(db.execute('SELECT count(*) FROM paper_assignment_dates').fetchone()[0],1)

    def test_old_version_and_non_integer_version_refused(self):
        for value in (None,True,1.0,'1'):
            with self.assertRaises(ValidationError):self.change('2026-10-20',value)
        self.change('2026-10-20')
        with self.assertRaises(ConflictError):self.change('2026-10-21',1)

    def test_historical_confirmation_does_not_inherit_new_date(self):
        self.store.confirm(self.p['id'],1,True);self.change('2026-10-20');self.store.confirm(self.p['id'],2,True)
        events=self.store.profile(self.p['student_id'])['events']
        self.assertEqual([e['assignment_date'] for e in events],['','2026-10-20'])
        self.assertEqual(self.store.student_evidence(self.p['student_id'],events[0]['id'])['event']['assignment_date'],'')
        self.assertEqual(self.store.profile(self.p['student_id'])['latest'][0]['assignment_date'],'2026-10-20')

    def test_clear_date_does_not_erase_old_confirmation(self):
        self.change('2026-10-20');self.store.confirm(self.p['id'],2,True);self.change('',2)
        profile=self.store.profile(self.p['student_id'])
        self.assertEqual(profile['latest'][0]['assignment_date'],'2026-10-20')
        self.assertEqual(self.store.get_paper(self.p['id'])['assignment_date'],'')

    def test_question_and_material_revision_inherit_date(self):
        p=self.change('2026-10-20');q=p['questions'];q[0]['answer']='修订原答'
        p=self.store.save_paper(p['id'],dict(version=2,questions=q))
        raw=io.BytesIO();Image.new('RGB',(8,8),'white').save(raw,format='PNG');doc=save_document(self.store.root,'synthetic.png',raw.getvalue())
        p=update_documents(self.store,p['id'],dict(version=p['version'],student_id=p['student_id'],documents=[doc],consent=True))
        self.assertEqual(p['assignment_date'],'2026-10-20')

    def test_student_dates_do_not_mix(self):
        b=self.paper(student_ref='SYN-B',student_name='合成B');self.change('2026-10-20')
        self.assertEqual(self.store.get_paper(b['id'])['assignment_date'],'')

    def test_fixed_exercise_source_keeps_its_confirmed_date(self):
        self.change('2026-10-20');self.store.confirm(self.p['id'],2,True)
        self.store.create_exercise(dict(paper_id=self.p['id'],question_id='Q01',level='基础巩固',stem='合成补练',answer='2',explanation='合成'))
        self.change('2026-10-21',2);self.store.confirm(self.p['id'],3,True)
        journey=self.store.profile(self.p['student_id'])['learning_journeys'][0]
        self.assertEqual(journey['source']['assignment_date'],'2026-10-20')

    def test_reports_use_confirmation_date_and_old_preview_expires(self):
        self.store.confirm(self.p['id'],1,True);before=build_profile_report(self.store,self.p['student_id'])
        self.change('2026-10-20');pending=build_profile_report(self.store,self.p['student_id'])
        self.assertNotIn('作业日期：2026-10-20','\n'.join(b[1] for b in pending['blocks']))
        with self.assertRaises(ConflictError):report_content(self.store,self.p['student_id'],before['fingerprint'])
        self.store.confirm(self.p['id'],2,True);after=build_profile_report(self.store,self.p['student_id'])
        self.assertIn('作业日期：2026-10-20','\n'.join(b[1] for b in after['blocks']))

    def test_knowledge_evidence_keeps_date_of_confirmation(self):
        self.change('2026-10-20');self.store.confirm(self.p['id'],2,True);self.change('2026-10-21',2)
        e=self.store.profile(self.p['student_id'])['learning_analysis']['groups'][0]['evidence'][0]
        self.assertEqual(e['assignment_date'],'2026-10-20')

    def test_backup_restores_date_history(self):
        self.change('2026-10-20');backup=self.store.backup();self.change('2026-10-21',2)
        self.store.restore(backup['id'],'RESTORE');self.assertEqual(self.store.get_paper(self.p['id'])['assignment_date'],'2026-10-20')

    def test_old_backup_without_date_table_restores_unknown(self):
        backup=self.store.backup();self.rewrite_backup(backup,'DROP TABLE paper_assignment_dates;')
        self.change('2026-10-20');self.store.restore(backup['id'],'RESTORE')
        self.assertEqual(self.store.get_paper(self.p['id'])['assignment_date'],'')

    def test_tampered_invalid_or_future_date_history_backup_refused(self):
        for value,revision in (('bad',1),('2026-10-20',99)):
            backup=self.store.backup();self.rewrite_backup(backup,"INSERT INTO paper_assignment_dates VALUES('"+self.p['id']+"',"+str(revision)+",'"+value+"');")
            with self.assertRaises(ValidationError):self.store.restore(backup['id'],'RESTORE')
        self.assertEqual(self.store.get_paper(self.p['id'])['assignment_date'],'')

    def test_cross_instance_concurrent_revision_cannot_backdate_confirmation(self):
        other=Store(self.tmp.name);entered=threading.Event();release=threading.Event();errors=[]
        original_db=self.store.db
        class PausedConnection:
            def __init__(proxy,db):proxy.db=db
            def execute(proxy,sql,*args):
                if sql.startswith('UPDATE papers SET version'):
                    entered.set()
                    if not release.wait(5):raise RuntimeError('synthetic race timeout')
                return proxy.db.execute(sql,*args)
        @contextmanager
        def paused_db():
            with original_db() as db:yield PausedConnection(db)
        self.store.db=paused_db
        def worker():
            try:self.change('2026-10-20')
            except Exception as error:errors.append(error)
        thread=threading.Thread(target=worker);thread.start()
        try:
            self.assertTrue(entered.wait(5),'date mutation reached the interleaving boundary')
            q=other.get_paper(self.p['id'])['questions'];q[0]['answer']='其他实例已修订'
            other.save_paper(self.p['id'],dict(version=1,questions=q));other.confirm(self.p['id'],2,True)
        finally:
            release.set();thread.join(5);self.store.db=original_db
        self.assertFalse(thread.is_alive());self.assertEqual(len(errors),1)
        self.assertIsInstance(errors[0],ConflictError)
        self.assertEqual(other.get_paper(self.p['id'])['version'],2)
        self.assertEqual(other.profile(self.p['student_id'])['latest'][0]['assignment_date'],'')

    def test_duplicate_effective_dates_in_tampered_backup_rejected(self):
        backup=self.store.backup();pid=self.p['id']
        self.rewrite_backup(backup,"DROP TABLE paper_assignment_dates; CREATE TABLE paper_assignment_dates(paper_id TEXT,version INTEGER,assignment_date TEXT); INSERT INTO paper_assignment_dates VALUES('"+pid+"',1,'2026-10-20'),('"+pid+"',1,'2026-10-21');")
        with self.assertRaises(ValidationError):self.store.restore(backup['id'],'RESTORE')

    def test_date_backup_with_missing_constraints_rejected_even_without_duplicates(self):
        backup=self.store.backup();pid=self.p['id']
        self.rewrite_backup(backup,"DROP TABLE paper_assignment_dates; CREATE TABLE paper_assignment_dates(paper_id TEXT,version INTEGER,assignment_date TEXT); INSERT INTO paper_assignment_dates VALUES('"+pid+"',1,'2026-10-20');")
        with self.assertRaises(ValidationError):self.store.restore(backup['id'],'RESTORE')


if __name__=='__main__':unittest.main()
