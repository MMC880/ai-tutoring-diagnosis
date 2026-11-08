// Batch intake: synthetic isolated rows only; no external model requests.
import {spawn} from 'node:child_process';
import {mkdtemp,readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {revealViewControl} from './teacher-browser-navigation.mjs';
const project=path.resolve(import.meta.dirname,'../..');
const output=path.join(project,'docs/design/practice-queue-browser');await mkdir(output,{recursive:true});
const tempBase=path.join(project,'app/.qa-temp');await mkdir(tempBase,{recursive:true});
const run=await mkdtemp(path.join(tempBase,'practice-queue-browser-'));
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
 verify('侧栏有补练复测待办入口',await evaluate("!!document.querySelector('[data-view=queue]')"));
 await click('[data-view=queue]');await until("!!document.querySelector('.queue-workspace')");
 verify('无当前卷也能进入空待办',await evaluate("!paper()&&document.querySelector('.queue-workspace').textContent.includes('当前范围暂无练习记录')"));
 await evaluate(`(async()=>{
  const create=async(ref,batch)=>{const p=await api('papers',{student_ref:ref,student_name:ref==='SYN-B'?'合成<img src=x onerror=alert(1)>':'合成'+ref,batch_id:batch,title:'合成数学卷',questions:[{id:'Q01',stem:'合成原题',answer:'原错误',result:'INCORRECT',knowledge:'顶点式',cause:'待核实'}]});await api('papers/'+p.id+'/confirm',{version:1,consent:true});return p;};
  const ex=async(p,approved=false)=>{const e=await api('exercises',{paper_id:p.id,question_id:'Q01',level:'基础巩固',stem:'合成练习',answer:'2',explanation:'教师答案不进入待办'});if(approved)await api('exercises/'+e.id+'/approve',{version:1,consent:true});return e;};
  const rt=async(e,result='CORRECT',condition='独立完成')=>api('retests',{exercise_id:e.id,version:1,result,condition,answer:'合成复测答案',consent:true,request_id:crypto.randomUUID()});
  const a=await create('SYN-A','SYN-BATCH'),b=await create('SYN-B','SYN-BATCH'),c=await create('SYN-C','SYN-OTHER');await create('SYN-EMPTY','SYN-EMPTY');
  const draft=await ex(a),waiting=await ex(a,true),wrong=await ex(a,true),observe=await ex(a,true),hinted=await ex(b,true),revised=await ex(c,true);
  await rt(wrong,'INCORRECT');await rt(observe);await rt(hinted,'CORRECT','有提示完成');await rt(revised);await api('exercises/'+revised.id+'/update',{version:1,level:'基础巩固',stem:'新版待审',answer:'3',explanation:'新教师答案'});
  globalThis.queueFixture={a:a.id,b:b.id,c:c.id,waiting:waiting.id,wrong:wrong.id,draft:draft.id,revised:revised.id,observe:observe.id};
  await load();view='queue';await render();
 })()`);
 verify('每组练习一行且不靠学生人数猜任务',await evaluate("document.querySelectorAll('.queue-item').length===6&&document.querySelector('[data-queue-count=total]').textContent==='6'"));
 verify('姓名按文字转义且答案不在待办',await evaluate("document.querySelector('.queue-workspace').textContent.includes('<img src=x')&&!document.querySelector('.queue-workspace img')&&!document.querySelector('.queue-workspace').textContent.includes('教师答案不进入待办')"));
 verify('新版待审保留旧版独立正确观察',await evaluate("(()=>{const t=document.querySelector('.queue-item[data-queue-id=\"'+queueFixture.revised+'\"]').textContent;return t.includes('题面待审')&&t.includes('当前练习V2')&&t.includes('复测题面V1')&&t.includes('独立答对')})()"));
 await evaluate("(async()=>{await api('exercises/'+queueFixture.revised+'/approve',{version:2,consent:true})})()");await click('[data-action=queue-refresh]');
 verify('新版批准但无新版复测仍等待复测',await evaluate("(()=>{const row=queueSnapshot.items.find(r=>r.id===queueFixture.revised),t=document.querySelector('.queue-item[data-queue-id=\"'+queueFixture.revised+'\"]').textContent;return row.action==='WAITING_RETEST'&&row.current_retest_count===0&&t.includes('当前版暂无复测')&&t.includes('复测题面V1')})()"));
 await evaluate("(async()=>{await api('retests',{exercise_id:queueFixture.revised,version:2,result:'CORRECT',condition:'独立完成',answer:'新版正确',consent:true,request_id:crypto.randomUUID()});await api('retests',{exercise_id:queueFixture.revised,version:1,result:'INCORRECT',condition:'独立完成',answer:'旧版迟交错误',consent:true,request_id:crypto.randomUUID()})})()");await click('[data-action=queue-refresh]');
 verify('旧版迟交不覆盖当前版观察',await evaluate("(()=>{const row=queueSnapshot.items.find(r=>r.id===queueFixture.revised);return row.action==='OBSERVE'&&row.current_last_retest.version===2&&row.last_retest.version===1&&row.last_retest.result==='INCORRECT'})()"));
 await evaluate("document.querySelector('.queue-item[data-queue-id=\"'+queueFixture.revised+'\"]').scrollIntoView({block:'start'})");await capture('03-queue-version-guard.png');
 await fill('#queue-batch','SYN-BATCH');await until("document.querySelectorAll('.queue-item').length===5");
 verify('按来源批次筛选不串其他批次',await evaluate("!document.querySelector('.queue-item[data-queue-id=\"'+queueFixture.revised+'\"]')"));
 await fill('#queue-filter','WAITING_RETEST');await until("document.querySelectorAll('.queue-item').length===1");
 verify('按处理类别筛选准确',await evaluate("document.querySelector('.queue-item').dataset.queueId===queueFixture.waiting"));
 const writesBefore=requests.filter(r=>r.method==='POST').length;
 await click('[data-action=queue-open]');await until("view==='practice'&&selectedExercise===queueFixture.waiting");
 verify('打开确切学生原卷和练习且不自动录入',await evaluate("paperId===queueFixture.a&&exercise().id===queueFixture.waiting&&exercise().version===1&&!document.querySelector('#modal').open&&!document.querySelector('#ex-consent').checked"));
 verify('导航无新增写请求',requests.filter(r=>r.method==='POST').length===writesBefore);
 await evaluate("(async()=>{view='queue';queueFilter='';await render()})()");
 await evaluate("(async()=>{await api('exercises/'+queueFixture.waiting+'/update',{version:1,level:'基础巩固',stem:'改版待审',answer:'3',explanation:'变更'})})()");
 await click(`[data-action=queue-open][data-queue-exercise="${await evaluate('queueFixture.waiting')}"]`);
 verify('候选改版后拦截并要求刷新',await evaluate("view==='queue'&&document.querySelector('#toast').textContent.includes('已更新')"));await click('[data-action=queue-refresh]');
 await evaluate("(async()=>{await api('retests',{exercise_id:queueFixture.wrong,version:1,result:'INCORRECT',condition:'独立完成',answer:'另一次错误',consent:true,request_id:crypto.randomUUID()})})()");
 await click(`[data-action=queue-open][data-queue-exercise="${await evaluate('queueFixture.wrong')}"]`);
 verify('新增同结果复测也使旧行失效',await evaluate("view==='queue'&&document.querySelector('#toast').textContent.includes('已更新')"));await click('[data-action=queue-refresh]');
 await evaluate("globalThis.queueOriginalApi=api;api=async function(path,...args){const result=await queueOriginalApi(path,...args);if(path==='bootstrap')await queueOriginalApi('retests',{exercise_id:queueFixture.wrong,version:1,result:'INCORRECT',condition:'独立完成',answer:'读取中新增复测',consent:true,request_id:crypto.randomUUID()});return result}");
 await click(`[data-action=queue-open][data-queue-exercise="${await evaluate('queueFixture.wrong')}"]`);
 verify('读取期间新增复测被最终清单核对拦截',await evaluate("view==='queue'&&document.querySelector('#toast').textContent.includes('读取期间')"));await evaluate('api=queueOriginalApi');await click('[data-action=queue-refresh]');
 await evaluate("api=async function(path,...args){const result=await queueOriginalApi(path,...args);if(path==='bootstrap')result.exercises.find(e=>e.id===queueFixture.wrong).student_id='wrong-student';return result}");
 await click(`[data-action=queue-open][data-queue-exercise="${await evaluate('queueFixture.wrong')}"]`);
 verify('bootstrap练习学生不匹配时不导航',await evaluate("view==='queue'&&document.querySelector('#toast').textContent.includes('原卷或练习已更新')"));await evaluate('api=queueOriginalApi');
 await evaluate("globalThis.queueOriginalApi=api;api=async function(path,...args){if(path==='bootstrap')await new Promise(r=>setTimeout(r,500));return queueOriginalApi(path,...args)}");
 await click(`[data-action=queue-open][data-queue-exercise="${await evaluate('queueFixture.wrong')}"]`);await fill('#queue-filter','OBSERVE');await delay(650);
 verify('读取中切筛选取消迟到导航',await evaluate("view==='queue'&&queueFilter==='OBSERVE'"));await evaluate('api=queueOriginalApi');await fill('#queue-filter','');await until("!!document.querySelector('.queue-item[data-queue-id=\"'+queueFixture.wrong+'\"]')");
 await evaluate("api=async function(path,...args){if(path==='bootstrap')await new Promise(r=>setTimeout(r,500));return queueOriginalApi(path,...args)}");
 await click(`[data-action=queue-open][data-queue-exercise="${await evaluate('queueFixture.wrong')}"]`);await evaluate("modal('<p>合成新窗口</p>');close()");await delay(650);
 verify('开窗再关闭仍取消待办跳转',await evaluate("view==='queue'&&!document.querySelector('#modal').open"));await evaluate('api=queueOriginalApi');
 await evaluate("api=async function(path,...args){if(path==='bootstrap')await new Promise(r=>setTimeout(r,500));return queueOriginalApi(path,...args)}");
 await click(`[data-action=queue-open][data-queue-exercise="${await evaluate('queueFixture.wrong')}"]`);await click('[data-view=profile]');await delay(650);
 verify('离开待办后旧请求不切回补练页',await evaluate("view==='profile'"));await evaluate('api=queueOriginalApi');await click('[data-view=queue]');
 await evaluate("api=async function(path,...args){if(path==='practice-queue')throw Error('合成清单读取失败');return queueOriginalApi(path,...args)}");await click('[data-action=queue-refresh]');
 verify('读取失败移除旧行并可重试',await evaluate("!!document.querySelector('.queue-error')&&!document.querySelector('.queue-item')"));await evaluate('api=queueOriginalApi');await click('[data-action=queue-refresh]');await until("document.querySelectorAll('.queue-item').length===5");
 await evaluate("document.querySelector('#toast').classList.remove('show')");await capture('01-queue-desktop.png');
 await command('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});await capture('02-queue-mobile.png');
 verify('390px待办列表不横向溢出',await evaluate("document.documentElement.scrollWidth<=innerWidth"));
 await fill('#queue-batch','SYN-EMPTY');await until("!document.querySelector('.queue-item')");
 verify('已有作业但无补练不伪造复测待办',await evaluate("document.querySelector('.queue-workspace').textContent.includes('当前范围暂无练习记录')"));
 verify('全程无AI准备发送和页面异常',requests.every(r=>!r.url.endsWith('/prepare')&&!r.url.endsWith('/send'))&&pageErrors.length===0);
} catch(e){failure=e.stack||String(e);} finally {
 if(ws){try{await command('Browser.close',{},false);}catch{}ws.close();}chrome.kill();service.kill();
 const report={scope:'隔离合成补练复测待办；非真实学生到期提醒或教学验收',checks,passed:checks.filter(c=>c.passed).length,total:checks.length,pageErrors,failure:failure||null};
 await writeFile(path.join(output,process.env.JINXUE_QUEUE_RED==='1'?'red.json':'verification.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({passed:report.passed,total:report.total,failure:report.failure,output}));if(failure)process.exitCode=1;
}
