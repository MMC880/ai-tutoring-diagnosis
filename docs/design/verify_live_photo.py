"""Authorized synthetic-image live probe and transcription. Never embeds a credential."""
from datetime import datetime,timezone
import base64
import argparse
import getpass
import io
import json
from pathlib import Path
import urllib.request
import urllib.error
import uuid
from PIL import Image

BASE='http://127.0.0.1:8765'; token=''
opener=urllib.request.build_opener(urllib.request.ProxyHandler({}))
project=Path(__file__).resolve().parents[2]
run_id=datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')+'-'+uuid.uuid4().hex[:8]
folder=Path(__file__).resolve().parent/'live-photo'/run_id; folder.mkdir(parents=True,exist_ok=True)
report=dict(run_id=run_id,scope='AUTHORIZED_REAL_API_SYNTHETIC_IMAGE_ONLY',steps=[],real_student_data=False)
parser=argparse.ArgumentParser(); parser.add_argument('--reuse-paper'); parser.add_argument('--question-one',action='store_true'); args=parser.parse_args()


def api(path,payload=None,binary=False):
    headers={'Content-Type':'application/json'}
    if payload is not None: headers['X-Jinxue-Token']=token
    req=urllib.request.Request(BASE+'/api/'+path,data=None if payload is None else json.dumps(payload,ensure_ascii=False).encode(),headers=headers)
    with opener.open(req,timeout=65) as r:
        raw=r.read(); return raw if binary else json.loads(raw)


def save(): (folder/'verification.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')


def record(name,job):
    summary=dict(name=name,job_id=job['id'],mode=job['mode'],status=job['status'],usage=job.get('usage'),error=job.get('error',''))
    report['steps'].append(summary); save(); print(json.dumps(summary,ensure_ascii=True),flush=True)


try:
    health=api('health')
    if health['version']!='0.3.0': raise RuntimeError('VERSION_NOT_READY')
    state=api('bootstrap'); token=state['csrf_token']; report['before_event_count']=state['event_count']
    print('V03_READY; HIDDEN_INPUT_ONLY',flush=True)
    key=getpass.getpass('API_KEY_MEMORY_ONLY: ')
    cfg=api('ai/settings',dict(base_url='https://discovery-api.intern-ai.org.cn/v1',model='deepseek-v4.1-flash-1017',max_tokens=4096,api_key=key)); key=None
    report['provider']=cfg['base_url']; report['model']=cfg['model']; save()
    probe=api('ai/prepare',dict(mode='vision_probe'))
    data=probe['payload']['messages'][1]['content'][1]['image_url']['url']
    (folder/'synthetic-digit-probe.png').write_bytes(base64.b64decode(data.split(',')[1]))
    print('SENDING_RANDOM_DIGIT_IMAGE_ONCE',flush=True)
    probe=api('ai/jobs/'+probe['id']+'/send',dict(consent=True)); record('random_digit_image_probe',probe)
    if probe['status']!='SUCCEEDED':
        report['completion']='IMAGE_CAPABILITY_NOT_VERIFIED'; save(); raise SystemExit(2)
    raw=(project/'app/web/assets/synthetic-homework.png').read_bytes()
    if args.reuse_paper:
        import hashlib
        paper=api('papers/'+args.reuse_paper)
        if not paper['student_ref'].startswith('SYN-PHOTO-LIVE-') or (paper['version']!=1 and not args.question_one) or paper['confirmed_version']!=0: raise RuntimeError('REUSE_SCOPE_INVALID')
        document=paper['documents'][0]
        if document['sha256']!=hashlib.sha256(raw).hexdigest(): raise RuntimeError('NOT_THE_SYNTHETIC_PHOTO')
    else:
        document=api('documents',dict(filename='合成数学照片.png',data=base64.b64encode(raw).decode()))
        paper=api('papers',dict(student_ref='SYN-PHOTO-LIVE-'+run_id,student_name='虚构学生 · 照片接口验证',batch_id='SYN-PHOTO-LIVE-'+run_id,title='合成照片四题 · 真实接口转写验证',documents=[document],questions=[dict(id='Q01',stem='待录入原题',answer='',correct_answer='',knowledge='',cause='',result='PENDING')]))
    preview=api('papers/'+paper['id']+'/image/'+document['id'],binary=True)
    with Image.open(io.BytesIO(preview)) as image: width,height=image.size
    region=[35,200,min(width,1010),min(height,465)] if args.question_one else [0,0,width,height]
    report['test_kind']='single_question_crop' if args.question_one else 'full_page'
    job=api('ai/prepare',dict(mode='vision_transcribe',paper_id=paper['id'],version=paper['version'],document_id=document['id'],crop=region,masks=[]))
    outgoing=job['payload']['messages'][1]['content'][1]['image_url']['url']
    (folder/'actual-outbound.png').write_bytes(base64.b64decode(outgoing.split(',')[1]))
    report['paper_id']=paper['id']; report['image_metadata']=job['metadata']; save()
    print('SENDING_ONLY_QUESTION_1_REGION_ONCE' if args.question_one else 'SENDING_SYNTHETIC_MATH_PHOTO_ONCE',flush=True)
    job=api('ai/jobs/'+job['id']+'/send',dict(consent=True)); record('synthetic_math_question1_crop' if args.question_one else 'synthetic_math_photo_transcription',job)
    if job['status']!='SUCCEEDED':
        report['diagnostic']=job['metadata'].get('diagnostic'); report['completion']='IMAGE_RESPONSE_NOT_USABLE'; save(); raise SystemExit(3)
    report['raw_transcription']=job['result']; report['completion']='WAITING_SYNTHETIC_TRANSCRIPTION_REVIEW'
    latest=api('papers/'+paper['id']); after=api('bootstrap')
    report['guards']=dict(paper_unchanged=latest['version']==paper['version'],confirmation_events_unchanged=after['event_count']==report['before_event_count'])
    save(); print('OCR_RETURNED_WAITING_REVIEW; NO_GRADE_NO_ARCHIVE',flush=True)
except urllib.error.HTTPError as exc:
    report['local_http_error']=exc.code; report['completion']='LOCAL_API_ERROR'; save(); print('LOCAL_HTTP_'+str(exc.code),flush=True); raise SystemExit(4)
except Exception as exc:
    report['error_type']=type(exc).__name__; report['completion']='INTERRUPTED_CHECK_JOB_BEFORE_RETRY'; save(); print('STOPPED_'+type(exc).__name__,flush=True); raise SystemExit(5)
finally:
    key=None; print('EVIDENCE='+str(folder/'verification.json'),flush=True)
