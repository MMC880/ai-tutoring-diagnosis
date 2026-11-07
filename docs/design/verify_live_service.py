"""Explicit user-authorized live check, synthetic text only. Key enters via hidden stdin."""
from datetime import datetime, timezone
import getpass
import json
from pathlib import Path
import urllib.request
import urllib.error
import uuid

BASE='http://127.0.0.1:8765'
opener=urllib.request.build_opener(urllib.request.ProxyHandler({}))
token=''
run_id=datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')+'-'+uuid.uuid4().hex[:8]
folder=Path(__file__).resolve().parent/'live-api'/run_id
folder.mkdir(parents=True,exist_ok=True)
report={'run_id':run_id,'scope':'USER_AUTHORIZED_REAL_API_SYNTHETIC_TEXT_ONLY','provider':'https://discovery-api.intern-ai.org.cn/v1','model':'deepseek-v4.1-flash-1017','steps':[],'real_student_data':False}


def api(path,payload=None):
    headers={'Content-Type':'application/json'}
    if payload is not None: headers['X-Jinxue-Token']=token
    req=urllib.request.Request(BASE+'/api/'+path,data=None if payload is None else json.dumps(payload,ensure_ascii=False).encode(),headers=headers)
    with opener.open(req,timeout=65) as r: return json.loads(r.read())


def save():
    (folder/'verification.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')


def step(name,job):
    info={'name':name,'job_id':job['id'],'status':job['status'],'usage':job.get('usage'),'error':job.get('error','')}
    report['steps'].append(info); save()
    print(json.dumps(info,ensure_ascii=True),flush=True)


try:
    state=api('bootstrap'); token=state['csrf_token']
    report['before_event_count']=state['event_count']
    print('LOCAL_SERVICE_READY; hidden input only. No key is printed or written.',flush=True)
    key=getpass.getpass('API_KEY_MEMORY_ONLY: ')
    config=api('ai/settings',dict(base_url=report['provider'],model=report['model'],max_tokens=4096,api_key=key))
    key=None
    report['key_loaded']=config['key_loaded']; save()
    probe=api('ai/prepare',dict(mode='probe'))
    print('SENDING_FIXED_TEXT_PROBE_ONCE',flush=True)
    probe=api('ai/jobs/'+probe['id']+'/send',dict(consent=True)); step('fixed_text_connectivity',probe)
    if probe['status']!='SUCCEEDED':
        report['completion']='STOPPED_AT_PROBE'; save()
        raise SystemExit(2)
    questions=[
        dict(id='Q01',stem='求抛物线 y=−(x−2)²+3 的顶点坐标和对称轴。',answer='顶点 (−2,3)，对称轴 x=−2',correct_answer='',knowledge='',cause='',result='PENDING'),
        dict(id='Q02',stem='解方程 x²−5x+6=0。',answer='(x−2)(x−3)=0，所以 x=2 或 x=3',correct_answer='',knowledge='',cause='',result='PENDING'),
        dict(id='Q03',stem='化简 (x²−1)/(x−1)，并写出 x 的取值限制。',answer='(x−1)(x+1)/(x−1)=x+1',correct_answer='',knowledge='',cause='',result='PENDING'),
        dict(id='Q04',stem='求数据 6、8、10、12 的平均数。',answer='(6+8+10+12)/4=36/4=8',correct_answer='',knowledge='',cause='',result='PENDING')]
    paper=api('papers',dict(batch_id='SYN-LIVE-'+run_id,title='真实API验证 · 合成文字四题（非真实学生）',student_ref='SYN-LIVE-'+run_id,student_name='虚构学生 · 真实接口验证',questions=questions,documents=[]))
    report['paper_id']=paper['id']
    job=api('ai/prepare',dict(paper_id=paper['id'],version=paper['version'],questions=questions))
    print('SENDING_FOUR_SYNTHETIC_MATH_QUESTIONS_ONCE',flush=True)
    job=api('ai/jobs/'+job['id']+'/send',dict(consent=True)); step('synthetic_four_question_review',job)
    if job['status']!='SUCCEEDED':
        report['completion']='STOPPED_AT_MATH_RESULT'; save(); raise SystemExit(3)
    report['suggestions']=job['result']['questions']
    expected={'Q01':'INCORRECT','Q02':'CORRECT','Q03':'PARTIAL','Q04':'INCORRECT'}
    report['comparison']=[dict(id=q['id'],expected=expected[q['id']],actual=q['result'],match=q['result']==expected[q['id']]) for q in report['suggestions']]
    report['grading_note']='Q03 PARTIAL is synthetic teacher policy; differences require teacher review, not an automatic accuracy conclusion.'
    job=api('ai/jobs/'+job['id']+'/apply',dict(consent=True)); step('apply_only_to_unconfirmed_draft',job)
    updated=api('papers/'+paper['id']); after=api('bootstrap')
    report['checks']={
        'new_unconfirmed_version':updated['version']==2 and updated['confirmed_version']==0,
        'original_answers_preserved':all(a['answer']==b['answer'] for a,b in zip(questions,updated['questions'])),
        'no_confirmation_events_added':after['event_count']==report['before_event_count'],
        'four_question_ids_preserved':{q['id'] for q in updated['questions']}==set(expected)}
    report['completion']='LIVE_TEXT_PIPELINE_COMPLETE_WAITING_TEACHER'
    report['image_capability']='NOT_TESTED'
    save()
    print('LIVE_TEXT_PIPELINE_COMPLETE_WAITING_TEACHER',flush=True)
except urllib.error.HTTPError as exc:
    report['local_api_http_error']=exc.code; report['completion']='LOCAL_API_ERROR'; save()
    print('LOCAL_API_HTTP_'+str(exc.code),flush=True)
    raise SystemExit(4)
except Exception as exc:
    report['error_type']=type(exc).__name__; report['completion']='INTERRUPTED_REVIEW_JOB_STATUS_BEFORE_RETRY'; save()
    print('STOPPED_'+type(exc).__name__,flush=True)
    raise SystemExit(5)
finally:
    key=None
    print('EVIDENCE='+str(folder/'verification.json'),flush=True)
