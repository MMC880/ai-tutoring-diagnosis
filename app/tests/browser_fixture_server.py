"""TEST ONLY: isolated browser fixture, never contacts the selected real API."""
import argparse
import json
from pathlib import Path
import sys
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from server import make_server
from store import Store
import vision
vision.new_probe_code=lambda: '384217'
force_bad_ocr=False
single_ocr=False
omit_last=False
fail_after_first=False
continuation_ocr=False
ocr_calls=0


def fake_transport(config,key,payload):
    global ocr_calls
    if 'JINXUE_PAPER_CHAT' in str(payload['messages'][0]['content']):
        return {'choices':[{'message':{'content':'合成辅导建议：先核对顶点式符号，再安排同型复查。<script>不得执行</script>'},'finish_reason':'stop'}], 'usage':{'total_tokens':15}}
    content=payload['messages'][1]['content']
    try: text_body=json.loads(content) if isinstance(content,str) else None
    except ValueError: text_body=None
    if isinstance(content,list):
        if len(payload['messages'][0]['content'])<150:
            result={'code':'384217'}
        else:
            ocr_calls+=1
            if force_bad_ocr or fail_after_first and ocr_calls>1:
                return {'choices':[{'message':{'content':'synthetic invalid JSON'},'finish_reason':'stop'}],'usage':{'total_tokens':15}}
            result={'image_status':'PARTIAL','questions':[dict(id='Q01',stem='求 y=−(x−2)²+3 的顶点和对称轴',answer='顶点(−2,3)，轴x=−2',uncertainties=['answer：负号需对照原图']),dict(id='Q02',stem='解方程x²−5x+6=0',answer='x=2或x=3',uncertainties=[]),dict(id='Q03',stem='化简分式并写限制',answer='x+1',uncertainties=[]),dict(id='Q04',stem='求平均数',answer='36÷4=8',uncertainties=[])],'page_notes':['合成接口：Q01需核对符号']}
            if single_ocr: result['questions']=result['questions'][:1]
            if omit_last: result['questions']=result['questions'][:-1]
            if continuation_ocr:
                result={'image_status':'PARTIAL','questions':[dict(id='Q01',stem='续上题：补充验算步骤',answer='代回x=-2得到y=-13，需要再核对顶点。',uncertainties=['续录末行负号待核'])],'page_notes':[]}
    elif isinstance(text_body,dict) and 'source' in text_body:
        from tutoring_fixture import candidate_result
        result=candidate_result()
    elif 'questions' not in content:
        result={'ok':True}
    else:
        source=json.loads(content)['questions']
        result={'questions':[dict(id=q['id'],result='PENDING',correct_answer=q['correct_answer'],knowledge='合成接口标签',cause='') for q in source]}
    return {'choices':[{'message':{'content':json.dumps(result,ensure_ascii=False)},'finish_reason':'stop'}],
            'usage':{'prompt_tokens':12,'completion_tokens':3,'total_tokens':15}}


if __name__=='__main__':
    parser=argparse.ArgumentParser(); parser.add_argument('--data-dir',required=True); parser.add_argument('--port',type=int,default=0); parser.add_argument('--ocr-invalid',action='store_true'); parser.add_argument('--ocr-single',action='store_true'); parser.add_argument('--ocr-omit-last',action='store_true'); parser.add_argument('--ocr-fail-after-first',action='store_true')
    parser.add_argument('--ocr-continuation',action='store_true')
    args=parser.parse_args(); force_bad_ocr=args.ocr_invalid; single_ocr=args.ocr_single; omit_last=args.ocr_omit_last; fail_after_first=args.ocr_fail_after_first; continuation_ocr=args.ocr_continuation; store=Store(args.data_dir); server=make_server(store,args.port); server.ai.transport=fake_transport
    address='http://127.0.0.1:'+str(server.server_address[1])
    (store.root/'server.json').write_text(json.dumps(dict(url=address,mode='TEST_ONLY_FAKE_AI')),encoding='utf-8')
    print(address,flush=True)
    try: server.serve_forever()
    finally: server.server_close()
