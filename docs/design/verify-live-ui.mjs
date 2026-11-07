// 本地原型预览与关键交互抽查，仅使用 Node 内置模块和独立 Chrome 配置目录。
import {spawn} from 'node:child_process';
import {mkdtemp,readFile,writeFile,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
const project=String.raw`E:\GPT\AI-Tutoring-Diagnosis`;
const output=path.join(project,'docs','design','live-api-preview');
await mkdir(output,{recursive:true});
const profile=await mkdtemp(path.join(project,'app/.qa-temp/live-preview-'));
const chrome=spawn(String.raw`C:\Program Files\Google\Chrome\Application\chrome.exe`,[
 '--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check',
 '--disable-background-networking','--disable-sync','--disable-extensions',
 '--remote-debugging-port=0',`--user-data-dir=${profile}`,'about:blank'
],{windowsHide:true,stdio:'ignore'});
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const pending=new Map();let sequence=0,ws,session;
const checks=[],requests=[],pageErrors=[];
function verify(name,passed,detail){checks.push({name,passed,detail});if(!passed)throw new Error(name+': '+detail);}
async function command(method,params={},useSession=true){
 const id=++sequence;
 return new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>{pending.delete(id);reject(new Error('CDP timeout '+method));},12000);
  pending.set(id,{resolve:v=>{clearTimeout(timer);resolve(v);},reject:e=>{clearTimeout(timer);reject(e);}});
  ws.send(JSON.stringify({id,method,params,...(useSession&&session?{sessionId:session}:{})}));
 });
}
async function evaluate(expression){const result=await command('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(result.exceptionDetails)throw new Error(result.exceptionDetails.text);return result.result.value;}
const click=selector=>evaluate(`(()=>{const b=document.querySelector(${JSON.stringify(selector)});if(!b)throw new Error('missing control');b.click();return true;})()`);
async function screenshot(name){const r=await command('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});await writeFile(path.join(output,name),Buffer.from(r.data,'base64'));}
let failure;
const base='http://127.0.0.1:8765';
const evidence=JSON.parse(await readFile(path.join(project,'docs/design/live-api/20261104T183037Z-d0accefc/verification.json'),'utf8'));
try{
 let active;for(let i=0;i<100;i++){try{active=(await readFile(path.join(profile,'DevToolsActivePort'),'utf8')).trim().split(/\r?\n/);break;}catch{await delay(100);}}
 if(!active)throw Error('Chrome not ready');
 ws=new WebSocket(`ws://127.0.0.1:${active[0]}${active[1]}`);await new Promise((resolve,reject)=>{ws.addEventListener('open',resolve,{once:true});ws.addEventListener('error',reject,{once:true});});
 ws.addEventListener('message',event=>{const m=JSON.parse(String(event.data));if(m.id&&pending.has(m.id)){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(Error(m.error.message)):p.resolve(m.result);}if(m.method==='Network.requestWillBeSent')requests.push({url:m.params.request.url,method:m.params.request.method});if(m.method==='Runtime.exceptionThrown')pageErrors.push(m.params.exceptionDetails.text);});
 const target=await command('Target.createTarget',{url:'about:blank'},false);session=(await command('Target.attachToTarget',{targetId:target.targetId,flatten:true},false)).sessionId;
 await command('Page.enable');await command('Runtime.enable');await command('Network.enable');await command('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
 await command('Page.navigate',{url:base});
 for(let i=0;i<100;i++){if(await evaluate("!!document.querySelector('#paper-select')"))break;await delay(80);}
 await evaluate(`(()=>{const e=document.querySelector('#paper-select');e.value=${JSON.stringify(evidence.paper_id)};e.dispatchEvent(new Event('change',{bubbles:true}));})()`);
 for(let i=0;i<100;i++){if(await evaluate("document.querySelectorAll('.question').length===4 && document.querySelector('#confirm-paper')?.textContent.includes('V2')"))break;await delay(80);}
 verify('真实返回显示四题',await evaluate("document.querySelectorAll('.question').length===4"),'真实模型结果来自合成文字，不是浏览器假接口');
 verify('界面判定与真实结果一致',JSON.stringify(await evaluate("[...document.querySelectorAll('[data-field=result]')].map(e=>e.value)"))===JSON.stringify(['INCORRECT','CORRECT','PARTIAL','INCORRECT']),'Q01 I / Q02 C / Q03 PARTIAL / Q04 I');
 verify('仍需教师主动确认',await evaluate("document.querySelector('#confirm-paper').disabled && !document.querySelector('#confirm-consent').checked"),'V2待审，没有模拟真人签名');
 await delay(1000);await screenshot('live-math-draft.png');
 const docx=await fetch(base+`/api/export/paper/${evidence.paper_id}.docx?audience=teacher&version=2`);verify('真实模型待审报告导出',docx.ok,'教师报告仍标待审，不向学生发布');await writeFile(path.join(output,'live-math-review-teacher.docx'),Buffer.from(await docx.arrayBuffer()));
 const state=await (await fetch(base+'/api/bootstrap')).json();verify('只读查看未增加确认事件',state.event_count===evidence.before_event_count,'仍0条确认事件');
 verify('浏览器未触发POST或外部调用',requests.every(r=>r.method==='GET'&&r.url.startsWith(base+'/')),'只有本机GET请求');verify('无页面异常',pageErrors.length===0,pageErrors.join(';')||'无');
}catch(e){failure=e.stack||String(e);}
finally{
 if(ws?.readyState===WebSocket.OPEN){try{await command('Browser.close',{},false);}catch{}ws.close();}if(chrome.exitCode===null)chrome.kill();
 const report={scope:'真实API已返回后的只读本机界面及教师Word导出检查；无新模型调用，无教师确认',checks,passed:checks.filter(c=>c.passed).length,total:checks.length,pageErrors,failure:failure||null};await writeFile(path.join(output,'verification.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));if(failure)process.exitCode=1;
}
