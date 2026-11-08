// Batch intake: synthetic isolated rows only; no external model requests.
import {spawn} from 'node:child_process';
import {mkdtemp,readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {revealViewControl} from './teacher-browser-navigation.mjs';
const project=path.resolve(import.meta.dirname,'../..');
const output=path.join(project,'docs/design/batch-intake-browser');await mkdir(output,{recursive:true});
const tempBase=path.join(project,'app/.qa-temp');await mkdir(tempBase,{recursive:true});
const run=await mkdtemp(path.join(tempBase,'intake-browser-'));
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
 ws.onmessage=ev=>{const m=JSON.parse(ev.data);if(m.id){const p=pending.get(m.id);pending.delete(m.id);if(p)m.error?p.reject(Error(m.error.message)):p.resolve(m.result);}if(m.method==='Network.requestWillBeSent')requests.push(m.params.request.url);if(m.method==='Runtime.exceptionThrown')pageErrors.push(m.params.exceptionDetails.text);};
 const target=await command('Target.createTarget',{url:'about:blank'},false);
 session=(await command('Target.attachToTarget',{targetId:target.targetId,flatten:true},false)).sessionId;
 await command('Runtime.enable');await command('Network.enable');
 await command('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
 await command('Page.navigate',{url:base});await until("typeof data!=='undefined'&&data&&document.querySelector('[data-action=seed]')");

 await click('.main-nav [data-view=registration]');await until("!!document.querySelector('#registration-page')");
 verify('批次收件入口存在',await evaluate("!!document.querySelector('[data-view=intake]')"));
 await click('[data-view=intake]');await until("!!document.querySelector('#intake-empty')");
 verify('空库不捏造应收人数或未交学生',await evaluate("document.querySelector('#intake-empty').textContent.includes('尚未收到')&&!document.querySelector('#intake-batch')"));
 await command('Page.navigate',{url:base+'/#intake'});await until("!!document.querySelector('#intake-empty')");
 verify('无当前卷可直接访问批次页',await evaluate("view==='intake'&&paperId===''") );
 await evaluate(`(async()=>{
 const seeded=await api('seed',{});const docs=seeded.documents;
 const qs=structuredClone(seeded.questions);qs.forEach(q=>{q.recognition_notes='';q.recognition_resolved=true;q.result='CORRECT'});
 const first=await api('papers',{student_ref:'SYN-BATCH-A',student_name:'合成学生A <img src=x onerror=alert(1)>',batch_id:'SYN-课堂A',title:'合成待审卷',questions:qs,documents:docs});
 const second=await api('papers',{student_ref:'SYN-BATCH-B',student_name:'合成学生B',batch_id:'SYN-课堂A',title:'合成缺材料',questions:qs.map((q,i)=>({...q,result:i===1?'MISSING':'CORRECT'})),documents:docs});await api('papers/'+second.id+'/confirm',{version:second.version,consent:true});
 const other=await api('papers',{student_ref:'SYN-BATCH-C',student_name:'合成学生C',batch_id:'SYN-课堂B',title:'参考照片',questions:qs,documents:docs.map(d=>({id:d.id,role:'参考答案'}))});
 window.intakeFixture={first:first.id,second:second.id,other:other.id,firstStudent:first.student_id};await load();await render();
 })()`);
 await fill('#intake-batch','SYN-课堂A');await until("document.querySelectorAll('.intake-paper').length===2");
 verify('批次仅列已收两卷而不是全班已收齐',await evaluate("document.querySelector('[data-intake-count=received]').textContent==='2'&&document.querySelector('.intake-workspace').textContent.includes('应收人数未知')"));
 verify('批次页不混入其他批次的当前整卷选择器',await evaluate("!document.querySelector('#paper-select')"));
 verify('本版确认与缺材料分开显示',await evaluate("document.querySelector('[data-intake-count=confirmed]').textContent==='1'&&document.querySelector('[data-paper=\"'+intakeFixture.second+'\"]').textContent.includes('缺材料1题')"));
 verify('相同照片跨学生只提醒归属',await evaluate("document.querySelectorAll('.intake-shared').length===2&&document.querySelector('.intake-workspace').textContent.includes('核对归属')"));
 verify('学生文字转义且未注入图片',await evaluate("document.querySelector('.intake-workspace').textContent.includes('<img src=x onerror=alert(1)>')&&!document.querySelector('.intake-workspace img')"));
 await fill('#intake-filter','waiting');await until("document.querySelectorAll('.intake-paper').length===1");
 verify('待审核筛选只显示未确认学生',await evaluate("document.querySelector('.intake-paper').dataset.paper===intakeFixture.first"));
 await fill('#intake-filter','issues');await until("document.querySelectorAll('.intake-paper').length===2");
 await capture('01-intake-desktop.png');

 await evaluate("(async()=>{const p=await api('papers/'+intakeFixture.first);const qs=structuredClone(p.questions);qs[0].answer+='（合成另一窗口修订）';await api('papers/'+p.id+'/draft',{version:p.version,questions:qs})})()");
 await click('[data-action=intake-open]');
 verify('过期行不能直接打开旧版本',await evaluate("view==='intake'&&document.querySelector('#toast').textContent.includes('已更新')"));
 await click('[data-action=intake-refresh]');await until("document.querySelector('[data-paper=\"'+intakeFixture.first+'\"]').textContent.includes('V2')");
 const before=await evaluate("(async()=>{const r=await api('bootstrap');return {papers:r.papers,event_count:r.event_count}})()");
 await click('[data-action=intake-open]');await until("view==='review'&&document.querySelector('#questions')");
 verify('打开准确学生整卷',await evaluate("paperId===intakeFixture.first&&paper().student_id===intakeFixture.firstStudent&&paper().batch_id==='SYN-课堂A'"));
 await click('[data-view=intake]');await until("document.querySelector('#intake-batch')?.value==='SYN-课堂A'");
 verify('回批次保留当前筛选与批次',await evaluate("document.querySelector('#intake-filter').value==='issues'&&document.querySelectorAll('.intake-paper').length===2"));
 await fill('#intake-batch','SYN-课堂B');await until("document.querySelectorAll('.intake-paper').length===1");
 verify('其他批次参考照片不误报作业重复',await evaluate("!document.querySelector('.intake-shared')&&document.querySelector('.intake-paper').textContent.includes('参考附件1份')&&document.querySelector('.intake-paper').textContent.includes('未附作业原件')"));
 await evaluate("window.realIntakeApi=api;window.releaseIntakeOpen=null;api=(route,payload)=>route.startsWith('papers/')&&payload===undefined?new Promise(resolve=>window.releaseIntakeOpen=async()=>resolve(await realIntakeApi(route,payload))):realIntakeApi(route,payload)");
 await click('[data-action=intake-open]');await until("typeof releaseIntakeOpen==='function'");
 await click('[data-view=pilot]');await until("view==='pilot'");await evaluate("releaseIntakeOpen()");await delay(250);
 verify('迟到打开结果不跨页带回学生',await evaluate("view==='pilot'&&paperId===intakeFixture.first"));await evaluate("api=realIntakeApi");
 await click('[data-view=intake]');await until("!!document.querySelector('#intake-batch')");
 await evaluate("window.realIntakeApi=api;window.releaseIntakeList=null;api=(route,payload)=>route==='intake'?new Promise(resolve=>window.releaseIntakeList=async()=>resolve(await realIntakeApi(route,payload))):realIntakeApi(route,payload)");
 await click('[data-action=intake-refresh]');await until("typeof releaseIntakeList==='function'");await click('[data-view=pilot]');await until("view==='pilot'");await evaluate("releaseIntakeList()");await delay(250);
 verify('迟到批次摘要不覆盖已切换页面',await evaluate("view==='pilot'&&!document.querySelector('.intake-workspace')"));await evaluate("api=realIntakeApi");
 await click('[data-view=intake]');await until("!!document.querySelector('#intake-batch')");
 await command('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});await capture('02-intake-mobile.png');
 await evaluate("document.querySelector('.intake-list').scrollIntoView({block:'start'})");await capture('03-intake-mobile-paper.png');
 verify('窄屏无横向溢出',await evaluate("document.documentElement.scrollWidth<=innerWidth"));
 const after=await evaluate("(async()=>{const r=await api('bootstrap');return {papers:r.papers,event_count:r.event_count}})()");
 verify('浏览和导航不写入卷面与确认事件',JSON.stringify(before)===JSON.stringify(after));
 verify('无模型请求和页面异常',pageErrors.length===0&&requests.every(u=>!u.endsWith('/send')&&!u.endsWith('/prepare')));
} catch(e){failure=e.stack||String(e);} finally {
 if(ws){try{await command('Browser.close',{},false);}catch{}ws.close();}chrome.kill();service.kill();
 const report={scope:'隔离合成批次收件，不代表真实识读或教师省时',checks,passed:checks.filter(c=>c.passed).length,total:checks.length,pageErrors,failure:failure||null};
 await writeFile(path.join(output,process.env.JINXUE_INTAKE_RED==='1'?'red.json':'verification.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({passed:report.passed,total:report.total,failure:report.failure,output}));if(failure)process.exitCode=1;
}
