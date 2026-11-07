// 本地原型预览与关键交互抽查，仅使用 Node 内置模块和独立 Chrome 配置目录。
import {spawn} from 'node:child_process';
import {mkdtemp,readFile,writeFile,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
const project=String.raw`E:\GPT\AI-Tutoring-Diagnosis`;
const output=path.join(project,'docs','design','live-photo-single-preview');
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
let failure,resultRecord;
const base='http://127.0.0.1:8765',sourceId='f12467d3de1644cc98a55c1388c37dee',paperId='ae610302cbe64649be63d7a9f88d270d';
async function until(expr){for(let i=0;i<700;i++){if(await evaluate(expr))return;await delay(80);}throw Error('wait failed '+expr);}
try{
 const before=await (await fetch(base+'/api/papers/'+paperId)).json();if(before.version!==2||before.confirmed_version!==0)throw Error('Source changed; no overwrite');
 let active;for(let i=0;i<100;i++){try{active=(await readFile(path.join(profile,'DevToolsActivePort'),'utf8')).trim().split(/\r?\n/);break;}catch{await delay(100);}}
 if(!active)throw Error('Chrome not ready');ws=new WebSocket(`ws://127.0.0.1:${active[0]}${active[1]}`);await new Promise((r,j)=>{ws.addEventListener('open',r,{once:true});ws.addEventListener('error',j,{once:true});});
 ws.addEventListener('message',e=>{const m=JSON.parse(String(e.data));if(m.id&&pending.has(m.id)){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(Error(m.error.message)):p.resolve(m.result);}if(m.method==='Network.requestWillBeSent')requests.push({url:m.params.request.url.startsWith('data:')?'data:[inline-image]':m.params.request.url,method:m.params.request.method});if(m.method==='Runtime.exceptionThrown')pageErrors.push(m.params.exceptionDetails.text);});
 const target=await command('Target.createTarget',{url:'about:blank'},false);session=(await command('Target.attachToTarget',{targetId:target.targetId,flatten:true},false)).sessionId;await command('Page.enable');await command('Runtime.enable');await command('Network.enable');await command('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
 await command('Page.navigate',{url:base+'/#ai'});await until("!!document.querySelector('#ai-key')");
 await evaluate(`(async()=>{aiShowJob(await api('ai/jobs/${sourceId}'));})()`);await until("document.querySelectorAll('.ocr-question').length===1");
 verify('真实裁切转写保留两个负号',await evaluate("document.querySelector('[data-ocr=answer]').value.match(/-2/g)?.length===2"),'对照actual-outbound.png，顶点(-2,3)与轴x=-2均保留');await screenshot('01-real-crop-transcription.png');
 await click('#vision-transcription-consent');await click('[data-action=vision-apply]');await until("document.querySelector('#confirm-paper')?.textContent.includes('V3')");
 const p3=await (await fetch(base+'/api/papers/'+paperId)).json();
 verify('局部转写只改对应题号',p3.questions.length===4&&p3.questions.slice(1).every((q,i)=>q.answer===before.questions[i+1].answer)&&p3.questions[2].recognition_resolved===false,'其他三题与Q03真人待核实状态保留');
 const q1=p3.questions.find(q=>q.id==='Q01');
 await evaluate(`(async()=>{const p=${JSON.stringify({mode:'text_review',paper_id:paperId,version:3,questions:[q1]})};aiShowJob(await api('ai/prepare',p));})()`);await until("!!document.querySelector('#ai-send-consent')");
 verify('诊断外发仅这一题',await evaluate("!document.querySelector('#modal').innerText.includes('Q02')&&!document.querySelector('#modal').innerText.includes('Q03')&&!document.querySelector('#modal').innerText.includes('Q04')"),'不是原UNKNOWN整页任务的重发');
 await click('#ai-send-consent');await click('[data-action=ai-send]');await until("!!document.querySelector('#ai-apply-consent')||document.querySelector('#modal').innerText.includes('调用结果待核查')||document.querySelector('#modal').innerText.includes('接口返回失败')");
 const jobs=await (await fetch(base+'/api/ai/jobs')).json();const review=jobs.find(j=>j.mode==='text_review'&&j.paper_id===paperId&&j.paper_version===3);
 const response=await (await fetch(base+'/api/ai/jobs/'+review.id)).json();
 verify('真实单题诊断返回有效结果',response.status==='SUCCEEDED'&&response.result.questions.length===1&&response.result.questions[0].result==='INCORRECT','正确顶点应(2,3)、轴x=2，错因仍待核实');
 await screenshot('02-real-question-diagnosis.png');await click('#ai-apply-consent');await click('[data-action=ai-apply]');await until("document.querySelector('#confirm-paper')?.textContent.includes('V4')");
 const state=await (await fetch(base+'/api/bootstrap')).json(), final=state.papers.find(p=>p.id===paperId);
 verify('图像到诊断仍只入待审',final.version===4&&final.confirmed_version===0&&state.event_count===0&&final.questions[0].answer===q1.answer,'保留原笔迹，无真人教师确认、无学生发布');
 verify('其他题与未清疑点不串改',final.questions.slice(1).every((q,i)=>q.answer===before.questions[i+1].answer)&&final.questions[2].recognition_resolved===false,'Q03不送批改，其他未判断题仍PENDING');await screenshot('03-real-photo-pending-workbench.png');
 const report=await fetch(base+`/api/export/paper/${paperId}.docx?audience=teacher&version=4`);verify('教师V4报告生成',report.ok,'识别疑点单独保留');await writeFile(path.join(output,'photo-question1-review-teacher.docx'),Buffer.from(await report.arrayBuffer()));
 verify('本轮仅一个新增发送动作',requests.filter(r=>r.url.endsWith('/send')).length===1,'文字诊断1次，未重放整页图片');verify('无页面异常',pageErrors.length===0,pageErrors.join(';')||'无');
 resultRecord={paper_id:paperId,transcription_job_id:sourceId,text_review_job_id:review.id,text_status:response.status,text_usage:response.usage,question1_suggestion:response.result.questions[0],final_paper:final,event_count:state.event_count,actor:'User-authorized synthetic crop review; not real teacher confirmation'};
}catch(e){failure=e.stack||String(e);}
finally{
 if(ws?.readyState===WebSocket.OPEN){try{await command('Browser.close',{},false);}catch{}ws.close();}if(chrome.exitCode===null)chrome.kill();
 const report={scope:'真实接口单题裁切转写→合成核对→文字诊断→V4待审；不等于整页OCR通过',checks,passed:checks.filter(c=>c.passed).length,total:checks.length,pageErrors,failure:failure||null,result:resultRecord||null};await writeFile(path.join(output,'verification.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({passed:report.passed,total:report.total,failure:report.failure,output}));if(failure)process.exitCode=1;
}
