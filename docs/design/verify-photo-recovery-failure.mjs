// Real local app UI checks using independent temporary data, Chrome and Node built-ins.
import {spawn} from 'node:child_process';
import {mkdtemp,readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
const project=String.raw`E:\GPT\AI-Tutoring-Diagnosis`;
const output=path.join(project,'docs/design/photo-recovery-failure-preview');await mkdir(output,{recursive:true});
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
 if(!active)throw Error('Chrome not ready');
 ws=new WebSocket(`ws://127.0.0.1:${active[0]}${active[1]}`);await new Promise((resolve,reject)=>{ws.addEventListener('open',resolve,{once:true});ws.addEventListener('error',reject,{once:true});});
 ws.addEventListener('message',event=>{const m=JSON.parse(String(event.data));if(m.id&&pending.has(m.id)){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(Error(m.error.message)):p.resolve(m.result);}if(m.method==='Network.requestWillBeSent')requests.push(m.params.request.url);if(m.method==='Runtime.exceptionThrown')pageErrors.push(m.params.exceptionDetails.exception?.description||m.params.exceptionDetails.text);});
 const target=await command('Target.createTarget',{url:'about:blank'},false);session=(await command('Target.attachToTarget',{targetId:target.targetId,flatten:true},false)).sessionId;
 await command('Page.enable');await command('Runtime.enable');await command('Network.enable');await command('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});


 await command('Page.navigate',{url:base});await until("!!document.querySelector('[data-action=seed]')");await click('[data-action=seed]');await until("document.querySelectorAll('#questions .question').length===4");const original=(await boot()).papers[0];
 await click('[data-view=ai]');await fill('#ai-key','SYNTHETIC-ONLY');await click('[data-action=ai-save]');await until("document.querySelector('#ai-key')?.placeholder.includes('已有')");await click('[data-action=vision-probe]');await click('#ai-send-consent');await click('[data-action=ai-send]');await until("document.querySelector('#modal').innerText.includes('随机六位数字全部读对')");await click('[data-action=close]');await click('[data-view=review]');
 await click('[data-q=Q02] [data-action=vision-question]');await until("document.querySelector('#vision-canvas')?.width>100");await click('[data-action=vision-whole]');await click('[data-action=vision-prepare]');await until("!!document.querySelector('#ai-send-consent')");await click('#ai-send-consent');await click('[data-action=ai-send]');await until("!!document.querySelector('[data-action=vision-recover]')");
 verify('失败有简短原因和建议',await evaluate("document.querySelector('#modal').innerText.includes('JSON')&&document.querySelector('#modal').innerText.includes('分题框选')&&document.querySelector('#modal').innerText.includes('调用耗时')"),'不是只报格式不合格');await screenshot('01-actionable-failure.png');
 const source=(await (await fetch(base+'/api/ai/jobs')).json()).find(j=>j.mode==='vision_transcribe');
 await click('[data-action=close]');await evaluate(`(async()=>{const other=await api('papers',{student_ref:'OTHER-SYNTHETIC',student_name:'另一名虚构学生',batch_id:'OTHER-BATCH',title:'另一张卷',questions:[{id:'Q01',stem:'另一题',answer:'另一作答',result:'PENDING'}]});paperId=other.id;await refresh();aiShowJob(await api('ai/jobs/${source.id}'));})()`);
 await click('[data-action=vision-recover]');await until("document.querySelector('#vision-canvas')?.width>100");
 verify('切回失败所属卷当前版本',await evaluate(`paperId==='${original.id}'&&visionEditor.paperId==='${original.id}'&&visionEditor.version===1&&document.querySelector('#vision-target').value==='Q02'&&visionEditor.crop===null`),'不操作另一学生，不复用选区');
 verify('恢复入口没有新的发送',requests.filter(u=>u.endsWith('/send')).length===2,'只有最初数字探测和失败图各一次');await click('[data-action=close]');
 await click('[data-view=ai]');await click('[data-action=ai-clear]');await until("document.querySelector('#ai-key')?.placeholder==='未输入密钥'");await click(`[data-action=ai-open-job][data-job="${source.id}"]`);await click('[data-action=vision-manual-open]');
 verify('单题人工表固定目标且没有增题按钮',await evaluate("document.querySelector('[data-ocr=id]').value==='Q02'&&!document.querySelector('[data-action=vision-manual-add]')&&document.querySelectorAll('.ocr-question').length===1"),'无需Key；后台同样限制跨题');
 await fill('[data-ocr=stem]','人工核对的第二题');await fill('[data-ocr=answer]','保留原笔迹');await click('[data-ocr=recognition_resolved]');await click('#vision-transcription-consent');await click('[data-action=vision-manual-apply]');await until("document.querySelector('#confirm-paper')?.textContent.includes('V2')");
 const state=await boot(), final=state.papers.find(p=>p.id===original.id),saved=await(await fetch(base+'/api/ai/jobs/'+source.id)).json();
 verify('人工只改目标且保留失败用量',final.questions.every(q=>q.id==='Q02'||JSON.stringify(q)===JSON.stringify(original.questions.find(x=>x.id===q.id)))&&saved.status==='INVALID_RESULT'&&saved.usage.total_tokens===15,'不把人工结果记成AI成功');
 verify('全过程没有归档或额外发送',state.event_count===0&&final.confirmed_version===0&&requests.filter(u=>u.endsWith('/send')).length===2,'其他学生和旧失败不动');
 await evaluate(`(async()=>{aiShowJob(await api('ai/jobs/${source.id}'));})()`);await click('[data-action=vision-recover]');await until("document.querySelector('#vision-canvas')?.width>100");
 verify('旧失败入口跟随当前卷新版本',await evaluate("visionEditor.version===2&&visionEditor.crop===null&&document.querySelector('#vision-target').value==='Q02'"),'不把V1发送授权带到V2');
 verify('没有外部网络与页面异常',requests.every(u=>!/^https?:/.test(u)||u.startsWith(base+'/'))&&pageErrors.length===0,'隔离fake transport');
}catch(e){failure=e.stack||String(e);}
finally{
 if(ws?.readyState===WebSocket.OPEN){try{await command('Browser.close',{},false);}catch{}ws.close();}if(chrome.exitCode===null)chrome.kill();if(python.exitCode===null)python.kill();
 const report={scope:'隔离假AI失败摘要、跨卷恢复及单题人工整理；没有真实模型请求',checks,passed:checks.filter(c=>c.passed).length,total:checks.length,pageErrors,failure:failure||null,dataDir};await writeFile(path.join(output,'verification.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({passed:report.passed,total:report.total,failure:report.failure,output}));if(failure)process.exitCode=1;
}
