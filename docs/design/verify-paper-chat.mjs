// Teacher profile report: synthetic isolated rows only; no external model requests.
import {spawn} from 'node:child_process';
import {mkdtemp,readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {revealViewControl} from './teacher-browser-navigation.mjs';
const project=path.resolve(import.meta.dirname,'../..');
const output=path.join(project,'docs/design/paper-chat-browser');await mkdir(output,{recursive:true});
const tempBase=path.join(project,'app/.qa-temp');await mkdir(tempBase,{recursive:true});
const run=await mkdtemp(path.join(tempBase,'paper-chat-browser-'));
const dataDir=path.join(run,'data'),profile=path.join(run,'chrome');
const service=spawn('python',[path.join(project,'app/tests/browser_fixture_server.py'),'--data-dir',dataDir,'--port','0'],{windowsHide:true,stdio:['ignore','pipe','pipe']});
let serviceLog='';service.stdout.on('data',b=>serviceLog+=b);service.stderr.on('data',b=>serviceLog+=b);
const chrome=spawn(String.raw`C:\Program Files\Google\Chrome\Application\chrome.exe`,['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check','--disable-background-networking','--disable-sync','--disable-extensions','--remote-debugging-port=0',`--user-data-dir=${profile}`,'about:blank'],{windowsHide:true,stdio:'ignore'});
const delay=ms=>new Promise(r=>setTimeout(r,ms));
const pending=new Map();let seq=0,ws,session,base,failure;
const checks=[],requests=[],pageErrors=[];
function verify(name,ok,detail=''){checks.push({name,passed:!!ok,detail});if(!ok)throw Error(name+': '+detail);}
async function command(method,params={},useSession=true){const id=++seq;return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{pending.delete(id);reject(Error('CDP timeout '+method));},15000);pending.set(id,{resolve:v=>{clearTimeout(timer);resolve(v);},reject:e=>{clearTimeout(timer);reject(e);}});ws.send(JSON.stringify({id,method,params,...(useSession&&session?{sessionId:session}:{})}));});}
async function evaluate(expression){const r=await command('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true,userGesture:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;}
async function until(expr){for(let i=0;i<80;i++){if(await evaluate(expr))return;await delay(80);}throw Error('wait failed '+expr);}
async function click(selector){await revealViewControl(selector,{evaluate,click,until});await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e||e.disabled)throw Error('Missing/disabled '+${JSON.stringify(selector)});e.click()})()`);await delay(160);}
async function fill(selector,value){await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});e.value=${JSON.stringify(value)};e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));})()`);}
async function capture(name){const r=await command('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});await writeFile(path.join(output,name),Buffer.from(r.data,'base64'));}
try{
 for(let i=0;i<80;i++){try{base=JSON.parse(await readFile(path.join(dataDir,'server.json'),'utf8')).url;break;}catch{if(service.exitCode!==null)throw Error(serviceLog);await delay(100);}}
 if(!base)throw Error('fixture not ready '+serviceLog);
 let active;for(let i=0;i<80;i++){try{active=(await readFile(path.join(profile,'DevToolsActivePort'),'utf8')).trim().split(/\r?\n/);break;}catch{await delay(100);}}
 if(!active)throw Error('Chrome not ready');
 ws=new WebSocket('ws://127.0.0.1:'+active[0]+active[1]);await new Promise((resolve,reject)=>{ws.addEventListener('open',resolve,{once:true});ws.addEventListener('error',reject,{once:true});});
 ws.onmessage=ev=>{const m=JSON.parse(ev.data);if(m.id){const p=pending.get(m.id);pending.delete(m.id);if(p)m.error?p.reject(Error(m.error.message)):p.resolve(m.result);}if(m.method==='Network.requestWillBeSent')requests.push({url:m.params.request.url,method:m.params.request.method});if(m.method==='Runtime.exceptionThrown')pageErrors.push(m.params.exceptionDetails.text);};
 const target=await command('Target.createTarget',{url:'about:blank'},false);
 session=(await command('Target.attachToTarget',{targetId:target.targetId,flatten:true},false)).sessionId;




 await command('Emulation.setDeviceMetricsOverride',{width:1440,height:1080,deviceScaleFactor:1,mobile:false});
 await command('Runtime.enable');await command('Network.enable',{maxPostDataSize:1024});
 await command('Page.navigate',{url:base});await until("typeof data!=='undefined'&&!!data&&document.querySelector('#app .shell')");

 await evaluate(`(async()=>{
 const c=document.createElement('canvas');c.width=200;c.height=140;const cx=c.getContext('2d');cx.fillStyle='white';cx.fillRect(0,0,200,140);cx.fillStyle='red';cx.fillRect(20,20,40,40);const doc=await api('documents',{filename:'synthetic.png',data:c.toDataURL('image/png').split(',')[1]});
 const create=async(ref,batch)=>api('papers',{documents:batch==='CHAT-A'?[doc]:[],student_ref:ref,student_name:'合成'+ref,batch_id:batch,title:'合成试卷',questions:[{id:'Q01',stem:'求 y=(x-2)²+3 的顶点',answer:'(-2,3)',correct_answer:'(2,3)',result:'INCORRECT',knowledge:'顶点式'}]});
 globalThis.chatFixture={a:await create('SYN-A','CHAT-A'),a2:await create('SYN-A','CHAT-B'),b:await create('SYN-B','CHAT-C')};
 aiSettings=await api('ai/settings');await api('ai/settings',{...aiSettings,api_key:'SYN-TEST-ONLY'});const probe=await api('ai/prepare',{mode:'probe'});await api('ai/jobs/'+probe.id+'/send',{consent:true});const vp=await api('ai/prepare',{mode:'vision_probe'});await api('ai/jobs/'+vp.id+'/send',{consent:true});await load();
 })()`);
 await click('[data-view="settings"]');await click('[data-view="ai"]');await click('[data-view="paper-chat"]');await until("!!document.querySelector('#paper-chat-student')");
 verify('对话入口不自动选择学生',await evaluate("!document.querySelector('#paper-chat-student').value"));
 await fill('#paper-chat-student',await evaluate('chatFixture.a.student_id'));await until("!!document.querySelector('[data-chat-paper]')");
 verify('仅列所选学生试卷',await evaluate("document.querySelectorAll('[data-chat-paper]').length===2"));
 await click('[data-chat-paper="'+await evaluate('chatFixture.a.id')+'"]');
 await click('[data-action=paper-chat-image]');await until("!!paperChat.editor?.image");await click('[data-action=paper-chat-whole]');await click('[data-action=paper-chat-mask-mode]');
 const rect=await evaluate("(()=>{const r=document.querySelector('#paper-chat-canvas').getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height}})()");
 await command('Input.dispatchMouseEvent',{type:'mousePressed',x:rect.x+rect.w*.1,y:rect.y+rect.h/7,button:'left',clickCount:1});
 await command('Input.dispatchMouseEvent',{type:'mouseMoved',x:rect.x+rect.w*.3,y:rect.y+rect.h*3/7,button:'left',buttons:1});
 await command('Input.dispatchMouseEvent',{type:'mouseReleased',x:rect.x+rect.w*.3,y:rect.y+rect.h*3/7,button:'left',clickCount:1});
 await click('[data-action=paper-chat-use-image]');verify('图片裁切遮挡加入本次材料但未发送',await evaluate("paperChat.images.length===1&&paperChat.images[0].masks.length===1"));
 await fill('#paper-chat-message','请根据选定试卷解释符号错误，给老师复习建议。');
 const sendsBefore=requests.filter(r=>r.url.endsWith('/send')).length;
 await click('[data-action="paper-chat-prepare"]');await until("!!document.querySelector('#paper-chat-send-consent')");
 verify('预览不会发送',requests.filter(r=>r.url.endsWith('/send')).length===sendsBefore);
 await click('[data-action=close]');await click('[data-action="paper-chat-prepare"]');await until("!!document.querySelector('#paper-chat-send-consent')");
 verify('取消预览后可重新生成且不发送',requests.filter(r=>r.url.endsWith('/send')).length===sendsBefore);
 verify('预览展示实际规范化PNG',await evaluate("!!document.querySelector('#paper-chat-job img')"));
 verify('发送默认需独立授权',await evaluate("!document.querySelector('#paper-chat-send-consent').checked&&document.querySelector('#paper-chat-send').disabled"));
 await click('#paper-chat-send-consent');await click('#paper-chat-send');await until("!!document.querySelector('#paper-chat-answer')");
 verify('纯文字回答正确显示且不执行标记',await evaluate("document.querySelector('#paper-chat-answer').textContent.includes('合成辅导建议')&&document.querySelector('#paper-chat-answer').textContent.includes('<script>')&&!document.querySelector('#paper-chat-answer script')"));
 verify('有本地Markdown导出入口',await evaluate("!!document.querySelector('[data-action=paper-chat-export]')"));
 const jobs=await (await fetch(base+'/api/ai/jobs')).json(),job=jobs.find(j=>j.mode==='paper_chat');
 verify('本地任务已保存回答',!!job&&job.status==='SUCCEEDED');
 const saved=await(await fetch(base+'/api/ai/jobs/'+job.id)).json();
 verify('实际外发题目无学生身份',!JSON.stringify(saved.payload).includes('SYN-A')&&!JSON.stringify(saved.payload).includes('student_id'));
 const md=await fetch(base+'/api/ai/jobs/'+job.id+'/markdown');const markdown=await md.text();
 verify('Markdown有回答且不含密钥',md.ok&&markdown.includes('合成辅导建议')&&!markdown.includes('SYN-TEST-ONLY'));
 verify('对话未自动归档或改判',(await(await fetch(base+'/api/bootstrap')).json()).event_count===0);
 await capture('01-paper-chat-answer.png');
 if(await evaluate("!!document.querySelector('[data-action=paper-chat-followup]')")){
 await click('[data-action=paper-chat-followup]');await until("!!document.querySelector('#paper-chat-message')");
 await fill('#paper-chat-message','再给一个讲解建议。');await click('[data-action=paper-chat-prepare]');await until("!!document.querySelector('#paper-chat-send-consent')");
 verify('追问仍须新授权',await evaluate("!document.querySelector('#paper-chat-send-consent').checked&&document.querySelector('#paper-chat-send').disabled"));
 await click('[data-action=close]');
 }
 verify('没有页面脚本异常',pageErrors.length===0,JSON.stringify(pageErrors));
} catch(e){failure=e.stack||String(e);} finally {
 if(ws){try{await command('Browser.close',{},false);}catch{}ws.close();}chrome.kill();service.kill();
 const report={scope:'隔离合成试卷对话，真实API与教学效果未验证',checks,passed:checks.filter(c=>c.passed).length,total:checks.length,pageErrors,failure:failure||null};
 await writeFile(path.join(output,process.env.JINXUE_REPORT_RED==='1'?'red.json':'verification.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({passed:report.passed,total:report.total,failure:report.failure,output}));if(failure)process.exitCode=1;
}
