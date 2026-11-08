// Isolated synthetic teacher-led review UI; no external model requests.
import {spawn} from 'node:child_process';
import {mkdtemp,readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
const project=path.resolve(import.meta.dirname,'../..');
const output=path.join(project,'app/.qa-temp/registration-browser');await mkdir(output,{recursive:true});
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
 await command('Page.navigate',{url:base});await until("!!document.querySelector('main')");
 await click('.main-nav [data-view=registration]');await until("!!document.querySelector('#registration-page')");
 verify('登记默认先选学生和作业，空库能收件',await evaluate("document.querySelector('#registration-page').textContent.includes('暂无学生')&&!!document.querySelector('#registration-page [data-action=new]')&&!document.querySelector('#questions')"));
 const fixture=await evaluate(`(async()=>{
  const questions=[{id:'Q01',stem:'计算2+3。',answer:'4',correct_answer:'5',knowledge:'整数运算',cause:'待核实',result:'INCORRECT',teacher_result:'INCORRECT',teacher_mark:'合成原批注'}, {id:'Q02',stem:'读取手写结果',answer:'待核实',knowledge:'',cause:'',result:'PENDING',teacher_result:'PENDING',recognition_notes:'末位字迹需核对',recognition_resolved:false}, {id:'Q03',stem:'缺失页题目',answer:'',knowledge:'',cause:'',result:'MISSING',teacher_result:'MISSING'}, {id:'Q04',stem:'计算1+1。',answer:'2',correct_answer:'2',knowledge:'整数运算',cause:'',result:'CORRECT',teacher_result:'CORRECT'}];
  const a=await api('papers',{student_ref:'SYN-REG-A',student_name:'合成重名学生',batch_id:'SYN-REG-01',title:'A第一次作业',questions});
  const a2=await api('papers',{student_ref:'SYN-REG-A',student_name:'合成重名学生',batch_id:'SYN-REG-02',title:'A第二次作业',assignment_date:'2026-10-20',questions:[{id:'Q01',stem:'1+1',answer:'2',result:'CORRECT',knowledge:'整数运算'}]});
  const b=await api('papers',{student_ref:'SYN-REG-B',student_name:'合成重名学生',batch_id:'SYN-REG-B',title:'B自己的作业',questions:[{id:'Q01',stem:'3+3',answer:'6',result:'CORRECT',knowledge:'整数运算'}]});
  return {a:a.id,a2:a2.id,b:b.id,sid:a.student_id,bid:b.student_id};
 })()`);
 await command('Page.reload');await until("document.querySelectorAll('[data-action=registration-select]').length===2");
 verify('有数据仍不自动挑学生或第一份作业',await evaluate("document.querySelector('#registration-content').textContent.includes('先选学生')&&!document.querySelector('#questions')"));
 const choose=async id=>{await click('[data-action=registration-select][data-student="'+id+'"]');await until(`document.querySelector('#registration-content')?.dataset.student===${JSON.stringify(id)}`);};
 await choose(fixture.sid);
 verify('同名以编号区分，作业清单只含当前学生',await evaluate("document.querySelectorAll('.registration-paper').length===2&&document.querySelector('#registration-content').textContent.includes('SYN-REG-A')&&!document.querySelector('#registration-content').textContent.includes('B自己的作业')"));
 await click('.registration-paper[data-paper="'+fixture.a+'"] [data-action=registration-open]');await until("document.querySelectorAll('#questions .question').length===4");
 verify('简版核对明确人卷版本日期与登记范围',await evaluate("document.querySelector('#registration-context')?.textContent.includes('SYN-REG-A')&&document.querySelector('#registration-context').textContent.includes('A第一次作业')&&document.querySelector('#registration-context').textContent.includes('V1')&&document.querySelector('#registration-context').textContent.includes('登记范围未标明')&&document.querySelector('#assignment-date-summary').textContent.includes('未提供')"));
 verify('原题与批注按需展开但每字段只有一份',await evaluate("document.querySelectorAll('.question-details').length===4&&!document.querySelector('[data-q=Q01] .question-details').open&&[...document.querySelectorAll('#questions .question')].every(row=>['stem','answer','teacher_result','teacher_mark','knowledge','result'].every(key=>row.querySelectorAll('[data-field='+key+']').length===1))&&!!document.querySelector('.registration-original')"));
 verify('本卷选择器只列该学生的作业',await evaluate("document.querySelector('#paper-select').options.length===3&&!document.querySelector('#paper-select').textContent.includes('B自己的作业')"));
 verify('识读疑点默认展开并保持待核，缺材料单列',await evaluate("document.querySelector('[data-q=Q02] .question-details').open&&!document.querySelector('[data-q=Q02] .registration-alert').hidden&&document.querySelector('[data-q=Q02] [data-field=result]').value==='PENDING'&&document.querySelector('[data-q=Q03] [data-field=result]').value==='MISSING'"));
 await click('.registration-original > summary');verify('原图区域按需展开且未伪造附件',await evaluate("document.querySelector('.registration-original').open&&document.querySelector('.original').textContent.includes('还没有附件')"));await click('.registration-original > summary');
 await click('[data-q=Q01] .question-details > summary');await fill('[data-q=Q01] [data-field=answer]','4，保留合成原错误过程');
 await command('Page.enable');let acceptDialog=false;ws.addEventListener('message',ev=>{const m=JSON.parse(ev.data);if(m.method==='Page.javascriptDialogOpening')command('Page.handleJavaScriptDialog',{accept:acceptDialog}).catch(()=>{});});
 await click('[data-action=registration-choose]');
 verify('取消更换学生或作业保留未保存编辑',await evaluate("!!document.querySelector('#questions')&&document.querySelector('[data-q=Q01] [data-field=answer]').value==='4，保留合成原错误过程'"));
 verify('未保存修改不能直接确认',await evaluate("document.querySelector('#confirm-paper').disabled&&!document.querySelector('#confirm-consent').checked"));
 await click('[data-action=save-paper]');await until("document.querySelector('#registration-context')?.textContent.includes('V2')");
 const beforeConfirm=await evaluate(`api('profiles/'+${JSON.stringify(fixture.sid)})`);
 verify('保存只形成待审稿，不增加确认档案',beforeConfirm.events.length===0&&await evaluate("document.querySelector('#registration-context').textContent.includes('待审核')&&!document.querySelector('#confirm-consent').checked&&document.querySelector('#confirm-paper').disabled"));
 await click('[data-action=registration-choose]');await until("!!document.querySelector('#registration-page')");await choose(fixture.bid);
 verify('更换学生后不残留A的作业列表',await evaluate("document.querySelectorAll('.registration-paper').length===1&&document.querySelector('#registration-content').textContent.includes('B自己的作业')&&!document.querySelector('#registration-content').textContent.includes('A第一次作业')"));
 verify('选B后不能从旧当前卷入口绕回A',await evaluate("!document.querySelector('.workspace-subnav [data-view=review]')"));
 await evaluate("location.hash='review';true");await delay(200);
 verify('登记中直接旧审核链接也不绕过所选学生',await evaluate(`location.hash==='#registration'&&document.querySelector('#registration-content')?.dataset.student===${JSON.stringify(fixture.bid)}`));
 await choose(fixture.sid);await click('.registration-paper[data-paper="'+fixture.a+'"] [data-action=registration-open]');await until("!!document.querySelector('#questions')");
 verify('重新选择同卷回读已保存草稿和原批注',await evaluate("document.querySelector('[data-q=Q01] [data-field=answer]').value==='4，保留合成原错误过程'&&document.querySelector('[data-q=Q01] [data-field=teacher_mark]').value==='合成原批注'"));
 await click('#confirm-consent');await click('[data-action=confirm-paper]');await until("document.querySelector('#registration-context')?.textContent.includes('已确认')");
 const confirmed=await evaluate(`api('profiles/'+${JSON.stringify(fixture.sid)})`);
 verify('明确确认后四项均可追溯，待核缺材料不算不会',confirmed.events.length===4&&confirmed.archive_summary.counts.INCORRECT===1&&confirmed.archive_summary.counts.PENDING===1&&confirmed.archive_summary.counts.MISSING===1&&confirmed.events.some(e=>e.question.teacher_mark==='合成原批注'));
 await click('#confirm-consent');await click('[data-action=confirm-paper]');await until("document.querySelector('#toast').textContent.includes('无重复')");
 verify('重复确认不增加历史',await evaluate(`api('profiles/'+${JSON.stringify(fixture.sid)}).then(x=>x.events.length===4)`));
 await click('[data-action=registration-profile]');await until("document.querySelector('#profile-content')?.dataset.state==='ready'");
 verify('归档后返回正确学生并看到当次原答',await evaluate(`document.querySelector('#profile-content').dataset.student===${JSON.stringify(fixture.sid)}&&document.querySelector('#profile-content').textContent.includes('4，保留合成原错误过程')`));
 await click('.main-nav [data-view=registration]');await until("!!document.querySelector('#registration-page')");
 verify('档案返回登记保持学生但不自动打开卷',await evaluate(`document.querySelector('#registration-content').dataset.student===${JSON.stringify(fixture.sid)}&&!document.querySelector('#questions')`));
 await click('.registration-paper[data-paper="'+fixture.a+'"] [data-action=registration-open]');await until("!!document.querySelector('#questions')");
 await fill('[data-q=Q01] [data-field=result]','CORRECT');
 verify('折叠列表出现新分歧时自动展开并提示',await evaluate("document.querySelector('[data-q=Q01] .question-details').open&&!document.querySelector('[data-q=Q01] .registration-alert').hidden"));
 await fill('[data-q=Q01] [data-field=answer]','老师复核后的合成作答5');await click('[data-action=save-paper]');await until("document.querySelector('#registration-context')?.textContent.includes('V3')");
 const oldProfile=await evaluate(`api('profiles/'+${JSON.stringify(fixture.sid)})`);
 verify('改判待审时旧确认仍为错误',oldProfile.events.length===4&&oldProfile.current_evidence.find(e=>e.question_id==='Q01').result==='INCORRECT');
 await click('#confirm-consent');await click('[data-action=confirm-paper]');await until("document.querySelector('#toast').textContent.includes('分歧')");
 verify('简版界面不能绕过分歧服务端校验',await evaluate(`api('profiles/'+${JSON.stringify(fixture.sid)}).then(x=>x.events.length===4)`));
 await click('[data-q=Q01] .question-details > summary');
 // A conflicting row opens automatically; ensure it is open for the teacher's explicit explanation.
 if(!await evaluate("document.querySelector('[data-q=Q01] .question-details').open"))await click('[data-q=Q01] .question-details > summary');
 await fill('[data-q=Q01] [data-field=grading_note]','合成模拟复核：保留原批注，认可本次改判');await click('[data-q=Q01] [data-field=grading_resolved]');await click('[data-action=save-paper]');await until("document.querySelector('#registration-context')?.textContent.includes('V4')");
 await click('#confirm-consent');await click('[data-action=confirm-paper]');await until("document.querySelector('#registration-context')?.textContent.includes('已确认')");
 const revised=await evaluate(`api('profiles/'+${JSON.stringify(fixture.sid)})`);
 verify('改判后保留旧错误与新确认版本',revised.events.length===8&&revised.events.some(e=>e.question_id==='Q01'&&e.result==='INCORRECT'&&e.revision===2)&&revised.current_evidence.find(e=>e.question_id==='Q01').result==='CORRECT');
 await command('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});await evaluate("document.querySelector('#toast').classList.remove('show')");await capture('01-registration-review-desktop.png');
 await click('[data-action=registration-choose]');await until("!!document.querySelector('#registration-page')");
 await evaluate(`window.realRegFetch=fetch;window.fetch=async(...args)=>{const response=await realRegFetch(...args);if(String(args[0])==='/api/papers/'+${JSON.stringify(fixture.a)})return new Promise(resolve=>window.releaseRegOpen=()=>resolve(response));return response;}`);
 await click('.registration-paper[data-paper="'+fixture.a+'"] [data-action=registration-open]');await until("typeof releaseRegOpen==='function'");await choose(fixture.bid);await evaluate('releaseRegOpen();window.fetch=realRegFetch;true');await delay(200);
 verify('A选卷迟到响应不能打开B名下',await evaluate(`!!document.querySelector('#registration-page')&&document.querySelector('#registration-content').dataset.student===${JSON.stringify(fixture.bid)}&&!document.querySelector('#questions')`));
 await choose(fixture.sid);await click('[data-action=new]');verify('新收作业预填明确选择的学生',await evaluate("document.querySelector('#new-ref').value==='SYN-REG-A'&&document.querySelector('#new-name').value==='合成重名学生'"));await click('[data-action=close]');
 await command('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});await capture('02-registration-selection-mobile.png');
 verify('窄屏学生选择和作业清单不横向溢出',await evaluate("document.documentElement.scrollWidth<=innerWidth+1"));
 await click('.registration-paper[data-paper="'+fixture.a+'"] [data-action=registration-open]');await until("!!document.querySelector('#questions')");await capture('03-registration-review-mobile.png');
 verify('窄屏核对、保存确认控件可达',await evaluate("document.documentElement.scrollWidth<=innerWidth+1&&[...document.querySelectorAll('.review-footer button')].every(e=>e.getBoundingClientRect().width>0)"));
 await click('[data-q=Q01] .question-details > summary');
 if(!await evaluate("document.querySelector('[data-q=Q01] .question-details').open"))await click('[data-q=Q01] .question-details > summary');
 await fill('[data-q=Q01] [data-field=answer]','A晚回保存的新草稿');
 await evaluate(`window.realRegSaveFetch=fetch;window.fetch=async(...args)=>{const response=await realRegSaveFetch(...args);if(String(args[0])==='/api/papers/'+${JSON.stringify(fixture.a)}+'/draft'&&args[1]?.method==='POST')return new Promise(resolve=>window.releaseRegSave=()=>resolve(response));return response;}`);
 await click('[data-action=save-paper]');await until("typeof releaseRegSave==='function'");acceptDialog=true;
 await click('.main-nav [data-view=registration]');await until("!!document.querySelector('#registration-page')");await choose(fixture.bid);
 await click('.registration-paper[data-paper="'+fixture.b+'"] [data-action=registration-open]');await until("!!document.querySelector('#questions')");await fill('[data-q=Q01] [data-field=knowledge]','B尚未保存的知识点');
 await evaluate('releaseRegSave();window.fetch=realRegSaveFetch;true');await until("document.querySelector('#toast').textContent.includes('保存')&&document.querySelector('#toast').textContent.includes('返回')");
 verify('A保存迟到不清空B当前的新编辑',await evaluate("document.querySelector('[data-q=Q01] [data-field=knowledge]').value==='B尚未保存的知识点'&&document.querySelector('#registration-context').textContent.includes('SYN-REG-B')"));
 await click('[data-action=save-paper]');await until("document.querySelector('#registration-context')?.textContent.includes('V2')");
 await evaluate(`window.realRegConfirmFetch=fetch;window.fetch=async(...args)=>{const response=await realRegConfirmFetch(...args);if(String(args[0])==='/api/papers/'+${JSON.stringify(fixture.b)}+'/confirm'&&args[1]?.method==='POST')return new Promise(resolve=>window.releaseRegConfirm=()=>resolve(response));return response;}`);
 await click('#confirm-consent');await click('[data-action=confirm-paper]');await until("typeof releaseRegConfirm==='function'");
 await click('.main-nav [data-view=registration]');await until("!!document.querySelector('#registration-page')");await choose(fixture.sid);await click('.registration-paper[data-paper="'+fixture.a+'"] [data-action=registration-open]');await until("!!document.querySelector('#questions')");await fill('[data-q=Q01] [data-field=knowledge]','A确认回调期间的新编辑');
 await evaluate('releaseRegConfirm();window.fetch=realRegConfirmFetch;true');await until("document.querySelector('#toast').textContent.includes('确认请求已返回')");
 verify('B确认迟到不清空A编辑，送达的确认可单独回读',await evaluate("document.querySelector('[data-q=Q01] [data-field=knowledge]').value==='A确认回调期间的新编辑'")&&await evaluate(`api('profiles/'+${JSON.stringify(fixture.bid)}).then(x=>x.events.length===1&&x.events[0].result==='CORRECT')`));
 verify('整个流程仅本机请求，没有模型发送或学生发布',requests.every(u=>!/^https?:/.test(u)||u.startsWith(base)&&!u.endsWith('/send'))&&pageErrors.length===0,JSON.stringify(pageErrors));
}catch(e){failure=e.stack||String(e);}
finally{
 if(ws?.readyState===WebSocket.OPEN){try{await command('Browser.close',{},false);}catch{}ws.close();}
 if(chrome.exitCode===null)chrome.kill();if(service.exitCode===null)service.kill();
 const report={scope:'第03步单生选作业、保存待审、明确确认、历史追溯；仅合成软件验证',checks,passed:checks.filter(c=>c.passed).length,total:checks.length,pageErrors,requests,failure:failure||null,dataDir};
 const name=process.env.JINXUE_REGISTRATION_RED==='1'?'red.json':'verification.json';await writeFile(path.join(output,name),JSON.stringify(report,null,2));console.log(JSON.stringify({passed:report.passed,total:report.total,failure:report.failure,output}));if(failure)process.exitCode=1;
}
