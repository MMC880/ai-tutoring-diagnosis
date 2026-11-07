// Isolated synthetic teacher-led review UI; no external model requests.
import {spawn} from 'node:child_process';
import {mkdtemp,readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
const project=String.raw`E:\GPT\AI-Tutoring-Diagnosis`;
const output=path.join(project,'docs/design/pilot-records-browser');await mkdir(output,{recursive:true});
const tempBase=path.join(project,'app/.qa-temp');await mkdir(tempBase,{recursive:true});
const run=await mkdtemp(path.join(tempBase,'teaching-browser-'));
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
 await command('Page.navigate',{url:base});await until("typeof data!=='undefined'&&data&&document.querySelector('[data-view=pilot]')");
 await click('[data-view=pilot]');await until("!!document.querySelector('[data-action=pilot-new]')");
 verify('试点页不依赖已有学生卷',await evaluate("data.papers.length===0&&document.querySelector('.workspace').textContent.includes('尚无试点记录')"));
 await click('[data-action=pilot-new]');
 verify('默认合成演练、耗时全部未知',await evaluate("document.querySelector('#pilot-mode').value==='SYNTHETIC'&&[...document.querySelectorAll('[data-pilot-time]')].every(e=>e.value==='')&&!document.querySelector('#pilot-target-confirmed').checked"));
 await fill('#pilot-title','合成工作量演练');await click('[data-action=pilot-save]');await until("document.querySelectorAll('.pilot-record').length===1&&!document.querySelector('#modal').open");
 verify('空白记录不产生零耗时或通过结论',await evaluate("pilotRuns[0].summary.saving_minutes===null&&pilotRuns[0].summary.acceptance==='NOT_ASSESSED'&&document.querySelector('.pilot-record').textContent.includes('未知')"));
 await click('[data-action=pilot-edit]');await fill('#pilot-mode','REAL');await fill('#pilot-completed','10');
 for(const key of ['collect','organize','review','recapture','tutor','release']){await fill(`[data-pilot-time=baseline][data-phase=${key}]`,'10');await fill(`[data-pilot-time=assisted][data-phase=${key}]`,'5');}
 await fill('#pilot-target','20');await click('#pilot-target-confirmed');
 for(const key of ['ownership','recognition','review','loop'])await fill(`[data-pilot-check=${key}]`,'PASS');
 await fill('#pilot-notes','仅隔离演练，测试主动选择真实模式；不是老师实际结果。');
 await click('[data-action=pilot-save]');await until("pilotRuns[0].version===2&&!document.querySelector('#modal').open");
 verify('完整六环节自填对照正确',await evaluate("pilotRuns[0].summary.baseline_minutes===60&&pilotRuns[0].summary.assisted_minutes===30&&pilotRuns[0].summary.saving_minutes===30&&pilotRuns[0].summary.saving_percent===50"));
 verify('自填目标达到仍不自动验收',await evaluate("pilotRuns[0].summary.reported_threshold_met===true&&pilotRuns[0].summary.acceptance==='NOT_ASSESSED'&&document.querySelector('.pilot-record').textContent.includes('正式验收：未评定')"));
 verify('旧版未知记录保留',await evaluate("(async()=>{const p=await api('pilot/runs/'+pilotRuns[0].id+'/versions/1');return p.mode==='SYNTHETIC'&&p.summary.saving_minutes===null&&p.notes==='';})()"));
 verify('旧版本覆盖被拒绝',await evaluate("(async()=>{try{await api('pilot/runs/'+pilotRuns[0].id,{version:1,notes:'过期覆盖'});return false}catch(e){return e.message.includes('更新')}})()"));
 await click('[data-action=pilot-edit]');await fill('#pilot-target','21');verify('修改目标撤销上一版目标确认',await evaluate("!document.querySelector('#pilot-target-confirmed').checked"));await click('[data-action=close]');
 await capture('01-pilot-desktop.png');
 await evaluate("(async()=>{await api('pilot/runs/'+pilotRuns[0].id,{version:2,assisted:{collect:null},notes:'<img src=x onerror=bad>合成笔记'});await render();})()");
 verify('缺一个环节即保留未知，备注转义',await evaluate("pilotRuns[0].summary.saving_minutes===null&&document.querySelector('.pilot-record').textContent.includes('<img src=x')&&document.querySelectorAll('.pilot-record img').length===0"));
 await evaluate("(async()=>{const p=pilotRuns[0];await api('pilot/runs/'+p.id,{version:p.version,baseline:Object.fromEntries(Object.keys(p.baseline).map(k=>[k,0])),assisted:Object.fromEntries(Object.keys(p.assisted).map(k=>[k,0]))});await render();})()");
 verify('零基线不能计算省时比例或判目标达到',await evaluate("pilotRuns[0].summary.saving_percent===null&&pilotRuns[0].summary.reported_threshold_met===null"));
 await evaluate("(async()=>{const p=pilotRuns[0];await api('pilot/runs/'+p.id,{version:p.version,baseline:Object.fromEntries(Object.keys(p.baseline).map(k=>[k,10])),assisted:Object.fromEntries(Object.keys(p.assisted).map(k=>[k,20])),completed_students:3});await render();})()");
 verify('负节省不隐藏且部分样本不判整批目标',await evaluate("pilotRuns[0].summary.saving_minutes===-60&&pilotRuns[0].summary.reported_threshold_met===null"));
 await command('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});await capture('02-pilot-mobile.png');
 verify('窄屏记录可读',await evaluate("document.documentElement.scrollWidth<=innerWidth+1"));
 verify('没有学生事件和真实AI请求',await evaluate("(async()=>{const b=await api('bootstrap');return b.event_count===0&&b.papers.length===0&&b.exercises.length===0})()")&&requests.every(u=>u.startsWith(base)||u==='about:blank')&&requests.every(u=>!u.endsWith('/send')&&!u.endsWith('/prepare'))&&pageErrors.length===0,JSON.stringify(pageErrors));
}catch(e){failure=e.stack||String(e);}
finally{
 if(ws?.readyState===WebSocket.OPEN){try{await command('Browser.close',{},false);}catch{}ws.close();}
 if(chrome.exitCode===null)chrome.kill();if(service.exitCode===null)service.kill();
 const report={scope:'隔离合成试点自填表；非真实试点或验收',checks,passed:checks.filter(c=>c.passed).length,total:checks.length,pageErrors,failure:failure||null,dataDir};
 const name=process.env.JINXUE_TEACHING_RED==='1'?'red.json':'verification.json';await writeFile(path.join(output,name),JSON.stringify(report,null,2));console.log(JSON.stringify({passed:report.passed,total:report.total,failure:report.failure,output}));if(failure)process.exitCode=1;
}
