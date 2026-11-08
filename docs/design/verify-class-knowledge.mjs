// Batch intake: synthetic isolated rows only; no external model requests.
import {spawn} from 'node:child_process';
import {mkdtemp,readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
const project=path.resolve(import.meta.dirname,'../..');
const output=path.join(project,'docs/design/class-knowledge-browser');await mkdir(output,{recursive:true});
const tempBase=path.join(project,'app/.qa-temp');await mkdir(tempBase,{recursive:true});
const run=await mkdtemp(path.join(tempBase,'class-knowledge-browser-'));
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

 await command('Runtime.enable');await command('Network.enable',{maxPostDataSize:1024});
 await command('Page.navigate',{url:base});await until("typeof data!=='undefined'&&!!data&&document.querySelector('#app .shell')");
 await evaluate(`(async()=>{
  const q=(id,result='INCORRECT',knowledge='顶点式')=>({id,stem:'合成求顶点题',answer:'学生原作答',result,knowledge,question_type:'求顶点',cause:'待核实',teacher_mark:'合成教师批注'});
  const create=async(ref,questions,batch='SYN-CLASS',confirmed=true)=>{const p=await api('papers',{student_ref:ref,student_name:'合成'+ref,batch_id:batch,title:'合成数学卷',questions});if(confirmed)await api('papers/'+p.id+'/confirm',{version:1,consent:true});return p;};
  const a=await create('SYN-A',[q('Q01'),q('Q02'),q('Q03','PENDING'),q('Q04','MISSING'),q('Q05','INCORRECT','<img src=x onerror=alert(1)>')]);
  const b=await create('SYN-B',[q('Q22','PARTIAL')]);const c=await create('SYN-C',[q('Q01','CORRECT')]);const draft=await create('SYN-D',[q('Q01')],'SYN-CLASS',false);const other=await create('SYN-E',[q('Q01')],'SYN-OTHER');
  globalThis.classFixture={a:a.id,b:b.id,c:c.id,draft:draft.id,other:other.id,sid:a.student_id};await load();paperId=a.id;view='class';await render();
 })()`);
 verify('班级知识区已接入',await evaluate("!!document.querySelector('#class-knowledge')"));
 await until("document.querySelector('.class-knowledge-group')");
 const group=await evaluate("currentSummary.class_analysis.groups.find(g=>g.knowledge==='顶点式').id");
 const groupSel=`.class-knowledge-group[data-group="${group}"]`;
 verify('按人数而非错题数展示共性',await evaluate(`document.querySelector(${JSON.stringify(groupSel)}).textContent.includes('2 名学生')&&document.querySelector(${JSON.stringify(groupSel)}).textContent.includes('3 项待补齐')`));
 verify('待核对缺材料正确单列且草稿不入',await evaluate(`(()=>{const t=document.querySelector(${JSON.stringify(groupSel)}).textContent;return t.includes('错误2')&&t.includes('部分正确1')&&t.includes('正确1')&&t.includes('待核对1')&&t.includes('缺材料1')&&!t.includes('SYN-D')})()`));
 verify('标签线索与确认时间边界清楚',await evaluate("document.querySelector('#class-knowledge').textContent.includes('标签线索')&&document.querySelector('#class-knowledge').textContent.includes('不直接认定')"));
 verify('知识名称作为文字显示而非执行HTML',await evaluate("document.querySelector('#class-knowledge').textContent.includes('<img src=x')&&!document.querySelector('#class-knowledge img')"));
 await click(`${groupSel} details summary`);
 await click(`${groupSel} [data-action=class-evidence]`);await until("document.querySelector('#modal').open&&document.querySelector('.class-knowledge-evidence')");
 verify('证据窗口显示确切学生原答和教师批注',await evaluate("document.querySelector('#modal').textContent.includes('SYN-A')&&document.querySelector('#modal').textContent.includes('学生原作答')&&document.querySelector('#modal').textContent.includes('合成教师批注')"));
 await capture('03-class-evidence.png');
 verify('证据窗口不提供确认或发布',await evaluate("!document.querySelector('#modal [data-action=confirm-paper]')&&!document.querySelector('#modal [data-action=approve-exercise]')"));
 await click('[data-action=close]');
 await click(`${groupSel} [data-action=class-profile]`);await until("view==='profile'&&currentProfile?.student.id===classFixture.sid");
 verify('从共性证据进入正确学生档案',await evaluate("paperId===classFixture.a&&currentProfile.student.ref==='SYN-A'"));
 await evaluate("(async()=>{paperId=classFixture.a;view='class';await render()})()");
 // A changed unconfirmed draft must not replace the old teacher-confirmed evidence.
 await evaluate("(async()=>{const p=await api('papers/'+classFixture.a);p.questions[0].answer='新草稿不可作证据';await api('papers/'+p.id+'/draft',{version:p.version,questions:p.questions});await load();await render()})()");
 verify('待审修订仍显示原确认且标注待审',await evaluate("document.querySelector('#class-knowledge').textContent.includes('有待审修订')&&currentSummary.class_analysis.groups.find(g=>g.knowledge==='顶点式').evidence.find(e=>e.paper_id===classFixture.a).answer==='学生原作答'"));
 await click(`${groupSel} details summary`);await click(`${groupSel} [data-action=class-evidence]`);await until("document.querySelector('#modal').open");
 verify('历史证据不显示未确认新作答',await evaluate("!document.querySelector('#modal').textContent.includes('新草稿不可作证据')&&document.querySelector('#modal').textContent.includes('学生原作答')"));await click('[data-action=close]');
 // Read failure leaves the class page available for retry, and never navigates.
 await evaluate("globalThis.classOriginalApi=api;api=async function(path,...args){if(path.includes('/evidence/'))throw Error('合成读取失败');return classOriginalApi(path,...args)}");
 await click(`${groupSel} [data-action=class-evidence]`);
 verify('证据读取失败不切页且允许重试',await evaluate("view==='class'&&!document.querySelector('#modal').open&&document.querySelector('#toast').textContent.includes('合成读取失败')"));
 await evaluate('api=classOriginalApi');
 // Identity mismatches must not open another student's evidence or profile.
 await evaluate("api=async function(path,...args){const r=await classOriginalApi(path,...args);if(path.includes('/evidence/'))r.student.id='wrong-student';return r}");
 await click(`${groupSel} [data-action=class-evidence]`);
 verify('证据学生不匹配时拦截',await evaluate("view==='class'&&!document.querySelector('#modal').open&&document.querySelector('#toast').textContent.includes('归属不一致')"));await evaluate('api=classOriginalApi');
 await evaluate("api=async function(path,...args){const r=await classOriginalApi(path,...args);if(path.startsWith('papers/'))r.student_id='wrong-student';return r}");
 await click(`${groupSel} [data-action=class-profile]`);
 verify('档案来源归属不匹配时拦截',await evaluate("view==='class'&&document.querySelector('#toast').textContent.includes('归属已变化')"));await evaluate('api=classOriginalApi');
 await evaluate("api=async function(path,...args){if(path==='bootstrap')await new Promise(r=>setTimeout(r,500));return classOriginalApi(path,...args)}");
 await click(`${groupSel} [data-action=class-profile]`);await evaluate("modal('<p>合成新窗口</p>');close()");await delay(650);
 verify('读取档案期间打开再关闭窗口仍取消导航',await evaluate("view==='class'&&paperId===classFixture.a&&!document.querySelector('#modal').open"));await evaluate('api=classOriginalApi');
 // A delayed evidence request cannot open over another page.
 await evaluate("api=async function(path,...args){if(path.includes('/evidence/'))await new Promise(r=>setTimeout(r,500));return classOriginalApi(path,...args)}");
 await click(`${groupSel} [data-action=class-evidence]`);await evaluate("(async()=>{view='review';await render()})()");await delay(650);
 verify('切页使迟到证据失效',await evaluate("view==='review'&&!document.querySelector('#modal').open"));await evaluate('api=classOriginalApi');
 // A slower old batch response cannot replace the newer batch summary.
 await evaluate("api=async function(path,...args){if(path==='summary?batch=SYN-CLASS')await new Promise(r=>setTimeout(r,500));return classOriginalApi(path,...args)};paperId=classFixture.a;view='class';globalThis.classOldRender=render()");
 await delay(80);await evaluate("(async()=>{paperId=classFixture.other;await render()})()");await delay(650);
 verify('换批次后慢摘要不会覆盖新批次',await evaluate("currentSummary.batch_id==='SYN-OTHER'&&document.querySelector('#class-knowledge').textContent.includes('SYN-OTHER')&&!document.querySelector('#class-knowledge').textContent.includes('SYN-A')"));await evaluate('api=classOriginalApi');
 await command('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});await evaluate("document.querySelector('#toast').classList.remove('show');document.querySelector('#class-knowledge').scrollIntoView({block:'start'})");await capture('02-class-mobile.png');
 verify('390px无横向溢出',await evaluate("document.documentElement.scrollWidth<=innerWidth"));
 await command('Emulation.setDeviceMetricsOverride',{width:1440,height:1080,deviceScaleFactor:1,mobile:false});await evaluate("(async()=>{paperId=classFixture.a;view='class';await render()})()");await evaluate("document.querySelector('#toast').classList.remove('show');document.querySelector('#class-knowledge').scrollIntoView({block:'start'})");await capture('01-class-desktop.png');
 verify('空确认批次保持无结论',await evaluate("(async()=>{paperId=classFixture.draft;const p=await api('papers',{student_ref:'SYN-EMPTY',batch_id:'SYN-EMPTY',title:'合成待审卷',questions:[{id:'Q01',stem:'题干',answer:'',result:'PENDING'}]});await load();paperId=p.id;view='class';await render();return currentSummary.class_analysis.groups.length===0&&document.querySelector('#class-knowledge').textContent.includes('暂无可归组')})()"));
 verify('未发生AI发送且无页面错误',requests.every(u=>!u.endsWith('/prepare')&&!u.endsWith('/send'))&&pageErrors.length===0);
} catch(e){failure=e.stack||String(e);} finally {
 if(ws){try{await command('Browser.close',{},false);}catch{}ws.close();}chrome.kill();service.kill();
 const report={scope:'隔离合成班级知识证据，非真实教师诊断或省时验收',checks,passed:checks.filter(c=>c.passed).length,total:checks.length,pageErrors,failure:failure||null};
 await writeFile(path.join(output,process.env.JINXUE_CLASS_RED==='1'?'red.json':'verification.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({passed:report.passed,total:report.total,failure:report.failure,output}));if(failure)process.exitCode=1;
}
