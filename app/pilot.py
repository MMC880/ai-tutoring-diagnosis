"""Teacher-reported pilot measurements, never automatic acceptance or student evidence."""
import json,math,uuid
from decimal import Decimal
PHASES=('collect','organize','review','recapture','tutor','release')
CHECKS=('ownership','recognition','review','loop')

def error(message):
 from store import ValidationError
 return ValidationError(message)
def ensure_schema(db):
 db.execute('CREATE TABLE IF NOT EXISTS pilot_runs(id TEXT PRIMARY KEY,version INTEGER NOT NULL,body_json TEXT NOT NULL)')
 db.execute('CREATE TABLE IF NOT EXISTS pilot_versions(run_id TEXT NOT NULL REFERENCES pilot_runs(id),version INTEGER NOT NULL,body_json TEXT NOT NULL,PRIMARY KEY(run_id,version))')
def number(value):
 if value is None:return None
 if type(value) not in (int,float) or not 0<=value<=1440 or not math.isfinite(value):raise error('耗时或目标须为0至1440的分钟数，未知请留空')
 return float(round(Decimal(str(value)),2))
def version(value):
 if type(value) is not int or not 1<=value<1000000:raise error('试点版本无效')
 return value
def identity(value):
 if not isinstance(value,str) or len(value)!=32 or any(c not in 'abcdef0123456789' for c in value):raise error('试点编号无效')
 return value
def clean(p,old=None):
 from store import text_field
 old=old or {};data=old|p
 mode=data.get('mode','SYNTHETIC')
 if mode not in ('SYNTHETIC','REAL'):raise error('请选择合成演练或真实试点')
 planned=data.get('planned_students',10);completed=data.get('completed_students',0)
 if type(planned) is not int or not 1<=planned<=100 or type(completed) is not int or not 0<=completed<=planned:raise error('样本计划须为1至100人，已处理人数不能超出计划')
 confirmed=data.get('target_confirmed',False)
 if type(confirmed) is not bool:raise error('目标确认须为勾选状态')
 target=number(data.get('target_minutes'))
 if confirmed and target is None:raise error('请先填写老师确认的节省目标')
 result=dict(title=text_field(data.get('title',''),'试点标题',160,True),mode=mode,planned_students=planned,completed_students=completed,
  target_minutes=target,target_confirmed=confirmed,notes=text_field(data.get('notes',''),'证据及问题备注',1500))
 for field,keys in (('baseline',PHASES),('assisted',PHASES),('checks',CHECKS)):
  incoming=p.get(field,{})
  if not isinstance(incoming,dict) or not set(incoming).issubset(keys):raise error('试点记录字段无效')
  values=old.get(field,{})|incoming
  if field=='checks':
   if any(v not in ('UNKNOWN','PASS','FAIL') for v in values.values()):raise error('自填检查状态无效')
   result[field]={key:values.get(key,'UNKNOWN') for key in keys}
  else:result[field]={key:number(values.get(key)) for key in keys}
 return result
def summary(body):
 complete=all(value is not None for field in ('baseline','assisted') for value in body[field].values())
 totals={field:float(sum(Decimal(str(v)) for v in body[field].values())) if all(v is not None for v in body[field].values()) else None for field in ('baseline','assisted')}
 saving=round(totals['baseline']-totals['assisted'],2) if complete else None
 comparison=complete and totals['baseline']>0 and body['completed_students']>0
 threshold=(saving>=body['target_minutes']) if comparison and body['mode']=='REAL' and body['completed_students']==body['planned_students'] and body['target_confirmed'] else None
 return dict(baseline_minutes=totals['baseline'],assisted_minutes=totals['assisted'],saving_minutes=saving,
  saving_percent=round(saving/totals['baseline']*100,2) if comparison else None,comparison_available=comparison,
  reported_threshold_met=threshold,acceptance='NOT_ASSESSED')
def validate_restored(db):
 for row in db.execute('SELECT * FROM pilot_runs'):
  identity(row['id']);version(row['version']);body=json.loads(row['body_json'])
  if not isinstance(body,dict) or type(body.get('version')) is not int or body['version']!=row['version'] or body.get('id')!=row['id']:raise error('试点当前记录损坏')
  versions=db.execute('SELECT * FROM pilot_versions WHERE run_id=? ORDER BY version',(row['id'],)).fetchall()
  if len(versions)!=row['version'] or any(entry['version']!=index for index,entry in enumerate(versions,1)):raise error('试点版本历史不完整')
  for entry in versions:
   saved=json.loads(entry['body_json']);version(entry['version'])
   if saved.get('id')!=row['id'] or type(saved.get('version')) is not int or saved['version']!=entry['version'] or any(saved.get(k)!=v for k,v in clean(saved).items()):raise error('试点历史记录损坏')
  if json.loads(versions[-1]['body_json'])!=body:raise error('试点当前内容与快照不一致')
class Pilot:
 def __init__(self,store):self.store=store
 def get(self,ident,v=None):
  with self.store.lock,self.store.db() as db:return self._get(db,ident,v)
 def _get(self,db,ident,v=None):
  identity(ident)
  if v is not None:version(v)
  row=db.execute('SELECT body_json FROM pilot_runs WHERE id=?',(ident,)).fetchone() if v is None else db.execute('SELECT body_json FROM pilot_versions WHERE run_id=? AND version=?',(ident,v)).fetchone()
  if not row:raise error('试点记录不存在')
  body=json.loads(row[0]);return body|dict(summary=summary(body))
 def list(self):
  with self.store.lock,self.store.db() as db:return [self._get(db,r[0]) for r in db.execute('SELECT id FROM pilot_runs ORDER BY rowid DESC').fetchall()]
 def create(self,p):
  from store import dump,now
  body=clean(p)|dict(id=uuid.uuid4().hex,version=1,created_at=now(),updated_at=now())
  with self.store.lock,self.store.db() as db:
   if db.execute('SELECT count(*) FROM pilot_runs').fetchone()[0]>=200:raise error('本地最多200份试点记录')
   db.execute('INSERT INTO pilot_runs VALUES(?,?,?)',(body['id'],1,dump(body)));db.execute('INSERT INTO pilot_versions VALUES(?,?,?)',(body['id'],1,dump(body)));return self._get(db,body['id'])
 def save(self,ident,v,p):
  from store import dump,now,ConflictError
  version(v)
  with self.store.lock,self.store.db() as db:
   old=self._get(db,ident)
   if old['version']!=v:raise ConflictError('试点记录已更新，请重新打开核对')
   fields=clean(p,old)
   if all(old.get(k)==value for k,value in fields.items()):return old
   old.pop('summary',None);body=old|fields|dict(version=v+1,updated_at=now())
   db.execute('UPDATE pilot_runs SET version=?,body_json=? WHERE id=?',(v+1,dump(body),ident));db.execute('INSERT INTO pilot_versions VALUES(?,?,?)',(ident,v+1,dump(body)));return self._get(db,ident)
