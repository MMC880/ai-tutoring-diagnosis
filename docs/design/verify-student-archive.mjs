// Isolated synthetic teacher-led review UI; no external model requests.
import {spawn} from 'node:child_process';
import {mkdtemp,readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {revealViewControl} from './teacher-browser-navigation.mjs';
const project=path.resolve(import.meta.dirname,'../..');
const output=path.join(project,'docs/design/student-archive-browser');await mkdir(output,{recursive:true});
const tempBase=path.join(project,'app/.qa-temp');await mkdir(tempBase,{recursive:true});
const run=await mkdtemp(path.join(tempBase,'archive-browser-'));
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
async function selectStudent(id){await click('[data-action=archive-select][data-student="'+id+'"]');}
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
 await evaluate(`(async()=>{
  const first=paper(),qs=structuredClone(first.questions);qs[0].teacher_result='INCORRECT';qs[0].teacher_mark='A的原批注';
  const a=await api('papers/'+first.id+'/draft',{version:first.version,questions:qs});await api('papers/'+a.id+'/confirm',{version:a.version,consent:true});
  const a2=await api('papers',{student_ref:first.student_ref,student_name:first.student_name,batch_id:'SYN-A-DUP',title:'合成重复照片',documents:first.documents,questions:qs});await api('papers/'+a2.id+'/confirm',{version:a2.version,consent:true});
  const bq=qs.map(q=>({...q,result:'CORRECT',teacher_result:'CORRECT',teacher_mark:'B的原批注',cause:''}));
  const b=await api('papers',{student_ref:'SYN-ARCHIVE-B',student_name:'合成学生B',batch_id:'SYN-B',title:'合成B卷',documents:first.documents,questions:bq});await api('papers/'+b.id+'/confirm',{version:b.version,consent:true});
  qs[0].result='CORRECT';qs[0].grading_note='合成模拟老师复核后改判';qs[0].grading_resolved=true;
  const corrected=await api('papers/'+a.id+'/draft',{version:a.version,questions:qs});await api('papers/'+a.id+'/confirm',{version:corrected.version,consent:true});
  qs[0].answer='DRAFT_ONLY_NOT_CONFIRMED';await api('papers/'+a.id+'/draft',{version:corrected.version,questions:qs});
  window.archiveFixture={a:a.id,b:b.id,aStudent:a.student_id,bStudent:b.student_id};await load();paperId=a.id;profileStudentId=a.student_id;view='profile';await render();
 })()`);
 verify('档案可按学生独立选择',await evaluate("document.querySelectorAll('[data-action=archive-select]').length===2"));
 verify('个人摘要按照片去重并保留完整历史',await evaluate("currentProfile.archive_summary.current_records===4&&currentProfile.archive_summary.history_events===12&&currentProfile.archive_summary.duplicate_count===4"));
 verify('顶部待补数与去重记录一致',await evaluate("document.querySelector('[data-archive-wrong]').textContent==='2'&&currentProfile.current_evidence.filter(e=>['INCORRECT','PARTIAL'].includes(e.result)).length===2"));
 verify('待审修订没有替换已确认原答',await evaluate("currentProfile.current_evidence.every(e=>e.question.answer!=='DRAFT_ONLY_NOT_CONFIRMED')&&currentProfile.archive_summary.pending_papers===1"));
 await evaluate("window.archiveOldEvent=currentProfile.events.find(e=>e.question_id==='Q01'&&e.revision===2).id;window.archiveBefore=JSON.stringify(data.papers)");
 await click('[data-action=archive-open][data-event="'+await evaluate('window.archiveOldEvent')+'"]');
 await until("!!document.querySelector('.archive-evidence')");
 verify('历史窗口显示旧原答和原批注',await evaluate("document.querySelector('.archive-evidence').textContent.includes('A的原批注')&&!document.querySelector('.archive-evidence').textContent.includes('DRAFT_ONLY_NOT_CONFIRMED')"));
 verify('历史与待审修订明确区分',await evaluate("document.querySelector('.archive-evidence').textContent.includes('历史确认')&&document.querySelector('.archive-evidence').textContent.includes('待审修订')"));
 verify('历史窗口只读且有原件链接',await evaluate("document.querySelectorAll('.archive-evidence input,.archive-evidence textarea,.archive-evidence select').length===0&&!!document.querySelector('.archive-evidence a[href^=\"/api/files/\"]')"));
 await capture('01-archive-desktop.png');
 await click('[data-action=archive-latest]');await until("document.querySelector('.archive-evidence')?.textContent.includes('本题在此卷的最近确认')");
 verify('可打开同题最近确认并保留旧历史',await evaluate("document.querySelector('.archive-evidence').textContent.includes('合成模拟老师复核后改判')&&currentProfile.events.length===12"));
 await click('[data-action=close]');
 verify('跨学生事件读取被拒绝',await evaluate("(async()=>{try{await api('profiles/'+archiveFixture.bStudent+'/evidence/'+archiveOldEvent);return false}catch(e){return e.message.includes('不属于')}})()"));
 await selectStudent(await evaluate('archiveFixture.bStudent'));
 await until("currentProfile?.student.id===archiveFixture.bStudent");
 verify('同照片的另一学生不与A混档',await evaluate("currentProfile.events.length===4&&currentProfile.archive_summary.duplicate_count===0&&document.querySelector('[data-archive-wrong]').textContent==='0'&&!document.querySelector('main').textContent.includes('A的原批注')"));
 await selectStudent(await evaluate('archiveFixture.aStudent'));await until("currentProfile?.student.id===archiveFixture.aStudent");
 // Delay only A's evidence GET. Switching students must invalidate the eventual response.
 await evaluate("window.originalArchiveApi=api;api=async function(path,payload){if(path==='profiles/'+archiveFixture.aStudent+'/evidence/'+archiveOldEvent)return await new Promise((resolve,reject)=>{window.releaseArchiveEvidence=()=>originalArchiveApi(path,payload).then(resolve,reject)});return originalArchiveApi(path,payload)}");
 await click('[data-action=archive-open][data-event="'+await evaluate('window.archiveOldEvent')+'"]');
 await selectStudent(await evaluate('archiveFixture.bStudent'));await until("currentProfile?.student.id===archiveFixture.bStudent");
 await selectStudent(await evaluate('archiveFixture.aStudent'));await until("currentProfile?.student.id===archiveFixture.aStudent");
 await evaluate("releaseArchiveEvidence();true");await until("!busy");
 verify('离开后切回原学生也拒绝旧请求',await evaluate("!document.querySelector('.archive-evidence')&&currentProfile.student.id===archiveFixture.aStudent"));
 await evaluate("api=originalArchiveApi");
 await selectStudent(await evaluate('archiveFixture.bStudent'));await until("currentProfile?.student.id===archiveFixture.bStudent");
 const bEvent=await evaluate('currentProfile.events[0].id');await click('[data-action=archive-open][data-event="'+bEvent+'"]');
 await until("!!document.querySelector('.archive-evidence')");
 await command('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});await capture('02-archive-mobile.png');
 verify('窄屏证据窗口不横向溢出',await evaluate("document.querySelector('#modal').scrollWidth<=document.querySelector('#modal').clientWidth+1"));
 await click('[data-action=archive-current]');await until("view==='review'&&paperId===archiveFixture.b");
 verify('返回原卷仍对应当前学生',await evaluate("paper().student_id===archiveFixture.bStudent"));
 verify('档案查看不写成绩或调用AI',await evaluate("JSON.stringify(data.papers)===archiveBefore")&&requests.every(u=>!u.endsWith('/send')&&!u.endsWith('/prepare'))&&pageErrors.length===0,JSON.stringify(pageErrors));
}catch(e){failure=e.stack||String(e);}
finally{
 if(ws?.readyState===WebSocket.OPEN){try{await command('Browser.close',{},false);}catch{}ws.close();}
 if(chrome.exitCode===null)chrome.kill();if(service.exitCode===null)service.kill();
 const report={scope:'隔离合成学生档案、历史原题、切换和重复控制；非真实学情验收',checks,passed:checks.filter(c=>c.passed).length,total:checks.length,pageErrors,failure:failure||null,dataDir};
 const name=process.env.JINXUE_ARCHIVE_RED==='1'?'red.json':'verification.json';await writeFile(path.join(output,name),JSON.stringify(report,null,2));console.log(JSON.stringify({passed:report.passed,total:report.total,failure:report.failure,output}));if(failure)process.exitCode=1;
}
