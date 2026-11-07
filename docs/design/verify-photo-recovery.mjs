// Real local app UI checks using independent temporary data, Chrome and Node built-ins.
import {spawn} from 'node:child_process';
import {mkdtemp,readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
const project=String.raw`E:\GPT\AI-Tutoring-Diagnosis`;
const output=path.join(project,'docs/design/photo-recovery-preview');await mkdir(output,{recursive:true});
const tempBase=path.join(project,'app/.qa-temp');await mkdir(tempBase,{recursive:true});
const run=await mkdtemp(path.join(tempBase,'browser-'));
const dataDir=path.join(run,'data');const profile=path.join(run,'chrome');
const python=spawn('python',[path.join(project,'app/tests/browser_fixture_server.py'),'--data-dir',dataDir,'--port','0','--ocr-single'],{windowsHide:true,stdio:['ignore','pipe','pipe']});
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

 await command('Page.navigate',{url:base});await until("!!document.querySelector('[data-action=seed]')");await click('[data-action=seed]');await until("document.querySelectorAll('#questions .question').length===4");
 const original=(await boot()).papers[0];
 verify('每题有独立重识别入口',await evaluate("!!document.querySelector('[data-q=Q02] [data-action=vision-question]')"),'不改变逐生整卷审核方式');
 await click('[data-view=ai]');await fill('#ai-key','SYNTHETIC-ONLY');await click('[data-action=ai-save]');await until("document.querySelector('#ai-key')?.placeholder.includes('已有')");await click('[data-action=vision-probe]');await click('#ai-send-consent');await click('[data-action=ai-send]');await until("document.querySelector('#modal').innerText.includes('随机六位数字全部读对')");await click('[data-action=close]');await click('[data-view=review]');
 await click('[data-q=Q02] [data-action=vision-question]');await until("document.querySelector('#vision-canvas')?.width>100");
 verify('单题入口固定当前题且默认无选区',await evaluate("document.querySelector('#vision-target').value==='Q02' && document.querySelector('#vision-prepare').disabled"),'先框选后授权');
 await click('[data-action=vision-whole]');await click('[data-action=vision-prepare]');await until("!!document.querySelector('#ai-send-consent')");
 verify('发送预览显示单题目标',await evaluate("document.querySelector('#modal').innerText.includes('本次目标：Q02')"),'真实PNG可见，不自动发送');await click('#ai-send-consent');await click('[data-action=ai-send]');await until("document.querySelectorAll('.ocr-question').length===1");
 verify('读号不一致保留原号与未清疑点',await evaluate("document.querySelector('[data-ocr=id]').value==='Q01' && !document.querySelector('[data-ocr=recognition_resolved]').checked && document.querySelector('[data-ocr=recognition_notes]').value.includes('Q02')"),'假接口故意把Q02读成Q01');
 await click('#vision-transcription-consent');await click('[data-action=vision-apply]');await until("document.querySelector('#toast').textContent.includes('本次单题目标')");
 verify('未修正题号不能误写第一题',(await boot()).papers[0].version===1,'后端阻止覆盖');
 await fill('[data-ocr=id]','Q02');verify('改号后清除旧授权',await evaluate("!document.querySelector('#vision-transcription-consent').checked && document.querySelector('#vision-apply').disabled"),'必须重新核对');await click('[data-ocr=recognition_resolved]');await click('#vision-transcription-consent');await screenshot('01-target-question-review.png');await click('[data-action=vision-apply]');await until("document.querySelector('#confirm-paper')?.textContent.includes('V2')");
 const final=(await boot()).papers[0], jobs=await (await fetch(base+'/api/ai/jobs')).json(), source=jobs.find(j=>j.mode==='vision_transcribe');const saved=await(await fetch(base+'/api/ai/jobs/'+source.id)).json();
 verify('只更新目标，其他三题逐字段保留',final.questions.every(q=>q.id==='Q02'||JSON.stringify(q)===JSON.stringify(original.questions.find(x=>x.id===q.id))),'未混入其他题');
 verify('AI原题号与人工改号分别保留',saved.result.questions[0].id==='Q01'&&saved.teacher_transcription[0].id==='Q02'&&saved.teacher_transcription[0].source_ocr_id==='Q01','不可覆盖AI原转写');
 verify('新待审不归档',final.version===2&&final.confirmed_version===0&&(await boot()).event_count===0,'没有教师签字或学生发布');await screenshot('02-target-paper-pending.png');
 await click('[data-q=Q03] [data-action=vision-question]');await until("document.querySelector('#vision-canvas')?.width>100");verify('下一题从当前版本重新框选',await evaluate("visionEditor.version===2&&document.querySelector('#vision-target').value==='Q03'&&visionEditor.crop===null"),'不复用上题选区和发送授权');
 await command('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});await screenshot('03-mobile-target.png');console.log(JSON.stringify(await evaluate("(()=>{const d=document.querySelector('#modal');return {modal:[d.clientWidth,d.scrollWidth],wide:[...d.querySelectorAll('*')].filter(e=>e.getBoundingClientRect().right>d.getBoundingClientRect().right).map(e=>({tag:e.tagName,id:e.id,w:e.getBoundingClientRect().width,sw:e.scrollWidth}))}})()")));verify('目标选择窄屏无横向溢出',await evaluate("document.querySelector('#modal').scrollWidth<=document.querySelector('#modal').clientWidth+1"),'390px');
 verify('没有外部网络与页面异常',requests.every(u=>!/^https?:/.test(u)||u.startsWith(base+'/'))&&pageErrors.length===0,'所有模型回复均来自隔离fake transport');
}catch(e){failure=e.stack||String(e);}
finally{
 if(ws?.readyState===WebSocket.OPEN){try{await command('Browser.close',{},false);}catch{}ws.close();}if(chrome.exitCode===null)chrome.kill();if(python.exitCode===null)python.kill();
 const report={scope:'隔离假AI单题归属、改号及只改目标；不证明OCR准确率',checks,passed:checks.filter(c=>c.passed).length,total:checks.length,pageErrors,failure:failure||null,dataDir};await writeFile(path.join(output,'verification.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({passed:report.passed,total:report.total,failure:report.failure,output}));if(failure)process.exitCode=1;
}
