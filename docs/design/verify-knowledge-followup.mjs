// Batch intake: synthetic isolated rows only; no external model requests.
import {spawn} from 'node:child_process';
import {mkdtemp,readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
const project=path.resolve(import.meta.dirname,'../..');
const output=path.join(project,'docs/design/knowledge-followup-browser');await mkdir(output,{recursive:true});
const tempBase=path.join(project,'app/.qa-temp');await mkdir(tempBase,{recursive:true});
const run=await mkdtemp(path.join(tempBase,'knowledge-followup-browser-'));
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
async function selectStudent(id){await click('[data-action=archive-select][data-student="'+id+'"]');}
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
  const q=(id,knowledge)=>({id,stem:'合成原题'+id,answer:'原错误',result:'INCORRECT',knowledge,question_type:'合成题型',cause:'待核实'});
  const create=async(ref,batch,questions)=>{const p=await api('papers',{student_ref:ref,batch_id:batch,title:'合成数学卷',questions});await api('papers/'+p.id+'/confirm',{version:1,consent:true});return p;};
  const exercise=async(p,id='Q01')=>api('exercises',{paper_id:p.id,question_id:id,level:'基础巩固',stem:'合成复测题',answer:'2',explanation:'合成讲解'});
  const approve=async(e)=>api('exercises/'+e.id+'/approve',{version:1,consent:true});
  const retest=async(e,result='CORRECT',condition='独立完成')=>api('retests',{exercise_id:e.id,version:1,result,condition,answer:'合成复测原答',consent:true,request_id:crypto.randomUUID()});
  const a=await create('SYN-A','SYN-FOLLOW-A',[q('Q01','顶点式'),q('Q02','一次函数')]);
  const e1=await exercise(a),e2=await exercise(a),e3=await exercise(a);
  await approve(e1);await approve(e2);await retest(e1);await retest(e2,'INCORRECT');
  await api('exercises/'+e1.id+'/update',{version:1,level:'基础巩固',stem:'新待审题面V2',answer:'3',explanation:'新讲解'});
  const b=await create('SYN-B','SYN-FOLLOW-B',[q('Q01','顶点式')]);const eb=await exercise(b);await approve(eb);await retest(eb,'CORRECT','有提示完成');
  const old=await create('SYN-A','SYN-HISTORICAL',[q('Q03','旧知识')]);const oldEx=await exercise(old,'Q03');
  old.questions[0].knowledge='新知识';await api('papers/'+old.id+'/draft',{version:1,questions:old.questions});await api('papers/'+old.id+'/confirm',{version:2,consent:true});
  globalThis.followFixture={a:a.id,b:b.id,e1:e1.id,e2:e2.id,e3:e3.id,eb:eb.id,sid:a.student_id,old:oldEx.id};
  await load();paperId=a.id;profileStudentId=a.student_id;view='profile';await render();
 })()`);
 const writesBefore=requests.filter(r=>r.method==='POST').length;
 verify('知识卡出现补练复测跟进入口',await evaluate("!!document.querySelector('.knowledge-followup')"));
 const group=await evaluate("currentProfile.learning_analysis.groups.find(g=>g.knowledge==='顶点式').id");
 const groupSel=`.learning-group[data-group="${group}"]`;
 verify('多组练习和复测数量分别显示',await evaluate(`document.querySelector(${JSON.stringify(groupSel)}).textContent.includes('3 组补练')&&document.querySelector(${JSON.stringify(groupSel)}).textContent.includes('2 次复测记录')`));
 verify('独立答对与仍需补齐不互相抵消',await evaluate(`(()=>{const s=document.querySelector(${JSON.stringify(groupSel)}).textContent;return s.includes('本次独立答对')&&s.includes('本次仍需讲解与补齐')&&s.includes('练习待老师审批')})()`));
 verify('原卷错误保持且不标掌握',await evaluate("currentProfile.archive_summary.counts.INCORRECT===3&&document.querySelector('[data-archive-wrong]').textContent==='3'&&document.querySelector('.learning-group[data-group=\"'+currentProfile.learning_analysis.groups.find(g=>g.knowledge==='顶点式').id+'\"] .knowledge-followup').textContent.includes('一次答对不认定掌握')"));
 verify('旧版本复测不套新待审题面',await evaluate(`document.querySelector(${JSON.stringify(groupSel)}).textContent.includes('当前练习V2')&&document.querySelector(${JSON.stringify(groupSel)}).textContent.includes('复测题面V1')&&document.querySelector(${JSON.stringify(groupSel)}).textContent.includes('待审题面')`));
 verify('旧知识关联未匹配时提示且过程保留',await evaluate("document.querySelector('.learning-groups').textContent.includes('1 组历史补练未归入当前知识组')&&!!document.querySelector('.learning-journey[data-exercise=\"'+followFixture.old+'\"]')"));
 verify('无补练知识保持空提示',await evaluate("[...document.querySelectorAll('.learning-group')].find(e=>e.querySelector('h3').textContent==='一次函数').textContent.includes('尚无关联补练')"));
 await click(`${groupSel} .knowledge-followup details summary`);
 await click(`${groupSel} [data-action=followup-locate][data-followup-exercise="${await evaluate('followFixture.e1')}"]`);
 verify('准确定位本组完整过程并聚焦',await evaluate("document.activeElement?.dataset.exercise===followFixture.e1&&document.activeElement.classList.contains('journey-focus')"));
 verify('完整过程仍保留旧题面与全部复测',await evaluate("document.querySelector('.learning-journey[data-exercise=\"'+followFixture.e1+'\"]').textContent.includes('合成复测题')&&document.querySelector('.learning-journey[data-exercise=\"'+followFixture.e1+'\"]').textContent.includes('合成复测原答')"));
 await capture('03-followup-focused.png');
 // A stale/tampered button must not locate another student's exercise.
 await evaluate(`(()=>{const b=document.querySelector(${JSON.stringify(groupSel)}+' [data-action=followup-locate]');b.dataset.followupExercise=followFixture.eb;b.click()})()`);await delay(180);
 verify('不定位其他学生或不在当前组的练习',await evaluate("document.querySelector('#toast').textContent.includes('已变化')&&!document.querySelector('.learning-journey[data-exercise=\"'+followFixture.eb+'\"]')"));
 await evaluate("(async()=>{await render()})()");
 await evaluate(`(()=>{const target=document.querySelector('.learning-journey[data-exercise="'+followFixture.e2+'"]');target.remove();const b=document.querySelector(${JSON.stringify(groupSel)}+' [data-followup-exercise="'+followFixture.e2+'"]');b.click()})()`);await delay(180);
 verify('缺过程卡时提示刷新而不猜测目标',await evaluate("document.querySelector('#toast').textContent.includes('重新读取')"));
 await evaluate("(async()=>{await render();document.querySelector('#toast').classList.remove('show');document.querySelector('.learning-group[data-group=\"'+currentProfile.learning_analysis.groups.find(g=>g.knowledge==='顶点式').id+'\"]').scrollIntoView({block:'start'})})()");await capture('01-followup-desktop.png');
 await command('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});await evaluate("document.querySelector('.learning-group[data-group=\"'+currentProfile.learning_analysis.groups.find(g=>g.knowledge==='顶点式').id+'\"] .knowledge-followup').scrollIntoView({block:'start'})");await capture('02-followup-mobile.png');
 verify('390px跟进摘要与按钮不横向溢出',await evaluate("document.documentElement.scrollWidth<=innerWidth"));
 await selectStudent(await evaluate("data.papers.find(p=>p.id===followFixture.b).student_id"));await until("currentProfile?.student.id===data.papers.find(p=>p.id===followFixture.b).student_id");
 verify('换学生后只显示其有提示复测',await evaluate("currentProfile.learning_analysis.groups[0].followup.exercise_count===1&&document.querySelector('.knowledge-followup').textContent.includes('本次有提示')&&!document.querySelector('.learning-journey[data-exercise=\"'+followFixture.e1+'\"]')"));
 verify('跟进浏览定位不新增写请求',requests.filter(r=>r.method==='POST').length===writesBefore);
 verify('全程无AI发送和页面异常',requests.every(r=>!r.url.endsWith('/prepare')&&!r.url.endsWith('/send'))&&pageErrors.length===0);
} catch(e){failure=e.stack||String(e);} finally {
 if(ws){try{await command('Browser.close',{},false);}catch{}ws.close();}chrome.kill();service.kill();
 const report={scope:'隔离合成按知识点跟进补练复测；非真实学生复测或教学效果验收',checks,passed:checks.filter(c=>c.passed).length,total:checks.length,pageErrors,failure:failure||null};
 await writeFile(path.join(output,process.env.JINXUE_FOLLOWUP_RED==='1'?'red.json':'verification.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({passed:report.passed,total:report.total,failure:report.failure,output}));if(failure)process.exitCode=1;
}
