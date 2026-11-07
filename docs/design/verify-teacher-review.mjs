// Isolated synthetic teacher-led review UI; no external model requests.
import {spawn} from 'node:child_process';
import {mkdtemp,readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
const project=String.raw`E:\GPT\AI-Tutoring-Diagnosis`;
const output=path.join(project,'docs/design/teacher-review-browser');await mkdir(output,{recursive:true});
const tempBase=path.join(project,'app/.qa-temp');await mkdir(tempBase,{recursive:true});
const run=await mkdtemp(path.join(tempBase,'teacher-browser-'));
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
async function click(selector){await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e||e.disabled)throw Error('Missing/disabled '+${JSON.stringify(selector)});e.click()})()`);await delay(160);}
async function fill(selector,value){await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});e.value=${JSON.stringify(value)};e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));})()`);}
async function capture(name){const r=await command('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});await writeFile(path.join(output,name),Buffer.from(r.data,'base64'));}
try{
 for(let i=0;i<80;i++){try{base=JSON.parse(await readFile(path.join(dataDir,'server.json'),'utf8')).url;break;}catch{if(service.exitCode!==null)throw Error(serviceLog);await delay(100);}}
 if(!base)throw Error('fixture not ready '+serviceLog);
 let active;for(let i=0;i<80;i++){try{active=(await readFile(path.join(profile,'DevToolsActivePort'),'utf8')).trim().split(/\r?\n/);break;}catch{await delay(100);}}
 if(!active)throw Error('Chrome not ready');
 ws=new WebSocket('ws://127.0.0.1:'+active[0]+active[1]);await new Promise((resolve,reject)=>{ws.addEventListener('open',resolve,{once:true});ws.addEventListener('error',reject,{once:true});});
 ws.onmessage=ev=>{const m=JSON.parse(ev.data);if(m.id){const p=pending.get(m.id);pending.delete(m.id);if(p)m.error?p.reject(Error(m.error.message)):p.resolve(m.result);}if(m.method==='Network.requestWillBeSent')requests.push(m.params.request.url);if(m.method==='Runtime.exceptionThrown')pageErrors.push(m.params.exceptionDetails.text);};
 const target=await command('Target.createTarget',{url:'about:blank'},false);
 session=(await command('Target.attachToTarget',{targetId:target.targetId,flatten:true},false)).sessionId;
 await command('Runtime.enable');await command('Network.enable');
 await command('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
 await command('Page.navigate',{url:base});await until("typeof data!=='undefined'&&data&&document.querySelector('[data-action=seed]')");
 await click('[data-action=seed]');await until("document.querySelectorAll('#questions .question').length===4");
 const row='#questions .question[data-q="Q01"]';
 verify('显示老师原批改独立字段',await evaluate(`!!document.querySelector('${row} [data-field=teacher_result]')`));
 verify('老师原批注不强制填写',await evaluate(`!document.querySelector('${row} [data-field=teacher_mark]').required`));
 await fill(row+' [data-field=teacher_result]','INCORRECT');
 await fill(row+' [data-field=teacher_mark]','合成红叉，不明错因');
 await click('[data-action=save-paper]');
 verify('刷新保留老师原判与原批注',await evaluate("paper().questions[0].teacher_result==='INCORRECT'&&paper().questions[0].teacher_mark==='合成红叉，不明错因'"));
 await evaluate("(async()=>{const p=paper(),qs=structuredClone(p.questions);qs[0].ai_result='CORRECT';await api('papers/'+p.id+'/draft',{version:p.version,questions:qs});await refresh()})()");
 verify('AI候选与最终判定分开显示',await evaluate(`document.querySelector('${row} .grading-status').textContent.includes('正确')&&document.querySelector('${row} [data-field=result]').value==='INCORRECT'`));
 await click('#confirm-consent');await click('#confirm-paper');
 verify('未核清分歧不写正式事件',await evaluate("(async()=>((await api('bootstrap')).event_count===0&&document.querySelector('#toast').textContent.includes('分歧')))()"));
 await fill(row+' [data-field=grading_note]','老师核对后保留原判；AI建议不适用');
 await click(row+' [data-field=grading_resolved]');await click('[data-action=save-paper]');
 await click('#confirm-consent');await click('#confirm-paper');
 verify('说明加核清后整卷确认成功',await evaluate("paper().version===paper().confirmed_version&&data.event_count===4"));
 await click('#confirm-consent');await click('#confirm-paper');
 verify('重复确认不增加记录',await evaluate("data.event_count===4"));
 await click('[data-action=import-questions]');
 await evaluate("(()=>{const qs=structuredClone(paper().questions);qs[0].teacher_mark='';qs[0].teacher_result='';qs[0].grading_resolved=true;qs[0].grading_note='文件声称已核清';document.querySelector('#draft-json').value=JSON.stringify({questions:qs})})()");
 await click('[data-action=apply-import]');
 verify('JSON导入保留本地原判且不授权核清',await evaluate("paper().questions[0].teacher_result==='INCORRECT'&&paper().questions[0].teacher_mark==='合成红叉，不明错因'&&paper().questions[0].grading_resolved===false"));
 await click('#confirm-consent');await click('#confirm-paper');
 verify('导入不能绕过分歧归档拦截',await evaluate("(async()=>((await api('bootstrap')).event_count===4&&document.querySelector('#toast').textContent.includes('分歧')))()"));
 await fill(row+' [data-field=answer]','合成修订过程，需重新核对');
 verify('改原答撤销分歧与整卷同意',await evaluate(`!document.querySelector('${row} [data-field=grading_resolved]').checked&&!document.querySelector('#confirm-consent').checked&&document.querySelector('#confirm-paper').disabled`));
 await fill(row+' [data-field=result]','PENDING');await click('[data-action=save-paper]');
 await click('#confirm-consent');await click('#confirm-paper');
 verify('待核对允许留档但不算确定错误',await evaluate("(async()=>{const s=await api('summary?batch='+encodeURIComponent(paper().batch_id));return s.counts.PENDING===1&&s.counts.INCORRECT===1})()"));
 await fill(row+' [data-field=result]','CORRECT');
 await click(row+' [data-action=grading-use-teacher]');
 verify('采用老师原判不自动核清分歧',await evaluate(`document.querySelector('${row} [data-field=result]').value==='INCORRECT'&&!document.querySelector('${row} [data-field=grading_resolved]').checked`));
 await evaluate("(async()=>{const p=paper(),qs=structuredClone(p.questions);qs[1].result='PENDING';qs[1].recognition_notes='合成负号仍待核';qs[1].recognition_resolved=false;await api('papers/'+p.id+'/draft',{version:p.version,questions:qs});await refresh()})()");
 await click('[data-action=import-questions]');
 await evaluate("(()=>{const qs=structuredClone(paper().questions);for(const k of ['recognition_notes','recognition_notice','recognition_resolved'])delete qs[1][k];qs[1].result='INCORRECT';document.querySelector('#draft-json').value=JSON.stringify({questions:qs})})()");
 await click('[data-action=apply-import]');
 verify('导入不能抹掉识读疑点并改记错误',await evaluate("paper().questions[1].result==='PENDING'&&paper().questions[1].recognition_notes==='合成负号仍待核'&&paper().questions[1].recognition_resolved===false"));
 await evaluate(`document.querySelector('${row} .teacher-grading').scrollIntoView({block:'center'})`);await capture('01-teacher-review-desktop.png');
 await command('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
 await evaluate(`document.querySelector('${row} .teacher-grading').scrollIntoView({block:'start'})`);await capture('02-teacher-review-mobile.png');
 verify('窄屏教师字段区域可读无溢出',await evaluate(`(()=>{const e=document.querySelector('${row} .teacher-grading');return e.scrollWidth<=e.clientWidth+1})()`));
 verify('没有模型调用且页面无异常',requests.every(u=>u.startsWith(base)||u==='about:blank')&&requests.every(u=>!u.endsWith('/send'))&&pageErrors.length===0,JSON.stringify(pageErrors));
}catch(e){failure=e.stack||String(e);}
finally{
 if(ws?.readyState===WebSocket.OPEN){try{await command('Browser.close',{},false);}catch{}ws.close();}
 if(chrome.exitCode===null)chrome.kill();if(service.exitCode===null)service.kill();
 const report={scope:'隔离合成老师主判页面，非真实教师验收',checks,passed:checks.filter(c=>c.passed).length,total:checks.length,pageErrors,failure:failure||null,dataDir};
 const name=process.env.JINXUE_TEACHER_RED==='1'?'red.json':'verification.json';await writeFile(path.join(output,name),JSON.stringify(report,null,2));console.log(JSON.stringify({passed:report.passed,total:report.total,failure:report.failure,output}));if(failure)process.exitCode=1;
}
