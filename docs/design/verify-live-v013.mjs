// Real local app UI checks using independent temporary data, Chrome and Node built-ins.
import {spawn} from 'node:child_process';
import {mkdtemp,readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
const project=String.raw`E:\GPT\AI-Tutoring-Diagnosis`;
const output=path.join(project,'docs/design/v013-live-preview');await mkdir(output,{recursive:true});
const tempBase=path.join(project,'app/.qa-temp');await mkdir(tempBase,{recursive:true});
const run=await mkdtemp(path.join(tempBase,'browser-'));
const dataDir=path.join(run,'data');const profile=path.join(run,'chrome');
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
try{base="http://127.0.0.1:8765";
 let active;for(let i=0;i<100;i++){try{active=(await readFile(path.join(profile,'DevToolsActivePort'),'utf8')).trim().split(/\r?\n/);break;}catch{await delay(100);}}
 if(!active)throw Error('Chrome not ready');
 ws=new WebSocket(`ws://127.0.0.1:${active[0]}${active[1]}`);await new Promise((resolve,reject)=>{ws.addEventListener('open',resolve,{once:true});ws.addEventListener('error',reject,{once:true});});
 ws.addEventListener('message',event=>{const m=JSON.parse(String(event.data));if(m.id&&pending.has(m.id)){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(Error(m.error.message)):p.resolve(m.result);}if(m.method==='Network.requestWillBeSent')requests.push(m.params.request.url);if(m.method==='Runtime.exceptionThrown')pageErrors.push(m.params.exceptionDetails.exception?.description||m.params.exceptionDetails.text);});
 const target=await command('Target.createTarget',{url:'about:blank'},false);session=(await command('Target.attachToTarget',{targetId:target.targetId,flatten:true},false)).sessionId;
 await command('Page.enable');await command('Runtime.enable');await command('Network.enable');await command('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});


 await command('Page.navigate',{url:base});await until("!!document.querySelector('#paper-select')");
 const before=await boot();await evaluate("(async()=>{paperId='ae610302cbe64649be63d7a9f88d270d';view='review';await refresh();})()");
 verify('实际工作台版本为0.13',await evaluate("document.body.innerText.includes('本地试用版 0.13')"),'不是假fixture');
 await until("document.querySelectorAll('.photo-card').length===1");verify('实际照片清单显示本卷一张作业图',await evaluate("document.querySelector('#photo-progress').textContent.includes('1张作业照片')"),'只读本机历史，不把记录当确认');await evaluate("document.querySelector('#photo-progress').scrollIntoView({block:'start'})");await screenshot('04-live-photo-progress.png');
 verify('实际工作台已加载老师原批改区域',await evaluate("document.querySelectorAll('#questions [data-field=teacher_result]').length===paper().questions.length&&document.querySelectorAll('.teacher-grading').length===paper().questions.length"),'未替老师填写原判或确认');
 verify('实际整卷有独立题型字段',await evaluate("!!document.querySelector('[data-q=Q03] [data-field=question_type]')"),'没有替用户填入候选');
 await click('[data-q=Q03] [data-action=vision-question]');await until("document.querySelector('#vision-canvas')?.width>100");
 verify('实际未核清题能定位单题入口',await evaluate("document.querySelector('#vision-target').value==='Q03'&&visionEditor.version===4&&visionEditor.crop===null"),'V4待审，默认不选整页');
 await click('[data-action=vision-whole]');verify('升级后无密钥不能发送',await evaluate("document.querySelector('#vision-prepare').disabled"),'会话密钥和图片能力按设计重置');await screenshot('01-live-target-preview.png');await click('[data-action=close]');
 await evaluate("(async()=>{aiShowJob(await api('ai/jobs/ccb891e797f34685a8f15ecd8bda4936'));})()");
 await click('#modal details summary');verify('真实旧超时诊断保留',await evaluate("document.querySelector('#modal').innerText.includes('TimeoutError')&&document.querySelector('#modal').innerText.includes('用量')"),'没有把失败标为成功或补造usage');await click('[data-action=vision-recover]');await until("document.querySelector('#vision-canvas')?.width>100");
 verify('实际失败入口回到同卷当前版本',await evaluate("visionEditor.paperId==='ae610302cbe64649be63d7a9f88d270d'&&visionEditor.version===4&&visionEditor.crop===null"),'没有重新发送');
 verify('实际整页入口有可选本地清单',await evaluate("!!document.querySelector('#vision-expected')&&!document.querySelector('#vision-expected').disabled&&document.querySelector('#vision-expected').value===''"),'无Key时不准备或发送任务');await click('[data-action=close]');await click('[data-view=ai]');verify('实际分段接收默认关闭',await evaluate("!!document.querySelector('#ai-image-stream')&&!document.querySelector('#ai-image-stream').checked"),'不自动改变用户渠道');
 await click('[data-view=practice]');verify('实际补练页提供辅导候选入口',await evaluate("!!document.querySelector('[data-action=tutor-open]')&&typeof tutorShowJob==='function'"),'新脚本已加载');await click('[data-action=tutor-open]');verify('未确认原卷不能拟辅导',await evaluate("!document.querySelector('#modal').open&&document.querySelector('#toast').textContent.includes('确认')"),'不为演示伪造老师确认或创建AI任务');await screenshot('03-live-tutoring-guard.png');
 await click('[data-view=profile]');await until("!!document.querySelector('.learning-groups')");verify('实际未确认档案不制造反复问题',await evaluate("currentProfile.events.length===0&&currentProfile.learning_analysis.groups.length===0"),'工程样例确认仅在隔离库，本机正式事件仍零');await screenshot('02-live-empty-evidence.png');
 await evaluate("(async()=>{const j=await api('ai/jobs/ccb891e797f34685a8f15ecd8bda4936');visionShowJob(j)})()");await click('[data-action=vision-manual-open]');verify('实际人工核对表加载续录入口',await evaluate("!!document.querySelector('[data-action=continuation-open]')&&typeof composeContinuation==='function'"),'仅打开本机表，不写盘不发送');await fill('.ocr-question [data-ocr=stem]','合成本机续录预览，取消不保存');await fill('.ocr-question [data-ocr=answer]','合成本机临时演示文字');await click('[data-action=continuation-open]');await until("!!document.querySelector('.continuation-preview')");verify('实际预览仅显示本卷已录同题',await evaluate("document.querySelector('.continuation-preview').textContent.includes('Q01')&&!document.querySelector('[data-merge-consent]').checked&&document.querySelector('[data-action=continuation-fill]').disabled"),'不勾选、不填表、不保存');await screenshot('05-live-continuation.png');await click('[data-action=continuation-cancel]');await click('[data-action=close]');
 verify('实际后端为0.13.0',(await (await fetch(base+'/api/health')).json()).version==='0.13.0','界面与服务一致');
 await click('[data-view=profile]');await until("!!document.querySelector('#profile-student-select')");
 verify('实际个人档案有学生选择和独立摘要',await evaluate("!!document.querySelector('.archive-summary')&&document.querySelector('#profile-student-select').value===paper().student_id"),'不替老师确认真实材料');
 verify('实际未确认草稿不冒充学习证据',await evaluate("currentProfile.current_evidence.length===0&&currentProfile.archive_summary.history_events===0"),'当前业务库仍0条确认');await screenshot('06-live-student-archive.png');
 await click('[data-view=teaching]');await until("!!document.querySelector('[data-action=teaching-import]')");
 verify('实际教学资料库可独立打开',await evaluate("view==='teaching'&&document.querySelector('.teaching-grid').textContent.includes('尚未导入')"),'不导入真实或未经审核的四科底稿');
 verify('实际教学目录未自动授权',await evaluate("(async()=>((await api('teaching/materials')).length===0&&(await api('teaching/catalog')).length===0))()"),'资料库及可引用目录为空');
 await click('[data-view=profile]');await until("!!document.querySelector('.learning-groups')");
 verify('实际知识分组脚本显示归组边界',await evaluate("typeof learningBasisHTML==='function'&&document.querySelector('.learning-groups').textContent.includes('已关联的记录按老师审核过的知识条目归组')"),'不伪造真实跨次证据');
 const after=await boot();verify('实际数据不变',after.event_count===0&&JSON.stringify(after.papers)===JSON.stringify(before.papers),'无教师确认和档案写入');
 verify('只读无发送与页面异常',requests.every(u=>!u.endsWith('/send')&&!u.endsWith('/prepare'))&&requests.every(u=>!/^https?:/.test(u)||u.startsWith(base+'/'))&&pageErrors.length===0,'不使用外部模型');
}catch(e){failure=e.stack||String(e);}
finally{
 if(ws?.readyState===WebSocket.OPEN){try{await command('Browser.close',{},false);}catch{}ws.close();}if(chrome.exitCode===null)chrome.kill();
 const report={scope:'实际v0.13工作台只读验收；合成运行资料，无外部模型调用',checks,passed:checks.filter(c=>c.passed).length,total:checks.length,pageErrors,failure:failure||null,dataDir};await writeFile(path.join(output,'verification.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({passed:report.passed,total:report.total,failure:report.failure,output}));if(failure)process.exitCode=1;
}
