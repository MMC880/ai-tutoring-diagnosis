// Isolated synthetic teacher-led review UI; no external model requests.
import {spawn} from 'node:child_process';
import {mkdtemp,readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
const project=path.resolve(import.meta.dirname,'../..');
const output=path.join(project,'app/.qa-temp/student-first-browser');await mkdir(output,{recursive:true});
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
 verify('默认进入档案，空库引导既有收件',await evaluate("!!document.querySelector('.nav [data-view=profile].active')&&document.querySelector('main').textContent.includes('暂无学生')&&!!document.querySelector('main [data-action=new]')&&!document.querySelector('#paper-select')"));
 await evaluate(`(async()=>{
  const a=await api('seed',{});const qs=structuredClone(a.questions);qs[0].answer='A的已确认原答';
  const a1=await api('papers/'+a.id+'/draft',{version:a.version,questions:qs});await api('papers/'+a1.id+'/confirm',{version:a1.version,consent:true});
  const a2=await api('papers',{student_ref:a.student_ref,student_name:a.student_name,batch_id:'SYN-A2',title:'A的第二份作业',documents:[],questions:[{id:'Q01',stem:'2+3',answer:'5',correct_answer:'5',result:'CORRECT',knowledge:'整数运算',cause:''}]});await api('papers/'+a2.id+'/confirm',{version:a2.version,consent:true});
  const b=await api('papers',{student_ref:'SYN-SAME-NAME-B',student_name:a.student_name,batch_id:'SYN-B',title:'B的作业',documents:[],questions:[{id:'Q01',stem:'3+3',answer:'6',correct_answer:'6',result:'CORRECT',knowledge:'整数运算',cause:''}]});await api('papers/'+b.id+'/confirm',{version:b.version,consent:true});
  const c=await api('papers',{student_ref:'SYN-NO-CONFIRM',student_name:'合成待审学生',batch_id:'SYN-C',title:'未确认作业',documents:[],questions:[{id:'Q01',stem:'待核题目',result:'PENDING'}]});
  sessionStorage.setItem('synthetic-fixture',JSON.stringify({a:a.id,a2:a2.id,b:b.id,c:c.id,aStudent:a.student_id,bStudent:b.student_id,cStudent:c.student_id,name:a.student_name}));
 })()`);
 await command('Page.reload');await until("document.querySelectorAll('[data-action=archive-select]').length===3");
 await evaluate("window.fixture=JSON.parse(sessionStorage.getItem('synthetic-fixture'));true");
 verify('有学生仍须先选人，不自动打开第一份卷',await evaluate("document.querySelector('#profile-content').textContent.includes('请选择学生')&&!document.querySelector('#paper-select')"));
 verify('同名学生显示不同稳定编号',await evaluate("[...document.querySelectorAll('[data-action=archive-select]')].filter(x=>x.textContent.includes(fixture.name)).length===2&&document.querySelector('main').textContent.includes('SYN-SAME-NAME-B')"));
 await fill('#profile-student-search','SYN-SAME-NAME-B');
 verify('按编号搜索',await evaluate("document.querySelectorAll('[data-action=archive-select]').length===1&&document.querySelector('[data-action=archive-select]').dataset.student===fixture.bStudent"));
 await fill('#profile-student-search','查无此学生');verify('无匹配有明确提示',await evaluate("document.querySelector('#profile-student-list').textContent.includes('没有匹配')"));
 await fill('#profile-student-search','');
 const studentSelector=id=>'[data-action=archive-select][data-student="'+id+'"]';
 const selectStudent=async id=>{await click(studentSelector(id));await until(`document.querySelector('#profile-content')?.dataset.student===${JSON.stringify(id)}&&document.querySelector('#profile-content')?.dataset.state==='ready'`);};
 const ids=await evaluate('fixture');
 await selectStudent(ids.aStudent);
 verify('按人汇总多份作业的确认历史',await evaluate("document.querySelector('.archive-summary').textContent.includes('2份有确认历史')&&document.querySelector('#profile-content').textContent.includes('A的已确认原答')&&document.querySelector('#profile-content').textContent.includes('2+3')"));
 const before=await evaluate("api('bootstrap').then(x=>JSON.stringify({papers:x.papers,event_count:x.event_count}))");
 await capture('01-student-first-desktop.png');
 // Hold the actual public HTTP response, keeping the request and UI independently switchable.
 await evaluate(`window.originalFetch=window.fetch;window.fetch=async(...args)=>{const url=String(args[0]);if(url==='/api/profiles/'+fixture.bStudent){const response=await originalFetch(...args);return new Promise(resolve=>window.releaseProfile=()=>resolve(response));}return originalFetch(...args);}`);
 await click(studentSelector(ids.bStudent));
 verify('切学生立即清除旧档案并显示读取中',await evaluate("document.querySelector('#profile-content').textContent.includes('正在读取')&&!document.querySelector('#profile-content').textContent.includes('A的已确认原答')"));
 await selectStudent(ids.aStudent);await evaluate('releaseProfile();window.fetch=originalFetch;true');await delay(200);
 verify('迟到的B响应不回填A',await evaluate("document.querySelector('#profile-content').dataset.student===fixture.aStudent&&document.querySelector('#profile-content').textContent.includes('A的已确认原答')"));
 await evaluate(`window.fetch=async(...args)=>{if(String(args[0])==='/api/profiles/'+fixture.bStudent)throw Error('合成读取失败');return originalFetch(...args);}`);
 await click(studentSelector(ids.bStudent));await until("!!document.querySelector('[data-action=archive-retry]')");
 verify('读取失败不显示上一学生内容',await evaluate("document.querySelector('#profile-content').textContent.includes('读取失败')&&!document.querySelector('#profile-content').textContent.includes('A的已确认原答')"));
 await evaluate('window.fetch=originalFetch;true');await click('[data-action=archive-retry]');await until("document.querySelector('#profile-content').dataset.state==='ready'");
 verify('失败后可重试当前学生',await evaluate("document.querySelector('#profile-content').dataset.student===fixture.bStudent"));
 await selectStudent(ids.cStudent);verify('未确认作业不冒充学情',await evaluate("document.querySelector('#profile-content').textContent.includes('尚无该学生的确认记录')&&document.querySelector('.archive-summary').textContent.includes('1份有待审内容')"));
 await selectStudent(ids.aStudent);
 await evaluate(`window.fetch=async(...args)=>{if(String(args[0]).startsWith('/api/profiles/'+fixture.aStudent+'/evidence/')){const response=await originalFetch(...args);return new Promise(resolve=>window.releaseEvidence=()=>resolve(response));}return originalFetch(...args);}`);
 await click('[data-action=archive-open]');await selectStudent(ids.bStudent);await evaluate('releaseEvidence();window.fetch=originalFetch;true');await delay(250);
 verify('迟到的原题窗口不串学生',await evaluate("!document.querySelector('.archive-evidence')&&document.querySelector('#profile-content').dataset.student===fixture.bStudent"));
 await selectStudent(ids.aStudent);await click('[data-action=archive-open]');await until("!!document.querySelector('.archive-evidence')");
 // Escape returns to archive; a student switch must also invalidate an already open modal.
 await command('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});await command('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
 await selectStudent(ids.bStudent);verify('旧弹窗随选人关闭',await evaluate("!document.querySelector('#modal').open&&!document.querySelector('.archive-evidence')"));
 await click('[data-action=report-preview]');await until("!!document.querySelector('#profile-report')");
 verify('报告来自所选学生，独立于当前整卷',await evaluate("document.querySelector('#profile-report').textContent.includes('SYN-SAME-NAME-B')&&!document.querySelector('#profile-report').textContent.includes('A的已确认原答')"));
 await click('[data-action=close]');
 await selectStudent(ids.aStudent);await click('[data-action=archive-open]');await until("!!document.querySelector('[data-action=archive-current]')");await click('[data-action=archive-current]');await until("!!document.querySelector('#questions')");
 const draftPaper=await evaluate("document.querySelector('#paper-select').value");
 await fill('#questions .question [data-field=answer]','尚未保存的合成修改');
 await command('Page.enable');let dialogDecision=false;ws.addEventListener('message',ev=>{const m=JSON.parse(ev.data);if(m.method==='Page.javascriptDialogOpening')command('Page.handleJavaScriptDialog',{accept:dialogDecision}).catch(()=>{});});
 await click('.nav [data-view=profile]');
 verify('取消离开保留原卷与未保存修改',await evaluate("!!document.querySelector('#questions')&&document.querySelector('#questions .question [data-field=answer]').value==='尚未保存的合成修改'"));
 await click('[data-action=save-paper]');await until("document.querySelector('#save-state')?.textContent.includes('已保存')||document.querySelector('#toast').textContent.includes('草稿已保存')");
 await click('.nav [data-view=profile]');await until("document.querySelector('#profile-content')?.dataset.state==='ready'");await selectStudent(ids.bStudent);await selectStudent(ids.aStudent);
 verify('已存草稿保留，未替换确认原答',await evaluate(`api('papers/'+${JSON.stringify(draftPaper)}).then(p=>p.questions[0].answer==='尚未保存的合成修改')`)&&await evaluate("document.querySelector('#profile-content').textContent.includes('A的已确认原答')&&!document.querySelector('#profile-content').textContent.includes('尚未保存的合成修改')"));
 await command('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});await capture('02-student-first-mobile.png');
 verify('窄屏名单与档案无整页横向溢出',await evaluate("document.documentElement.scrollWidth<=innerWidth+1"));
 await click('[data-action=new]');await fill('#new-ref','SYN-UNSUBMITTED');await fill('#new-title','尚未提交的收件标题');
 await evaluate("location.hash='review';true");await until("!!document.querySelector('#questions')");
 verify('档案导航不清空未提交收件表单',await evaluate("document.querySelector('#modal').open&&document.querySelector('#new-ref')?.value==='SYN-UNSUBMITTED'&&document.querySelector('#new-title')?.value==='尚未提交的收件标题'"));
 await click('[data-action=close]');
 const after=await evaluate("api('bootstrap').then(x=>({event_count:x.event_count,papers:x.papers}))");
 verify('浏览不新增确认历史，也不调用模型',after.event_count===JSON.parse(before).event_count&&requests.every(u=>!/^https?:/.test(u)||u.startsWith(base)&&!u.endsWith('/send'))&&pageErrors.length===0,JSON.stringify({beforeEvents:JSON.parse(before).event_count,afterEvents:after.event_count,pageErrors,unexpectedRequests:requests.filter(u=>/^https?:/.test(u)&&!u.startsWith(base)||u.endsWith('/send'))}));
}catch(e){failure=e.stack||String(e);}
finally{
 if(ws?.readyState===WebSocket.OPEN){try{await command('Browser.close',{},false);}catch{}ws.close();}
 if(chrome.exitCode===null)chrome.kill();if(service.exitCode===null)service.kill();
 const report={scope:'仅合成资料，第01步学生优先档案；不代表真实学情验收',checks,passed:checks.filter(c=>c.passed).length,total:checks.length,pageErrors,requests,failure:failure||null,dataDir};
 const name=process.env.JINXUE_STUDENT_RED==='1'?'red.json':'verification.json';await writeFile(path.join(output,name),JSON.stringify(report,null,2));console.log(JSON.stringify({passed:report.passed,total:report.total,failure:report.failure,output}));if(failure)process.exitCode=1;
}
