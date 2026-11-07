// 本地原型预览与关键交互抽查，仅使用 Node 内置模块和独立 Chrome 配置目录。
import {spawn} from 'node:child_process';
import {mkdtemp,readFile,writeFile,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
const project=String.raw`E:\GPT\AI-Tutoring-Diagnosis`;
const output=path.join(project,'docs','design','live-photo-manual-preview');
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
const base='http://127.0.0.1:8765', sourceId='f011e4aecc374f9094bacc0ed710982b', paperId='ae610302cbe64649be63d7a9f88d270d';
const delayFill=async(selector,value)=>evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});e.value=${JSON.stringify(value)};e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));})()`);
async function until(expr){for(let i=0;i<100;i++){if(await evaluate(expr))return;await delay(80);}throw Error('wait failed '+expr);}
const stems=['求抛物线 y=−(x−2)²+3 的顶点坐标和对称轴。','解方程 x²−5x+6=0。','化简 (x²−1)/(x−1)，并写出 x 的取值限制。','求数据 6、8、10、12 的平均数。'];
const answers=['顶点坐标：(−2,3)；对称轴：x=−2。','(x−2)(x−3)=0；x=2 或 x=3。','(x−1)(x+1)/(x−1)=x+1。','平均数=(6+8+10+12)/4=36/4=8。'];
let resultRecord;let resumedReadonly=false;
try{
 const before=await (await fetch(base+'/api/papers/'+paperId)).json();if(![1,2].includes(before.version)||before.confirmed_version!==0)throw Error('Source version changed; do not overwrite');resumedReadonly=before.version===2;
 let active;for(let i=0;i<100;i++){try{active=(await readFile(path.join(profile,'DevToolsActivePort'),'utf8')).trim().split(/\r?\n/);break;}catch{await delay(100);}}
 if(!active)throw Error('Chrome not ready');ws=new WebSocket(`ws://127.0.0.1:${active[0]}${active[1]}`);await new Promise((r,j)=>{ws.addEventListener('open',r,{once:true});ws.addEventListener('error',j,{once:true});});
 ws.addEventListener('message',e=>{const m=JSON.parse(String(e.data));if(m.id&&pending.has(m.id)){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(Error(m.error.message)):p.resolve(m.result);}if(m.method==='Network.requestWillBeSent')requests.push({url:m.params.request.url,method:m.params.request.method});if(m.method==='Runtime.exceptionThrown')pageErrors.push(m.params.exceptionDetails.text);});
 const target=await command('Target.createTarget',{url:'about:blank'},false);session=(await command('Target.attachToTarget',{targetId:target.targetId,flatten:true},false)).sessionId;await command('Page.enable');await command('Runtime.enable');await command('Network.enable');await command('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
 await command('Page.navigate',{url:base+'/#ai'});await until("!!document.querySelector('#ai-key')");
 verify('正式服务当前未装入Key',await evaluate("document.querySelector('#ai-key').placeholder==='未输入密钥'"),'人工整理不需要模型密钥');
 if(!resumedReadonly){
 await evaluate(`(async()=>{aiShowJob(await api('ai/jobs/${sourceId}'));})()`);await until("!!document.querySelector('[data-action=vision-manual-open]')");await click('[data-action=vision-manual-open]');await until("!!document.querySelector('[data-action=vision-manual-add]')");
 verify('原待核查任务可人工整理',await evaluate("document.querySelector('#modal').innerText.includes('虚构学生 · 照片接口验证') && document.querySelector('#modal').innerText.includes('不发送模型请求')"),'明确原图归属，原调用状态不改变');
 for(let i=0;i<4;i++){
  if(i)await click('[data-action=vision-manual-add]');
  const prefix=`.ocr-question:nth-of-type(${i+1}) `;await delayFill(prefix+'[data-ocr=stem]',stems[i]);await delayFill(prefix+'[data-ocr=answer]',answers[i]);
  if(i===2)await delayFill(prefix+'[data-ocr=recognition_notes]','手写的数字1与字母l形近，需真人老师对照原图核实。');
  else await click(prefix+'[data-ocr=recognition_resolved]');
 }
 await screenshot('01-synthetic-manual-review.png');await click('#vision-transcription-consent');await click('[data-action=vision-manual-apply]');await until("document.querySelector('#confirm-paper')?.textContent.includes('V2')");
 } else {
  const source=await (await fetch(base+'/api/ai/jobs/'+sourceId)).json();
  if(source.transcription_source_method!=='MANUAL_FALLBACK')throw Error('Existing data is not this manual rehearsal');
  verify('已有演练只读复核',true,'没有重复提交人工表');
  await click('[data-view=review]');
  await evaluate(`(()=>{const e=document.querySelector('#paper-select');e.value=${JSON.stringify(paperId)};e.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  await until("document.querySelector('#confirm-paper')?.textContent.includes('V2')");
 }
 const state=await (await fetch(base+'/api/bootstrap')).json();const paper=state.papers.find(p=>p.id===paperId);const source=await (await fetch(base+'/api/ai/jobs/'+sourceId)).json();
 verify('人工整理仅保存为新待审',paper.version===2&&paper.confirmed_version===0&&paper.questions.length===4&&paper.questions.every(q=>q.result==='PENDING'),'无真人教师确认、无自动判题');
 verify('原待核查与未知用量保留',source.status==='UNKNOWN'&&source.usage===null&&source.transcription_source_method==='MANUAL_FALLBACK','未假报OCR成功，未虚构用量');
 verify('识别疑点独立保留',paper.questions[2].recognition_resolved===false&&paper.questions[2].recognition_notes.includes('字母l'),'疑点不是学生错因，需真人老师复核');
 verify('原学生作答错误原样保留',paper.questions[0].answer.includes('−2')&&paper.questions[3].answer.endsWith('=8。'),'没有用标准答案改学生原作答');
 verify('没有新增确认事件',state.event_count===0,'三个合成对象仍无正式确认');await screenshot('02-manual-pending-paper.png');
 const exported=await fetch(base+`/api/export/paper/${paperId}.docx?audience=teacher&version=2`);verify('教师待审Word可生成',exported.ok,'包括识别核对与疑点，不供学生直接发布');await writeFile(path.join(output,'photo-manual-review-teacher.docx'),Buffer.from(await exported.arrayBuffer()));
 verify('没有任何新增模型发送',requests.every(r=>!/^https?:/.test(r.url)||r.url.startsWith(base+'/'))&&requests.filter(r=>r.url.endsWith('/send')).length===0,'实际操作只有本机GET和人工保存POST');verify('无页面异常',pageErrors.length===0,pageErrors.join(';')||'无');
 resultRecord={paper_id:paperId,source_job_id:sourceId,source_status:source.status,source_usage:source.usage,paper_version:paper.version,confirmed_version:paper.confirmed_version,event_count:state.event_count,questions:paper.questions,actor:'Codex user-authorized synthetic manual transcription; not a real teacher confirmation'};
}catch(e){failure=e.stack||String(e);}
finally{
 if(ws?.readyState===WebSocket.OPEN){try{await command('Browser.close',{},false);}catch{}ws.close();}if(chrome.exitCode===null)chrome.kill();
 const report={scope:'正式本机服务上对已获准合成照片做人工兜底，无外部调用、无真人教师审核',checks,passed:checks.filter(c=>c.passed).length,total:checks.length,pageErrors,failure:failure||null,resumed_readonly:resumedReadonly,result:resultRecord||null};await writeFile(path.join(output,'verification.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({passed:report.passed,total:report.total,failure:report.failure,output}));if(failure)process.exitCode=1;
}
