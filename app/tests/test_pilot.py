import tempfile,sys,unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from store import Store,ValidationError,ConflictError
try:from pilot import Pilot,PHASES
except ImportError:Pilot=None;PHASES=('collect','organize','review','recapture','tutor','release')

class PilotTests(unittest.TestCase):
 def setUp(self):
  self.assertIsNotNone(Pilot,'缺少本地试点记录')
  folder=Path(__file__).resolve().parents[1]/'.qa-temp';folder.mkdir(exist_ok=True)
  self.tmp=tempfile.TemporaryDirectory(dir=folder);self.addCleanup(self.tmp.cleanup);self.store=Store(self.tmp.name);self.pilot=Pilot(self.store)
 def create(self,**p):return self.pilot.create(dict(title='合成试点',**p))
 def complete(self,**p):return self.create(mode='REAL',planned_students=10,completed_students=10,baseline={k:10 for k in PHASES},assisted={k:5 for k in PHASES},**p)
 def test_empty_is_unknown_and_defaults_synthetic(self):
  p=self.create();self.assertEqual(p['mode'],'SYNTHETIC');self.assertIsNone(p['summary']['saving_minutes']);self.assertEqual(p['summary']['acceptance'],'NOT_ASSESSED')
 def test_all_phases_count_and_threshold_is_teacher_defined(self):
  p=self.complete(target_minutes=20,target_confirmed=True)
  self.assertEqual(p['summary']['baseline_minutes'],60);self.assertEqual(p['summary']['assisted_minutes'],30);self.assertEqual(p['summary']['saving_minutes'],30);self.assertTrue(p['summary']['reported_threshold_met'])
  self.assertEqual(p['summary']['acceptance'],'NOT_ASSESSED')
 def test_unknown_phase_never_becomes_zero(self):
  p=self.complete();a=p['assisted'];a['recapture']=None;p=self.pilot.save(p['id'],p['version'],dict(assisted=a))
  self.assertIsNone(p['summary']['saving_minutes'])
 def test_negative_saving_is_reported_not_hidden(self):
  p=self.complete();p=self.pilot.save(p['id'],p['version'],dict(assisted={k:20 for k in PHASES}))
  self.assertEqual(p['summary']['saving_minutes'],-60)
 def test_zero_baseline_has_no_percentage_or_goal_pass(self):
  p=self.complete(target_minutes=0,target_confirmed=True);p=self.pilot.save(p['id'],p['version'],dict(baseline={k:0 for k in PHASES}))
  self.assertIsNone(p['summary']['saving_percent']);self.assertIsNone(p['summary']['reported_threshold_met'])
 def test_partial_and_synthetic_never_imply_real_threshold_met(self):
  p=self.complete(target_minutes=1,target_confirmed=True);p=self.pilot.save(p['id'],p['version'],dict(completed_students=3));self.assertIsNone(p['summary']['reported_threshold_met'])
  p=self.pilot.save(p['id'],p['version'],dict(completed_students=10,mode='SYNTHETIC'));self.assertIsNone(p['summary']['reported_threshold_met'])
 def test_invalid_counts_time_and_boolean_values_rejected(self):
  for payload in [dict(planned_students=True),dict(completed_students=11),dict(baseline={'collect':-1}),dict(assisted={'review':float('nan')}),dict(target_minutes=True),dict(target_confirmed='yes'),dict(checks={'review':'APPROVED'})]:
   with self.subTest(payload=str(payload)):
    with self.assertRaises(ValidationError):self.create(**payload)
 def test_forged_acceptance_is_ignored(self):
  p=self.create(acceptance='PASS',checks={k:'PASS' for k in ('ownership','recognition','review','loop')});self.assertEqual(p['summary']['acceptance'],'NOT_ASSESSED')
 def test_optimistic_version_and_immutable_history(self):
  p=self.create();v2=self.pilot.save(p['id'],1,dict(notes='老师新记录'))
  self.assertEqual(self.pilot.get(p['id'],1)['notes'],'');self.assertEqual(v2['version'],2)
  with self.assertRaises(ConflictError):self.pilot.save(p['id'],1,dict(notes='旧窗口'))
 def test_backup_roundtrip_does_not_touch_student_records(self):
  p=self.complete();backup=self.store.backup();self.pilot.save(p['id'],p['version'],dict(notes='备份后'))
  self.store.restore(backup['id'],'RESTORE');self.assertEqual(self.pilot.get(p['id'])['notes'],'');self.assertEqual(self.store.event_count(),0)
 def test_restore_rejects_invalid_identity_and_missing_history(self):
  import pilot,json
  p=self.create();p=self.pilot.save(p['id'],1,dict(notes='V2'));p=self.pilot.save(p['id'],2,dict(notes='V3'))
  with self.store.db() as db:
   db.execute('DELETE FROM pilot_versions WHERE run_id=? AND version=2',(p['id'],))
   with self.assertRaises(ValidationError):pilot.validate_restored(db)
  with self.store.db() as db:
   # Restore V2 locally, then isolate the invalid-identity case from history gaps.
   body=dict(p);body.pop('summary');body['version']=2;db.execute('INSERT INTO pilot_versions VALUES(?,?,?)',(p['id'],2,json.dumps(body)))
   db.execute('PRAGMA defer_foreign_keys=ON')
   for table in ('pilot_runs','pilot_versions'):
    column='id' if table=='pilot_runs' else 'run_id'
    for rowid,raw in db.execute('SELECT rowid,body_json FROM '+table).fetchall():
     b=json.loads(raw);b['id']='invalid-id';db.execute('UPDATE '+table+' SET '+column+'=?,body_json=? WHERE rowid=?',('invalid-id',json.dumps(b),rowid))
   with self.assertRaises(ValidationError):pilot.validate_restored(db)
 def test_huge_integer_time_is_validation_error(self):
  with self.assertRaises(ValidationError):self.create(target_minutes=10**1000)
