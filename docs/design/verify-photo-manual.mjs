// Real local app UI checks using independent temporary data, Chrome and Node built-ins.
import {spawn} from 'node:child_process';
import {mkdtemp,readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
const project=String.raw`E:\GPT\AI-Tutoring-Diagnosis`;
const output=path.join(project,'docs/design/photo-manual-preview');await mkdir(output,{recursive:true});
const tempBase=path.join(project,'app/.qa-temp');await mkdir(tempBase,{recursive:true});
const run=await mkdtemp(path.join(tempBase,'browser-'));
const dataDir=path.join(run,'data');const profile=path.join(run,'chrome');
const python=spawn('python',[path.join(project,'app/tests/browser_fixture_server.py'),'--data-dir',dataDir,'--port','0','--ocr-invalid'],{windowsHide:true,stdio:['ignore','pipe','pipe']});
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
 if(!active)throw Error('Chrome not ready');ws=new WebSocket(`ws://127.0.0.1:${active[0]}${active[1]}`);await new Promise((r,j)=>{ws.addEventListener('open',r,{once:true});ws.addEventListener('error',j,{once:true});});
 ws.addEventListener('message',e=>{const m=JSON.parse(String(e.data));if(m.id&&pending.has(m.id)){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(Error(m.error.message)):p.resolve(m.result);}if(m.method==='Network.requestWillBeSent')requests.push({url:m.params.request.url,method:m.params.request.method});if(m.method==='Runtime.exceptionThrown')pageErrors.push(m.params.exceptionDetails.text);});
 const target=await command('Target.createTarget',{url:'about:blank'},false);session=(await command('Target.attachToTarget',{targetId:target.targetId,flatten:true},false)).sessionId;await command('Page.enable');await command('Runtime.enable');await command('DOM.enable');await command('Network.enable');await command('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
 await command('Page.navigate',{url:base});await until("!!document.querySelector('[data-action=new]')");await click('[data-action=new]');await fill('#new-ref','SYN-MANUAL-01');await fill('#new-name','人工整理虚构学生');await fill('#new-batch','SYN-MANUAL-B1');await fill('#new-title','本机人工转写测试');
 await command('Network.disable');const dom=await command('DOM.getDocument');const input=await command('DOM.querySelector',{nodeId:dom.root.nodeId,selector:'#new-files'});await command('DOM.setFileInputFiles',{nodeId:input.nodeId,files:[path.join(project,'app/web/assets/synthetic-homework.png')]});await click('[data-action=create-paper]');await until("!document.querySelector('#modal').open && !!document.querySelector('[data-action=vision-open]')");await command('Network.enable',{maxPostDataSize:1024});
 await click('[data-view=ai]');await fill('#ai-key','FAKE-NOT-A-REAL-KEY');await click('[data-action=ai-save]');await until("document.querySelector('#ai-key')?.placeholder.includes('已有')");await click('[data-action=vision-probe]');await until("!!document.querySelector('#ai-send-consent')");await click('#ai-send-consent');await click('[data-action=ai-send]');await until("document.querySelector('#modal').innerText.includes('随机六位数字全部读对')");await click('[data-action=vision-open]');await until("document.querySelector('#vision-canvas')?.width>100");await click('[data-action=vision-whole]');await click('[data-action=vision-prepare]');await until("!!document.querySelector('#ai-send-consent')");await click('#ai-send-consent');await click('[data-action=ai-send]');await until("!!document.querySelector('[data-action=vision-manual-open]')");
 verify('无效图片返回不能写档',(await boot()).papers[0].version===1&&(await boot()).event_count===0,'保留INVALID_RESULT，未创建转写');await screenshot('01-invalid-response.png');
 const jobs=await (await fetch(base+'/api/ai/jobs')).json();const source=jobs.find(j=>j.mode==='vision_transcribe');
 await click('[data-action=close]');await click('[data-action=ai-clear]');await until("document.querySelector('#ai-key')?.placeholder==='未输入密钥'");await click(`[data-job="${source.id}"][data-action=ai-open-job]`);await click('[data-action=vision-manual-open]');
 verify('无Key也可人工整理且归属可见',await evaluate("document.querySelector('#modal').innerText.includes('人工整理虚构学生') && document.querySelector('#modal').innerText.includes('不发送模型请求') && document.querySelectorAll('.ocr-question').length===1"),'仅本机表单，无外部请求');
 await click('[data-action=vision-manual-remove]');verify('至少保留一题或取消',await evaluate("document.querySelectorAll('.ocr-question').length===1"),'避免空表覆盖原卷');
 const stems=['求顶点和对称轴','解方程 x²−5x+6=0','化简分式并写限制','求平均数'];const answers=['顶点(−2,3)，轴x=−2','x=2或3','x+1','36÷4=8'];
 for(let i=0;i<4;i++){
  if(i)await click('[data-action=vision-manual-add]');
  await fill(`.ocr-question:nth-of-type(${i+1}) [data-ocr=stem]`,stems[i]);await fill(`.ocr-question:nth-of-type(${i+1}) [data-ocr=answer]`,answers[i]);await click(`.ocr-question:nth-of-type(${i+1}) [data-ocr=recognition_resolved]`);
 }
 await click('[data-action=vision-manual-add]');await click('.ocr-question:last-of-type [data-action=vision-manual-remove]');verify('可人工增减题行',await evaluate("document.querySelectorAll('.ocr-question').length===4"),'保留四道实际人工输入');await screenshot('02-manual-transcription-form.png');
 verify('人工表需明确确认',await evaluate("document.querySelector('#vision-apply').disabled"),'无默认通过');await click('#vision-transcription-consent');await click('[data-action=vision-manual-apply]');await until("document.querySelector('#confirm-paper')?.textContent.includes('V2')");
 const state=await boot();const result=await (await fetch(base+'/api/ai/jobs/'+source.id)).json();
 verify('原失败与用量保留',result.status==='INVALID_RESULT'&&result.usage.total_tokens===15&&result.transcription_source_method==='MANUAL_FALLBACK','人工表不伪装模型成功');
 verify('人工仅进入新待审',state.papers[0].version===2&&state.papers[0].confirmed_version===0&&state.papers[0].questions.length===4&&state.papers[0].questions.every(q=>q.result==='PENDING')&&state.event_count===0,'没有自动判断对错或归档');
 verify('人工保存没有新的发送请求',requests.filter(r=>r.url.endsWith('/send')).length===2,'只有先前两个合成假请求，人工阶段零发送');await screenshot('03-manual-unconfirmed-paper.png');
 await click('[data-view=ai]');verify('历史明确标记人工待审',await evaluate("document.body.innerText.includes('人工待审卷V2')"),'原失败仍显示');
 verify('无页面异常',pageErrors.length===0,pageErrors.join(';')||'无');
}catch(e){failure=e.stack||String(e);}
finally{
 if(ws?.readyState===WebSocket.OPEN){try{await command('Browser.close',{},false);}catch{}ws.close();}if(chrome.exitCode===null)chrome.kill();if(python.exitCode===null)python.kill();
 const report={scope:'合成图＋强制无效假AI的人工转写兜底；不是真实OCR验收',checks,passed:checks.filter(c=>c.passed).length,total:checks.length,pageErrors,failure:failure||null,dataDir};await writeFile(path.join(output,'verification.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({passed:report.passed,total:report.total,failure:report.failure,output}));if(failure)process.exitCode=1;
}
