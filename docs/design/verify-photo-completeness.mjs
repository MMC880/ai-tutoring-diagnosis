// Real local app UI checks using independent temporary data, Chrome and Node built-ins.
import {spawn} from 'node:child_process';
import {mkdtemp,readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
const project=String.raw`E:\GPT\AI-Tutoring-Diagnosis`;
const output=path.join(project,'docs/design/photo-completeness-preview');await mkdir(output,{recursive:true});
const tempBase=path.join(project,'app/.qa-temp');await mkdir(tempBase,{recursive:true});
const run=await mkdtemp(path.join(tempBase,'browser-'));
const dataDir=path.join(run,'data');const profile=path.join(run,'chrome');
const python=spawn('python',[path.join(project,'app/tests/browser_fixture_server.py'),'--data-dir',dataDir,'--port','0','--ocr-omit-last'],{windowsHide:true,stdio:['ignore','pipe','pipe']});
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
 ws.addEventListener('message',event=>{const m=JSON.parse(String(event.data));if(m.id&&pending.has(m.id)){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(Error(m.error.message)):p.resolve(m.result);}if(m.method==='Network.requestWillBeSent')requests.push(m.params.request.url);if(m.method==='Page.javascriptDialogOpening'&&m.params.type==='beforeunload')command('Page.handleJavaScriptDialog',{accept:true}).catch(e=>pageErrors.push(e.message));if(m.method==='Runtime.exceptionThrown')pageErrors.push(m.params.exceptionDetails.exception?.description||m.params.exceptionDetails.text);});
 const target=await command('Target.createTarget',{url:'about:blank'},false);session=(await command('Target.attachToTarget',{targetId:target.targetId,flatten:true},false)).sessionId;
 await command('Page.enable');await command('Runtime.enable');await command('Network.enable');await command('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});


 await command('Page.navigate',{url:base});await until("!!document.querySelector('[data-action=seed]')");await click('[data-action=seed]');await until("document.querySelectorAll('#questions .question').length===4");const original=(await boot()).papers[0];
 await click('[data-view=ai]');verify('图片分段接收为显式可选且默认关闭',await evaluate("!!document.querySelector('#ai-image-stream')&&!document.querySelector('#ai-image-stream').checked"),'不默认更换用户当前渠道行为');
 await click('#ai-image-stream');await fill('#ai-key','SYNTHETIC-ONLY');await click('[data-action=ai-save]');await until("document.querySelector('#ai-key')?.placeholder.includes('已有')");verify('图片设置持久化',await evaluate("document.querySelector('#ai-image-stream').checked"),'不据此声称真实渠道兼容');
 await click('[data-action=vision-probe]');await until("!!document.querySelector('#ai-send-consent')");verify('图片探测请求显式分段',await evaluate("document.querySelector('#modal').innerText.includes('分段')"),'实际请求body由后端带stream=true');await click('#ai-send-consent');await click('[data-action=ai-send]');await until("document.querySelector('#modal').innerText.includes('随机六位数字全部读对')");await click('[data-action=vision-open]');await until("document.querySelector('#vision-canvas')?.width>100");
 verify('自由区域可填写应有题号清单',await evaluate("!!document.querySelector('#vision-expected')&&!document.querySelector('#vision-expected').disabled&&document.querySelector('#vision-expected').value===''"),'默认不猜题数');
 await fill('#vision-expected','Q01, Q02, Q03, Q04');await click('[data-action=vision-whole]');await click('[data-action=vision-prepare]');await until("!!document.querySelector('#ai-send-consent')");
 verify('预览包含本机归属来源版本和四题清单',await evaluate("document.querySelector('#modal').innerText.includes('虚构学生01')&&document.querySelector('#modal').innerText.includes('来源V1')&&document.querySelector('#modal').innerText.includes('Q04')"),'老师知道给谁核对，清单只在本地');await screenshot('01-expected-question-preview.png');
 const jobList=await (await fetch(base+'/api/ai/jobs')).json();const source=jobList.find(j=>j.mode==='vision_transcribe'),prepared=await(await fetch(base+'/api/ai/jobs/'+source.id)).json();
 verify('清单不混进实际外发body',prepared.metadata.expected_question_ids.length===4&&!JSON.stringify(prepared.payload).includes('expected_question_ids')&&prepared.payload.stream===true,'只发送区域PNG和固定照录规则');
 await click('#ai-send-consent');await click('[data-action=ai-send]');await until("document.querySelectorAll('.ocr-question').length===3");
 verify('三识一漏明确展示',await evaluate("document.querySelector('#vision-coverage').innerText.includes('应有4题')&&document.querySelector('#vision-coverage').innerText.includes('识别3题')&&document.querySelector('#vision-coverage').innerText.includes('Q04')"),'假接口故意漏最后一题，不代表真实识别');await screenshot('02-incomplete-transcription.png');
 await click('#vision-transcription-consent');await fill('[data-ocr=answer]','顶点(−2,3)，轴x=−2（人工核对原笔迹）');verify('编辑后重新勾选核对',await evaluate("!document.querySelector('#vision-transcription-consent').checked&&document.querySelector('#vision-apply').disabled"),'不沿用旧授权');await click('#vision-transcription-consent');await click('[data-action=vision-apply]');await until("document.querySelector('#confirm-paper')?.textContent.includes('V2')");
 const state=await boot(),p=state.papers[0],missing=p.questions.find(q=>q.id==='Q04');
 verify('漏识别题保留旧笔迹但仅待核对',p.questions.length===4&&missing.answer===original.questions[3].answer&&missing.result==='PENDING'&&missing.recognition_resolved===false&&missing.recognition_notes.includes('未识别'),'不删题、不当成不会、不用正确答案补写');
 verify('整卷保存携带识别过程补充',await evaluate("collectQuestions().find(q=>q.id==='Q04').recognition_notice.includes('未识别')"),'不因保存编辑丢掉系统缺口说明');
 verify('学生原错误保留且不归档',p.questions[0].answer.includes('−2')&&p.confirmed_version===0&&state.event_count===0,'仅新待审');await screenshot('03-missing-question-pending.png');
 await fill('[data-q=Q04] [data-field=result]','INCORRECT');await click('[data-action=save-paper]');await until("document.querySelector('#toast').innerText.includes('识别疑点未解决')");verify('漏识别不能直接判错',(await boot()).papers[0].version===2,'后端拒绝');
 await command('Page.navigate',{url:base});await until("!!document.querySelector('[data-action=vision-open]')");await click('[data-action=vision-open]');await until("document.querySelector('#vision-canvas')?.width>100");await fill('#vision-target','Q02');verify('单题和整页清单互斥',await evaluate("document.querySelector('#vision-expected').disabled&&document.querySelector('#vision-expected').value===''"),'后端同样拒绝混用');await fill('#vision-target','');await fill('#vision-expected','');await click('[data-action=vision-whole]');await click('[data-action=vision-prepare]');await until("!!document.querySelector('#ai-send-consent')");await click('#ai-send-consent');await click('[data-action=ai-send]');await until("document.querySelectorAll('.ocr-question').length===3");
 verify('没有清单不假报题数齐全',await evaluate("document.querySelector('#vision-coverage').innerText.includes('尚未核验题数完整性')"),'识别成功不等于整页完整');
 await command('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});await screenshot('04-mobile-coverage.png');verify('覆盖提示窄屏无横向溢出',await evaluate("document.querySelector('#modal').scrollWidth<=document.querySelector('#modal').clientWidth+1"),'390px');
 verify('没有外部网络与页面异常',requests.every(u=>!/^https?:/.test(u)||u.startsWith(base+'/'))&&pageErrors.length===0,'fixture只验证交互；SSE字节协议由独立测试覆盖');
}catch(e){failure=e.stack||String(e);}
finally{
 if(ws?.readyState===WebSocket.OPEN){try{await command('Browser.close',{},false);}catch{}ws.close();}if(chrome.exitCode===null)chrome.kill();if(python.exitCode===null)python.kill();
 const report={scope:'隔离假AI图片清单及三识一漏待核对；不证明真实SSE渠道或OCR准确率',checks,passed:checks.filter(c=>c.passed).length,total:checks.length,pageErrors,failure:failure||null,dataDir};await writeFile(path.join(output,'verification.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({passed:report.passed,total:report.total,failure:report.failure,output}));if(failure)process.exitCode=1;
}
