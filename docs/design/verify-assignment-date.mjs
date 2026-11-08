// Teacher profile report: synthetic isolated rows only; no external model requests.
import {spawn} from 'node:child_process';
import {mkdtemp,readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {revealViewControl} from './teacher-browser-navigation.mjs';
const project=path.resolve(import.meta.dirname,'../..');
const output=path.join(project,'docs/design/assignment-date-browser');await mkdir(output,{recursive:true});
const tempBase=path.join(project,'app/.qa-temp');await mkdir(tempBase,{recursive:true});
const run=await mkdtemp(path.join(tempBase,'assignment-date-browser-'));
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
  const make=async ref=>api('papers',{student_ref:ref,student_name:ref,batch_id:'SYN-DATE',title:'合成卷',questions:[{id:'Q01',stem:'合成原题',answer:'原错误',result:'INCORRECT',knowledge:'分式',cause:'待核实'}]});
  const a=await make('SYN-A'),b=await make('SYN-B');await api('papers/'+a.id+'/confirm',{version:1,consent:true});globalThis.dateFixture={a,b};await load();paperId=a.id;view='review';await render();
 })()`);
 verify('原卷显示选填作业日期及入口',await evaluate("!!document.querySelector('[data-action=date-open]')&&document.querySelector('#assignment-date-summary').textContent.includes('未提供')"));
 const writesBefore=requests.filter(r=>r.method==='POST').length;
 await click('[data-action=date-open]');await until("!!document.querySelector('#assignment-date-value')");
 verify('旧卷默认空日期且无变化不保存',await evaluate("document.querySelector('#assignment-date-value').value===''&&document.querySelector('#assignment-date-save').disabled"));
 await fill('#assignment-date-value','2026-10-20');await click('[data-action=close]');
 verify('取消未提交日期零写入',requests.filter(r=>r.method==='POST').length===writesBefore);
 await click('[data-action=date-open]');await fill('#assignment-date-value','2026-10-20');await click('#assignment-date-save');await until("!document.querySelector('#modal').open&&paper().version===2");
 verify('只改日期生成新待审版本并保留原答',await evaluate("paper().assignment_date==='2026-10-20'&&paper().confirmed_version===1&&paper().questions[0].answer==='原错误'&&data.event_count===1&&!document.querySelector('#confirm-consent').checked"));
 await click('[data-view=profile]');await click('[data-action=archive-select][data-student=\"'+await evaluate('dateFixture.a.student_id')+'\"]');await until("!!document.querySelector('.learning-groups')");
 verify('未确认日期不套入旧历史',await evaluate("currentProfile.events[0].assignment_date===''&&document.querySelector('.timeline').textContent.includes('作业日期：未提供')"));
 await evaluate("(async()=>{await api('papers/'+dateFixture.a.id+'/confirm',{version:2,consent:true});await load();await render()})()");
 verify('新确认知识证据显示当次日期',await evaluate("currentProfile.learning_analysis.groups[0].evidence[0].assignment_date==='2026-10-20'&&document.querySelector('.learning-groups').textContent.includes('作业日期：2026-10-20')"));
 await click('[data-action=report-preview]');await until("!!document.querySelector('.profile-report-preview')");
 verify('教师学情报告注明作业日期并保留写入时间',await evaluate("document.querySelector('.profile-report-preview').textContent.includes('作业日期：2026-10-20')&&document.querySelector('.profile-report-preview').textContent.includes('写入时间')"));await click('[data-action=close]');
 await click('[data-view=review]');await click('[data-action=date-open]');await fill('#assignment-date-value','2026-10-21');
 await evaluate("(async()=>{const p=await api('papers/'+dateFixture.a.id);await api('papers/'+p.id+'/assignment-date',{version:p.version,assignment_date:'2026-10-22'})})()");
 await click('#assignment-date-save');
 verify('其他窗口改版时拒绝旧保存不误报',await evaluate("document.querySelector('#modal').open&&document.querySelector('#toast').textContent.includes('已更新')"));await click('[data-action=close]');
 await evaluate("(async()=>{await load();await render()})()");await click('[data-action=date-open]');await fill('#assignment-date-value','');await click('#assignment-date-save');await until("paper().assignment_date===''&&!document.querySelector('#modal').open");
 verify('清空日期保留旧确认日期与原事件',await evaluate("(async()=>{const p=await api('profiles/'+paper().student_id);return p.latest[0].assignment_date==='2026-10-20'&&p.events.length===2})()"));
 await click('[data-action=date-open]');await fill('#assignment-date-value','2026-10-23');
 await evaluate("globalThis.dateOriginalApi=api;api=async function(path,...args){const result=await dateOriginalApi(path,...args);if(path.endsWith('/assignment-date')&&args[0])await new Promise(r=>setTimeout(r,500));return result}");await click('#assignment-date-save');
 verify('保存期间锁定日期输入',await evaluate("document.querySelector('#assignment-date-value').disabled&&document.querySelector('#assignment-date-save').disabled"));
 await click('[data-action=close]');await evaluate("modal('<p>新核对窗口</p>')");await delay(650);
 verify('关闭已送达保存不覆盖新窗并说明可能已完成',await evaluate("document.querySelector('#modal').textContent.includes('新核对窗口')&&document.querySelector('#toast').textContent.includes('可能')"));await evaluate('api=dateOriginalApi;close()');
 verify('已送达保存结果可回读而非伪称取消',await evaluate("(async()=>((await api('papers/'+dateFixture.a.id)).assignment_date==='2026-10-23'))()"));
 await evaluate("(async()=>{await load();await render()})()");await click('[data-action=date-open]');await fill('#assignment-date-value','2026-10-24');
 await evaluate("api=async function(path,...args){if(path.endsWith('/assignment-date')&&args[0])throw Error('合成保存失败');return dateOriginalApi(path,...args)}");await click('#assignment-date-save');
 verify('失败保留输入可重试',await evaluate("document.querySelector('#assignment-date-value').value==='2026-10-24'&&!document.querySelector('#assignment-date-value').disabled&&document.querySelector('#toast').textContent.includes('保存失败')"));await evaluate('api=dateOriginalApi');await click('[data-action=close]');
 await fill('[data-q=Q01] [data-field=answer]','尚未保存原答');await click('[data-action=date-open]');
 verify('未保存原卷阻止日期窗口且保留编辑',await evaluate("dirty&&!document.querySelector('#modal').open&&document.querySelector('[data-q=Q01] [data-field=answer]').value==='尚未保存原答'"));
 await evaluate("(async()=>{dirty=false;await load();await render()})()");
 await click('[data-action=new]');verify('收件日期默认空不猜今天',await evaluate("document.querySelector('#new-assignment-date').value===''") );
 await click('.new-paper-options > summary');
 await fill('#new-ref','SYN-C');await fill('#new-name','合成C');await fill('#new-batch','SYN-CREATE');await fill('#new-title','合成新卷');await fill('#new-assignment-date','2026-09-10');
 await evaluate("document.querySelector('#new-assignment-date').focus()");await command('Input.dispatchKeyEvent',{type:'keyDown',key:'Backspace',code:'Backspace',windowsVirtualKeyCode:8});await command('Input.dispatchKeyEvent',{type:'keyUp',key:'Backspace',code:'Backspace',windowsVirtualKeyCode:8});
 const beforeInvalidCreate=requests.filter(r=>r.method==='POST').length;await click('[data-action=create-paper]');
 verify('收件不把未完成日期当未知创建',await evaluate("document.querySelector('#modal').open&&document.querySelector('#new-assignment-date').validity.badInput")&&requests.filter(r=>r.method==='POST').length===beforeInvalidCreate);
 await fill('#new-assignment-date','2026-09-10');await click('[data-action=create-paper]');await until("paper()?.student_ref==='SYN-C'");
 verify('新收件保留老师选填日期且未确认',await evaluate("paper().assignment_date==='2026-09-10'&&paper().confirmed_version===0"));
 await click('[data-action=date-open]');
 await evaluate("document.querySelector('#assignment-date-value').focus()");
 await command('Input.dispatchKeyEvent',{type:'keyDown',key:'Backspace',code:'Backspace',windowsVirtualKeyCode:8});await command('Input.dispatchKeyEvent',{type:'keyUp',key:'Backspace',code:'Backspace',windowsVirtualKeyCode:8});
 verify('未填完整的原生日历日期不会当成清空提交',await evaluate("document.querySelector('#assignment-date-value').validity.badInput&&document.querySelector('#assignment-date-save').disabled"),await evaluate("JSON.stringify({badInput:document.querySelector('#assignment-date-value').validity.badInput,disabled:document.querySelector('#assignment-date-save').disabled,value:document.querySelector('#assignment-date-value').value})"));
 await fill('#assignment-date-value','2026-09-10');await capture('01-assignment-date-desktop.png');
await command('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});await capture('02-assignment-date-mobile.png');
 verify('390px日期窗口无横向溢出',await evaluate("document.documentElement.scrollWidth<=innerWidth&&document.querySelector('#modal').scrollWidth<=document.querySelector('#modal').clientWidth+1"));
 verify('没有AI准备或发送及页面异常',requests.every(r=>!r.url.endsWith('/prepare')&&!r.url.endsWith('/send'))&&pageErrors.length===0);
} catch(e){failure=e.stack||String(e);} finally {
 if(ws){try{await command('Browser.close',{},false);}catch{}ws.close();}chrome.kill();service.kill();
 const report={scope:'隔离合成作业日期和历史确认，不代表真实日期核实或教学效果',checks,passed:checks.filter(c=>c.passed).length,total:checks.length,pageErrors,failure:failure||null};
 await writeFile(path.join(output,process.env.JINXUE_DATE_RED==='1'?'red.json':'verification.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({passed:report.passed,total:report.total,failure:report.failure,output}));if(failure)process.exitCode=1;
}
