// Real local app UI checks using independent temporary data, Chrome and Node built-ins.
import {spawn} from 'node:child_process';
import {mkdtemp,readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
const project=String.raw`E:\GPT\AI-Tutoring-Diagnosis`;
const output=path.join(project,'docs/design/grounded-tutoring-browser');await mkdir(output,{recursive:true});
const tempBase=path.join(project,'app/.qa-temp');await mkdir(tempBase,{recursive:true});
const run=await mkdtemp(path.join(tempBase,'browser-'));
const dataDir=path.join(run,'data');const profile=path.join(run,'chrome');
const python=spawn('python',[path.join(project,'app/tests/browser_fixture_server.py'),'--data-dir',dataDir,'--port','0'],{windowsHide:true,stdio:['ignore','pipe','pipe']});
let serviceLog='';python.stdout.on('data',b=>serviceLog+=b);python.stderr.on('data',b=>serviceLog+=b);
const chrome=spawn(String.raw`C:\Program Files\Google\Chrome\Application\chrome.exe`,['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check','--disable-background-networking','--disable-sync','--disable-extensions','--remote-debugging-port=0',`--user-data-dir=${profile}`,'about:blank'],{windowsHide:true,stdio:'ignore'});
const delay=ms=>new Promise(r=>setTimeout(r,ms));
const pending=new Map();let seq=0,ws,session,base;
const checks=[],requests=[],pageErrors=[];
function verify(name,ok,detail){checks.push({name,passed:!!ok,detail});if(!ok)throw Error(name+': '+detail);}
async function command(method,params={},useSession=true){const id=++seq;return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{pending.delete(id);reject(Error('CDP timeout '+method));},15000);pending.set(id,{resolve:v=>{clearTimeout(timer);resolve(v);},reject:e=>{clearTimeout(timer);reject(e);}});ws.send(JSON.stringify({id,method,params,...(useSession&&session?{sessionId:session}:{})}));});}
async function evaluate(expression){let r;try{r=await command('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true,userGesture:true});}catch(e){throw Error(e.message+' expression='+expression.slice(0,200));}if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;}
async function until(expr){for(let i=0;i<100;i++){if(await evaluate(expr))return;await delay(80);}throw Error('wait failed: '+expr);}
async function click(selector){await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e)throw Error('Missing '+${JSON.stringify(selector)});if(e.disabled)throw Error('Disabled '+${JSON.stringify(selector)});e.click();return true})()`);await delay(200);}
async function fill(selector,value){await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});e.value=${JSON.stringify(value)};e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));})()`);}
async function screenshot(name){const r=await command('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});await writeFile(path.join(output,name),Buffer.from(r.data,'base64'));}
async function boot(){return (await fetch(base+'/api/bootstrap')).json();}
let failure;
try{
 for(let i=0;i<100;i++){try{base=JSON.parse(await readFile(path.join(dataDir,'server.json'),'utf8')).url;break;}catch{await delay(100);}}
 if(!base)throw Error('fixture not ready');
 let active;for(let i=0;i<100;i++){try{active=(await readFile(path.join(profile,'DevToolsActivePort'),'utf8')).trim().split(/\r?\n/);break;}catch{await delay(100);}}
 if(!active)throw Error('Chrome not ready');
 ws=new WebSocket(`ws://127.0.0.1:${active[0]}${active[1]}`);await new Promise((resolve,reject)=>{ws.addEventListener('open',resolve,{once:true});ws.addEventListener('error',reject,{once:true});});
 ws.addEventListener('message',event=>{const m=JSON.parse(String(event.data));if(m.id&&pending.has(m.id)){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(Error(m.error.message)):p.resolve(m.result);}if(m.method==='Network.requestWillBeSent')requests.push(m.params.request.url);if(m.method==='Runtime.exceptionThrown')pageErrors.push(m.params.exceptionDetails.exception?.description||m.params.exceptionDetails.text);});
 const target=await command('Target.createTarget',{url:'about:blank'},false);session=(await command('Target.attachToTarget',{targetId:target.targetId,flatten:true},false)).sessionId;
 await command('Page.enable');await command('Runtime.enable');await command('Network.enable');await command('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});



 await command('Page.navigate',{url:base});await until("!!document.querySelector('[data-action=new]')");
 const syntheticFile=path.join(run,'synthetic-grounded.docx');
 await new Promise((resolve,reject)=>{const child=spawn('python',['-c',"from docx import Document;import sys;d=Document();d.add_paragraph('Synthetic lesson');d.save(sys.argv[1])",syntheticFile],{windowsHide:true,stdio:'ignore'});child.on('error',reject);child.on('exit',code=>code===0?resolve():reject(Error('DOCX fixture failed')));});
 const raw=(await readFile(syntheticFile)).toString('base64');
 const source=await evaluate(`(async()=>{let p=await api('seed',{});const doc=await api('documents',{filename:'PRIVATE-SYN.docx',data:${JSON.stringify(raw)}});let m=await api('teaching/materials',{document_id:doc.id,title:'PRIVATE-LOCAL-TITLE',scope:'初中数学'});m=await api('teaching/materials/'+m.id,{version:m.version,entries:[{knowledge:p.questions[0].knowledge,locator:'合成第一节',content:'令括号为零，代回检查。额外备注不外发。'}]});m=await api('teaching/materials/'+m.id+'/approve',{version:m.version,consent:true});p.questions[0].teaching_ref={material_id:m.id,version:m.version,entry_id:m.entries[0].id};p=await api('papers/'+p.id+'/draft',{version:p.version,questions:p.questions});await api('papers/'+p.id+'/confirm',{version:p.version,consent:true});paperId=p.id;view='practice';await refresh();return p.id})()`);
 verify('补练页提供AI候选入口',await evaluate("!!document.querySelector('[data-action=tutor-open]')"),'先选择已确认原题');
 await click('[data-view=ai]');await fill('#ai-key','FAKE-BROWSER-TUTOR-KEY');await click('[data-action=ai-save]');await click('[data-view=practice]');await fill('#source-question','Q01');await click('[data-action=tutor-open]');
 verify('教学资料默认关闭',await evaluate("!document.querySelector('#tutor-include-teaching').checked&&document.querySelector('#tutor-include-teaching').disabled"),'不自动发送');
 await click('[data-action=tutor-load-reference]');await until("!document.querySelector('#tutor-include-teaching').disabled");
 verify('读取固定审核条目仍不自动选用',await evaluate("document.querySelector('#tutor-teaching-excerpt').value.includes('额外备注')&&!document.querySelector('#tutor-include-teaching').checked"),'仅本机读取');
 await fill('#tutor-teaching-excerpt','令括号为零，代回检查。');await click('#tutor-include-teaching');
 verify('只拟当前原题材料',await evaluate("Object.keys(JSON.parse(document.querySelector('#tutor-material').value)).length===8&&JSON.parse(document.querySelector('#tutor-material').value).id==='Q01'&&document.querySelector('#modal').textContent.includes('V2')"),'材料不自动包含姓名、全档案或其他题');
 verify('候选材料不混入整卷字段',await evaluate("document.querySelectorAll('#modal [data-field]').length===0&&document.querySelectorAll('#modal .question').length===0"),'整卷保存只收集原审核区');
 await click('[data-action=tutor-prepare]');await until("!!document.querySelector('#ai-send-consent')");
 verify('实际预览仅有选中节选，标题和备注留在本机',await evaluate("document.querySelector('.tutor-context').textContent.includes('仅本机追溯')&&document.querySelector('.payload-preview').textContent.includes('令括号为零')&&!document.querySelector('.payload-preview').textContent.includes('额外备注')&&!document.querySelector('.payload-preview').textContent.includes('PRIVATE')"),'精确材料预览');
 const jobId=await evaluate("document.querySelector('[data-action=ai-send]').dataset.job");
 verify('先预览且发送需授权',await evaluate("document.querySelector('[data-action=ai-send]').disabled&&document.querySelector('#modal').textContent.includes('Q01')"),requests.filter(u=>u.endsWith('/send')).length===0?'未发送':'意外发送');
 verify('准备不会创建练习',(await boot()).exercises.length===0,'PREPARED');
 await screenshot('01-preview.png');await click('#ai-send-consent');await click('[data-action=ai-send]');await until("!!document.querySelector('[data-action=tutor-apply]')");
 verify('六步教案与三档候选均展示',await evaluate("document.querySelectorAll('.tutor-section').length===6&&document.querySelectorAll('.tutor-candidate').length===3"),'均标待教师核验，不自称正确');
 verify('返回不创建也不批准',(await boot()).exercises.length===0&&await evaluate("!document.querySelector('input[name=tutor-level]:checked')&&document.querySelector('[data-action=tutor-apply]').disabled"),'无默认档');
 await click('input[name=tutor-level][value="基础巩固"]');await click('#tutor-consent');await click('input[name=tutor-level][value="综合运用"]');
 verify('换档重新确认',await evaluate("!document.querySelector('#tutor-consent').checked&&document.querySelector('[data-action=tutor-apply]').disabled"),'不沿用上一档同意');
 await click('input[name=tutor-level][value="基础巩固"]');await screenshot('02-teacher-candidates.png');await click('#tutor-consent');await click('[data-action=tutor-apply]');await until("!!document.querySelector('#ex-stem')");
 let state=await boot();const a=state.exercises[0];verify('只建立所选档草稿',state.exercises.length===1&&a.status==='DRAFT'&&a.question_id==='Q01'&&a.paper_id===source&&a.explanation.includes('原题讲解')&&a.explanation.includes('合成第一节')&&state.event_count===4,'原卷记录不变，答案/教案仅教师字段');
 verify('新草稿审批与导出仍受限',await evaluate("!document.querySelector('#ex-consent').checked&&document.querySelector('[data-action=approve-exercise]').disabled&&document.querySelector('[data-action=export-exercise]').disabled"),'未批准学生版');
 await fill('#ex-explanation','老师自行修订的教案');await click('[data-action=tutor-open]');verify('未保存教案不被候选入口覆盖',await evaluate("!document.querySelector('#modal').open&&document.querySelector('#ex-explanation').value==='老师自行修订的教案'&&document.querySelector('#toast').textContent.includes('保存')"),'先保留老师修改');await click('[data-action=save-exercise]');await until("exercise()?.version===2");
 async function reopen(){await evaluate(`(async()=>{aiShowJob(await api('ai/jobs/${jobId}'))})()`);await until("!!document.querySelector('[data-action=tutor-apply]')");}
 await reopen();await click('input[name=tutor-level][value="基础巩固"]');await click('#tutor-consent');await click('[data-action=tutor-apply]');await until("!!document.querySelector('#ex-explanation')");state=await boot();verify('重复应用不新增或覆盖老师修订',state.exercises.length===1&&state.exercises[0].version===2&&state.exercises[0].explanation==='老师自行修订的教案','幂等返回既有练习');
 await reopen();await click('input[name=tutor-level][value="综合运用"]');await click('#tutor-consent');await click('[data-action=tutor-apply]');await until("exercise()?.level==='综合运用'");state=await boot();const b=state.exercises.find(e=>e.level==='综合运用');verify('其他档须另选且仍待审',state.exercises.length===2&&b.status==='DRAFT','不是自动生成三套作业');
 await click('#ex-consent');await click('[data-action=approve-exercise]');await until("exercise()?.status==='APPROVED'");
 const html=await (await fetch(base+'/print/exercise/'+b.id+'?audience=student&version=1')).text();verify('学生版不含教师答案教案',!html.includes('教师核对答案')&&!html.includes('原题讲解')&&html.includes('x'),'本地打印HTML检查；不等于实际打印');
 await click('[data-action=retest]');await fill('#rt-answer','(1,-4)，x=1；(-1,0)、(3,0)');await fill('#rt-result','CORRECT');await click('#rt-consent');await click('[data-action=save-retest]');await until("!document.querySelector('#modal').open");await click('[data-view=profile]');await until("!!currentProfile?.retests.length");verify('复测单列且原错题保留',await evaluate("currentProfile.retests.length===1&&currentProfile.latest.find(e=>e.question_id==='Q01').result==='INCORRECT'"),'没有自动标掌握');
 await click('[data-view=review]');await fill('[data-q=Q01] [data-field=cause]','待核实：来源修订');await click('[data-action=save-paper]');await until("paper().version===3");await click('#confirm-consent');await click('[data-action=confirm-paper]');await until("paper().confirmed_version===paper().version");await reopen();await click('input[name=tutor-level][value="迁移挑战"]');await click('#tutor-consent');await click('[data-action=tutor-apply]');
 verify('来源修订阻断新档草稿',(await boot()).exercises.length===2&&await evaluate("document.querySelector('#toast').textContent.includes('变化')||document.querySelector('#toast').textContent.includes('已更新')"),'已有草稿历史保留');
 await evaluate(`(async()=>{const j=await api('ai/jobs/${jobId}');j.status='INVALID_RESULT';j.result=null;tutorShowJob(j)})()`);verify('无合格结果不提供选档应用',await evaluate("!document.querySelector('[data-action=tutor-apply]')&&!document.querySelector('input[name=tutor-level]')"),'无失败补造候选');
 await evaluate(`(async()=>{const j=await api('ai/jobs/${jobId}');j.result.lesson.review='<img src=x onerror=alert(1)>';tutorShowJob(j)})()`);verify('教案内容只作文字显示',await evaluate("document.querySelectorAll('#modal img,#modal script').length===0&&document.querySelector('#modal').textContent.includes('<img src=x')&&collectQuestions().length===4"),'不执行模型输出的HTML，不污染整卷');
 await command('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});await screenshot('03-mobile-candidates.png');verify('窄屏候选可阅读',await evaluate("document.documentElement.scrollWidth<=innerWidth+1&&document.querySelector('#modal').scrollWidth<=document.querySelector('#modal').clientWidth+1"),JSON.stringify(await evaluate("({doc:document.documentElement.scrollWidth,win:innerWidth,dialog:document.querySelector('#modal').scrollWidth,client:document.querySelector('#modal').clientWidth,offenders:[...document.querySelectorAll('#modal *')].filter(e=>e.getBoundingClientRect().right>375).map(e=>[e.tagName,e.className,e.scrollWidth,e.clientWidth])})")));
 verify('仅一次假模型调用且页面无异常',requests.filter(u=>u.endsWith('/send')).length===1&&requests.every(u=>!/^https?:/.test(u)||u.startsWith(base+'/'))&&pageErrors.length===0,'无真实API调用');
}catch(e){failure=e.stack||String(e);}
finally{
 if(ws?.readyState===WebSocket.OPEN){try{await command('Browser.close',{},false);}catch{}ws.close();}if(chrome.exitCode===null)chrome.kill();if(python.exitCode===null)python.kill();
 const report={scope:'隔离合成辅导候选、选档草稿、审批导出与复测；假接口非真实模型',checks,passed:checks.filter(c=>c.passed).length,total:checks.length,pageErrors,failure:failure||null,dataDir};await writeFile(path.join(output,'verification.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({passed:report.passed,total:report.total,failure:report.failure,output}));if(failure)process.exitCode=1;
}
