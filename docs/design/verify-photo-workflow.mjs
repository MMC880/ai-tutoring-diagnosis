// Real local app UI checks using independent temporary data, Chrome and Node built-ins.
import {spawn} from 'node:child_process';
import {mkdtemp,readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
const project=String.raw`E:\GPT\AI-Tutoring-Diagnosis`;
const output=path.join(project,'docs/design/photo-workflow-preview');await mkdir(output,{recursive:true});
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
 await command('Page.navigate',{url:base});await until("!!document.querySelector('[data-action=seed]')");await click('[data-action=seed]');await until("document.querySelectorAll('.question').length===4");
 await click('[data-action=vision-open]');await until("document.querySelector('#vision-canvas')?.width>100");
 verify('裁切默认不选全图',await evaluate("document.querySelector('#vision-prepare').disabled && document.querySelector('#vision-selection').textContent.includes('尚未选区')"),'必须主动选区域');
 await click('[data-action=vision-whole]');verify('未验证当前会话不能发作业图',await evaluate("document.querySelector('#vision-prepare').disabled"),'即使选整张图也被能力门槛拦截');await click('[data-action=close]');
 await click('[data-view=ai]');await fill('#ai-key','SYNTHETIC-ONLY-NOT-A-REAL-KEY');await click('[data-action=ai-save]');await until("document.querySelector('#ai-key')?.placeholder.includes('已有')");await click('[data-action=vision-probe]');
 verify('图片验证预览有真实PNG且需授权',await evaluate("document.querySelector('.vision-outbound-image').src.startsWith('data:image/png;base64,') && document.querySelector('#ai-send').disabled"),'合成六位数字没有作为文本提示答案');await click('#ai-send-consent');await click('[data-action=ai-send]');await until("document.querySelector('#modal').innerText.includes('随机六位数字全部读对')");verify('图片验证通过才解锁会话',true,'测试服务器为强制假AI，不代表真实接口');
 await click('[data-action=vision-open]');await until("document.querySelector('#vision-canvas')?.width>100");await click('[data-action=vision-reset]');
 const bounds=await evaluate("(()=>{const r=document.querySelector('#vision-canvas').getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height}})()");
 await command('Input.dispatchMouseEvent',{type:'mousePressed',x:bounds.x+25,y:bounds.y+25,button:'left',clickCount:1});await command('Input.dispatchMouseEvent',{type:'mouseMoved',x:bounds.x+240,y:bounds.y+170,button:'left',buttons:1});await command('Input.dispatchMouseEvent',{type:'mouseReleased',x:bounds.x+240,y:bounds.y+170,button:'left',clickCount:1});
 verify('鼠标可实际框选区域',await evaluate("document.querySelector('#vision-selection').textContent.includes('已选') && !document.querySelector('#vision-prepare').disabled"),'Canvas坐标映射到服务端标准化像素');
 await click('[data-action=vision-whole]');await click('[data-action=vision-mask-mode]');
 await command('Input.dispatchMouseEvent',{type:'mousePressed',x:bounds.x+8,y:bounds.y+8,button:'left',clickCount:1});await command('Input.dispatchMouseEvent',{type:'mouseMoved',x:bounds.x+25,y:bounds.y+20,buttons:1});await command('Input.dispatchMouseEvent',{type:'mouseReleased',x:bounds.x+25,y:bounds.y+20,button:'left',clickCount:1});
 verify('可添加遮挡区域',await evaluate("document.querySelector('#vision-selection').textContent.includes('遮挡 1 处')"),'仅在合成照片空白角落演练');await screenshot('01-local-crop-mask.png');
 await click('[data-action=vision-prepare]');await until("!!document.querySelector('#ai-send-consent')");verify('服务端实际发送图先预览',await evaluate("(async()=>{const jobs=await api('ai/jobs');const job=await api('ai/jobs/'+jobs.find(j=>j.mode==='vision_transcribe').id);const body=JSON.stringify(job.payload);return document.querySelector('.vision-outbound-image').src.startsWith('data:image/png;base64,')&&document.querySelector('#ai-send').disabled&&!body.includes('虚构学生01')&&!body.includes('合成作业样例.png')})()"),'本机可显示归属；实际请求body不含身份或原文件名');await screenshot('02-outbound-png.png');
 await click('#ai-send-consent');await click('[data-action=ai-send]');await until("document.querySelectorAll('.ocr-question').length===4");verify('图片结果先到逐题转写核对',await evaluate("document.querySelectorAll('.ocr-question').length===4 && document.querySelector('#vision-apply').disabled && !document.querySelector('[data-ocr=recognition_resolved]').checked"),'存在疑点而非判学生错');
 await click('#vision-transcription-consent');await fill('.ocr-question [data-ocr=answer]','顶点(−2,3)，轴x=−2（已对照原笔迹）');verify('改转写后必须重新确认',await evaluate("!document.querySelector('#vision-transcription-consent').checked && document.querySelector('#vision-apply').disabled"),'不沿用编辑前的勾选');await screenshot('03-transcription-teacher-review.png');
 await click('#vision-transcription-consent');await click('[data-action=vision-apply]');await until("document.querySelector('#confirm-paper')?.textContent.includes('V2')");const p=(await boot()).papers[0];
 verify('转写只进入新待审，全部待核对',p.version===2&&p.confirmed_version===0&&p.questions.every(q=>q.result==='PENDING')&&(await boot()).event_count===0,'原候选判断不沿用，未自动批改或归档');
 await fill('[data-q=Q01] [data-field=result]','INCORRECT');await click('[data-action=save-paper]');await until("document.querySelector('#toast').textContent.includes('识别疑点未解决')");verify('未清识别疑点不能判错',(await boot()).papers[0].version===2,'后端拦截，没有假报保存');
 await click('[data-q=Q01] [data-field=recognition_resolved]');await click('[data-action=save-paper]');await until("document.querySelector('#confirm-paper')?.textContent.includes('V3')");
 await click('[data-action=ai-material]');await click('[data-action=ai-prepare]');await until("!!document.querySelector('#ai-send-consent')");verify('核清后可进入文字辅助批改',await evaluate("document.querySelector('#modal').innerText.includes('核对本次外发内容')"),'第二次外发仍独立预览/授权');await click('[data-action=close]');
 await command('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});await command('Page.navigate',{url:base});await until("!!document.querySelector('[data-action=vision-open]')");await click('[data-action=vision-open]');await until("document.querySelector('#vision-canvas')?.width>100");verify('窄屏裁切弹窗无横向溢出',await evaluate("document.querySelector('#modal').scrollWidth<=document.querySelector('#modal').clientWidth+1 && document.documentElement.scrollWidth<=innerWidth+1"),'390px视口');await screenshot('04-mobile-crop.png');
 verify('浏览器无外部资源或模型请求',requests.every(u=>!/^https?:/.test(u)||u.startsWith(base+'/')),'模型行为仅由fixture假Transport提供');verify('无页面异常',pageErrors.length===0,pageErrors.join(';')||'无');
}catch(e){failure=e.stack||String(e);}
finally{
 if(ws?.readyState===WebSocket.OPEN){try{await command('Browser.close',{},false);}catch{}ws.close();}if(chrome.exitCode===null)chrome.kill();if(python.exitCode===null)python.kill();
 const report={scope:'隔离合成照片＋强制内存假AI的裁切/转写/疑点交互；不是实际OCR准确率',checks,passed:checks.filter(c=>c.passed).length,total:checks.length,pageErrors,failure:failure||null,dataDir};await writeFile(path.join(output,'verification.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({passed:report.passed,total:report.total,failure:report.failure,output}));if(failure)process.exitCode=1;
}
