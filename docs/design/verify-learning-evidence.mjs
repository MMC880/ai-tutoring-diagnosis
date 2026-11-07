// Real local app UI checks using independent temporary data, Chrome and Node built-ins.
import {spawn} from 'node:child_process';
import {mkdtemp,readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
const project=String.raw`E:\GPT\AI-Tutoring-Diagnosis`;
const output=path.join(project,'docs/design/learning-evidence-preview');await mkdir(output,{recursive:true});
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
 const seeded=await evaluate(`(async()=>{
 const q={id:'Q02',stem:'求抛物线顶点与对称轴',answer:'(-2,3)，x=-2',correct_answer:'(2,3)，x=2',knowledge:'二次函数·顶点式',question_type:'顶点式读数',cause:'待核实',result:'INCORRECT'};
 const p1=await api('papers',{student_ref:'SYN-LEARN-01',student_name:'虚构学习反馈学生',batch_id:'SYN-L1',title:'第一次合成作业',questions:[q]});await api('papers/'+p1.id+'/confirm',{version:1,consent:true});
 const p2=await api('papers',{student_ref:'SYN-LEARN-01',student_name:'虚构学习反馈学生',batch_id:'SYN-L2',title:'第二次合成作业',questions:[{...q,id:'Q01',stem:'解方程',knowledge:'方程',question_type:'方程求解'},q]});await api('papers/'+p2.id+'/confirm',{version:1,consent:true});
 const other=await api('exercises',{paper_id:p2.id,question_id:'Q01',level:'基础巩固',stem:'另一题旧练习',answer:'教师答案',explanation:'旧讲解'});await api('exercises/'+other.id+'/approve',{version:1,consent:true});
 paperId=p2.id;view='review';await refresh();return {p1:p1.id,p2:p2.id,sid:p2.student_id,old_exercise:other.id};})()`);
 verify('整卷可核对独立题型字段',await evaluate("document.querySelector('[data-q=Q02] [data-field=question_type]')?.value==='顶点式读数'"),'知识点与题型分别记录');
 await click('[data-view=profile]');await until("!!document.querySelector('.learning-group')");
 const main=await evaluate("currentProfile.learning_analysis.groups.find(g=>g.knowledge==='二次函数·顶点式').id");const card=`.learning-group[data-group="${main}"]`;
 await click(card+' summary');
 verify('跨两份作业显示反复问题及证据',await evaluate(`document.querySelector(${JSON.stringify(card)}).innerText.includes('跨作业重复问题')&&document.querySelector(${JSON.stringify(card)}).innerText.includes('2份作业')&&document.querySelector(${JSON.stringify(card)}).innerText.includes('SYN-L1')&&document.querySelector(${JSON.stringify(card)}).innerText.includes('SYN-L2')`),'不是两条修订冒充两次练习');await screenshot('01-repeated-evidence.png');
 await click(card+' [data-action=learning-practice]');await until("!!document.querySelector('#source-question')");
 verify('从分组准确定位原卷原题',await evaluate(`paperId==='${seeded.p2}'&&document.querySelector('#source-question').value==='Q02'`),'未默认选第一道Q01');
 verify('不沿用另一题已有审批',await evaluate(`!document.querySelector('[data-exercise="${seeded.old_exercise}"]')&&!document.querySelector('#ex-consent')`),'聚焦当前来源，旧练习仍完整保留');
 await click('[data-action=template][data-level="0"]');await until("!!document.querySelector('#ex-consent')");
 let state=await boot();const created=state.exercises.find(e=>e.question_id==='Q02');verify('只建目标补练草稿',created?.paper_id===seeded.p2&&created.status==='DRAFT'&&state.exercises.find(e=>e.id===seeded.old_exercise).status==='APPROVED','没有把旧题审批迁移给新题');await screenshot('02-source-practice-draft.png');
 await click('#ex-consent');await click('[data-action=approve-exercise]');await until("exercise()?.status==='APPROVED'");await click('[data-action=retest]');await until("!!document.querySelector('#rt-answer')");await fill('#rt-answer','(-1,-4)，x=-1');await fill('#rt-condition','独立完成');await fill('#rt-result','CORRECT');await click('#rt-consent');await click('[data-action=save-retest]');await until("!document.querySelector('#modal').open");await click('[data-view=profile]');await until("!!document.querySelector('.learning-group')");
 verify('复测答对不擦除原卷反复问题',await evaluate("currentProfile.retests.length===1&&currentProfile.learning_analysis.groups.find(g=>g.knowledge==='二次函数·顶点式').wrong_count===2"),'复测单列，一次正确不判掌握');
 await click('[data-view=review]');await fill('[data-q=Q02] [data-field=result]','CORRECT');await click('[data-action=save-paper]');await until("paper()?.version===2");await click('#confirm-consent');await click('[data-action=confirm-paper]');await until("paper()?.confirmed_version===2");await click('[data-view=practice]');
 verify('聚焦原题改判后不能默默选另一题',await evaluate("document.querySelector('#source-question').value!=='Q01'&&document.querySelector('[data-action=manual-exercise]').disabled&&[...document.querySelectorAll('[data-action=template]')].every(e=>e.disabled)"),'当前焦点Q02已不适用，不创建Q01练习');await screenshot('03-stale-focus-blocked.png');
 const exCount=(await boot()).exercises.length;await evaluate("(async()=>{try{await makeExercise();}catch(e){toast(e.message)}})()");verify('提交层也阻断失效来源',(await boot()).exercises.length===exCount,'不靠禁用按钮单独保护');
 await click('[data-view=review]');await fill('[data-q=Q02] [data-field=result]','INCORRECT');await click('[data-action=save-paper]');await until("paper()?.version===3");await click('#confirm-consent');await click('[data-action=confirm-paper]');await until("paper()?.confirmed_version===3");await click('[data-view=profile]');
 verify('同卷多次改判不增加跨作业次数',await evaluate("currentProfile.learning_analysis.groups.find(g=>g.knowledge==='二次函数·顶点式').wrong_paper_count===2"),'三版记录仍为两份作业');
 await evaluate(`(async()=>{for(const id of ['${seeded.p1}','${seeded.p2}']){const p=await api('papers/'+id);p.questions[0].cause='新增待核对备注';await api('papers/'+id+'/draft',{version:p.version,questions:p.questions});}await refresh();})()`);
 verify('来源均有未确认修订时先复核',await evaluate(`!document.querySelector(${JSON.stringify(card+' [data-action=learning-practice]')})&&!!document.querySelector(${JSON.stringify(card+' [data-action=learning-review]')})`),'不借旧审核授权新补练');await click(card+' [data-action=learning-review]');await until("!!document.querySelector('#confirm-paper')");verify('回到正确原卷的当前待审版本',await evaluate(`paperId==='${seeded.p2}'&&paper().version===4&&paper().confirmed_version===3`),'不自动确认修订');
 await click('[data-view=profile]');await evaluate(`(async()=>{const p=await api('papers',{student_ref:'SYN-LEARN-01',student_name:'虚构学习反馈学生',batch_id:'SYN-XSS',title:'转义合成',questions:[{id:'Q01',stem:'安全题',answer:'1',knowledge:'<img src=x onerror=alert(1)>',question_type:'<script>bad()</script>',result:'CORRECT'}]});await api('papers/'+p.id+'/confirm',{version:1,consent:true});await refresh();})()`);
 verify('标签作为文字显示',await evaluate("document.querySelectorAll('.learning-group img,.learning-group script').length===0&&document.querySelector('.learning-groups').textContent.includes('<img src=x')"),'不把标签变成HTML');
 await command('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});await screenshot('03-mobile-evidence.png');verify('分组证据窄屏无横向溢出',await evaluate("document.documentElement.scrollWidth<=innerWidth+1"),'390px');
 verify('无真实外发及页面异常',requests.every(u=>!u.endsWith('/send')&&(!/^https?:/.test(u)||u.startsWith(base+'/')))&&pageErrors.length===0,'所有确认、练习与复测只在隔离合成库模拟');
}catch(e){failure=e.stack||String(e);}
finally{
 if(ws?.readyState===WebSocket.OPEN){try{await command('Browser.close',{},false);}catch{}ws.close();}if(chrome.exitCode===null)chrome.kill();if(python.exitCode===null)python.kill();
 const report={scope:'隔离合成跨次学习证据、准确补练与复测单列；非真实教师验收',checks,passed:checks.filter(c=>c.passed).length,total:checks.length,pageErrors,failure:failure||null,dataDir};await writeFile(path.join(output,'verification.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({passed:report.passed,total:report.total,failure:report.failure,output}));if(failure)process.exitCode=1;
}
