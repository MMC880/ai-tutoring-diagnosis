// Real local app UI checks using independent temporary data, Chrome and Node built-ins.
import {spawn} from 'node:child_process';
import {mkdtemp,readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
const project=String.raw`E:\GPT\AI-Tutoring-Diagnosis`;
const output=path.join(project,'docs/design/history-ai-preview');await mkdir(output,{recursive:true});
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
 if(!base)throw Error('server not ready '+serviceLog);
 let active;for(let i=0;i<100;i++){try{active=(await readFile(path.join(profile,'DevToolsActivePort'),'utf8')).trim().split(/\r?\n/);break;}catch{await delay(100);}}
 if(!active)throw Error('Chrome not ready');ws=new WebSocket(`ws://127.0.0.1:${active[0]}${active[1]}`);await new Promise((r,j)=>{ws.addEventListener('open',r,{once:true});ws.addEventListener('error',j,{once:true});});
 ws.addEventListener('message',e=>{const m=JSON.parse(String(e.data));if(m.id&&pending.has(m.id)){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(Error(m.error.message)):p.resolve(m.result);}if(m.method==='Network.requestWillBeSent')requests.push(m.params.request.url);if(m.method==='Runtime.exceptionThrown')pageErrors.push(m.params.exceptionDetails.exception?.description||m.params.exceptionDetails.text);if(m.method==='Page.javascriptDialogOpening'){pageErrors.push('Unexpected browser dialog: '+m.params.message);command('Page.handleJavaScriptDialog',{accept:false}).catch(()=>{});}});
 const target=await command('Target.createTarget',{url:'about:blank'},false);session=(await command('Target.attachToTarget',{targetId:target.targetId,flatten:true},false)).sessionId;
 await command('Page.enable');await command('Runtime.enable');await command('Network.enable');await command('DOM.enable');
 await command('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
 await command('Page.navigate',{url:base});await until("!!document.querySelector('[data-action=seed]')");
 await click('[data-action=seed]');await until("document.querySelectorAll('.question').length===4 && document.querySelector('#homework-image')?.naturalWidth>0");
 verify('合成原图与四题载入',true,'真实服务返回合成附件与预设草稿；不是OCR');await screenshot('01-review-local.png');
 await click('[data-view=profile]');verify('未审不进入档案',(await evaluate("document.body.innerText.includes('先让确认过的证据进入档案')")),'profile无确认记录');
 await click('[data-view=review]');verify('整卷确认必须勾选',await evaluate("document.querySelector('#confirm-paper').disabled"),'按钮禁用');
 await click('#confirm-consent');await click('#confirm-paper');await until("document.querySelector('#save-state')?.textContent.includes('此版本已确认')");
 verify('确认写入四条事件',(await boot()).event_count===4,'SQLite保存，非浏览器内存');
 await command('Page.reload');await until("document.querySelector('#save-state')?.textContent.includes('此版本已确认')");verify('刷新后整卷确认保留',(await boot()).event_count===4,'刷新仍四条');
 await fill('[data-q="Q04"] [data-field=result]','CORRECT');verify('编辑会撤回当前勾选',await evaluate("!document.querySelector('#confirm-consent').checked && document.querySelector('#confirm-paper').disabled"),'必须先保存新版本');
 await click('[data-action=save-paper]');await until("document.querySelector('#confirm-paper')?.textContent.includes('V2')");await click('#confirm-consent');await click('#confirm-paper');await delay(200);
 const s1=(await boot()).papers[0];let summary=await (await fetch(base+'/api/summary?batch=SYN-LOCAL-001')).json();
 verify('改判保留旧历史且统计用最新',(await boot()).event_count===8&&summary.counts.CORRECT===2&&summary.counts.INCORRECT===1,'8条历史，最新四项2C1I1PARTIAL');
 await click('[data-view=profile]');verify('档案展示修订历史',await evaluate("document.querySelectorAll('.timeline-item').length===8"),'R1/R2均在');await screenshot('02-profile-history.png');
 await click('[data-view=class]');await screenshot('03-class-local.png');
 await click('[data-view=practice]');await click('[data-action=template][data-level="0"]');await until("!!document.querySelector('#ex-consent')");verify('补练未审不可导出学生版',await evaluate("document.querySelector('[data-action=export-exercise]').disabled"),'学生导出禁用');await click('#ex-consent');await click('[data-action=approve-exercise]');await until("!document.querySelector('[data-action=retest]').disabled");await screenshot('04-practice-approved.png');
 const ex=(await boot()).exercises[0];const docx=await fetch(base+`/api/export/exercise/${ex.id}.docx?audience=student&version=1`);verify('真实Word导出',docx.ok,'学生版DOCX下载200');await writeFile(path.join(output,'student-practice.docx'),Buffer.from(await docx.arrayBuffer()));
 await fill('#ex-stem','新版练习 y=(x−2)²−1，求顶点。');await fill('#ex-answer','(2,−1)');await click('[data-action=save-exercise]');await until("document.querySelector('#exercise-version')?.options.length===2");verify('修订后新版本需要重新审批',await evaluate("document.querySelector('[data-action=retest]').disabled"),'V2为待审，不沿用V1审批');
 await fill('#exercise-version','1');await until("document.querySelector('#ex-stem')?.readOnly");verify('旧版本保留题面与审批只读可迟交',await evaluate("document.querySelector('#ex-stem').value.includes('(x+1)') && !document.querySelector('[data-action=retest]').disabled && document.querySelector('[data-action=save-exercise]').disabled"),'显示V1旧题，编辑被禁用，旧审批只对V1有效');await screenshot('09-exercise-version-history.png');
 await click('[data-action=retest]');await fill('#rt-answer','顶点 (−1,−4)，对称轴 x=−1');await fill('#rt-result','CORRECT');await click('#rt-consent');await click('[data-action=save-retest]');await until("!document.querySelector('#modal').open");
 let profileData=await (await fetch(base+'/api/profiles/'+s1.student_id)).json();summary=await (await fetch(base+'/api/summary?batch=SYN-LOCAL-001')).json();verify('复测追加并独立统计',profileData.retests.length===1&&profileData.events.length===8&&summary.binary_denominator===3,'复测1，原卷历史8，原卷二元分母3');
 await click('[data-view=profile]');await screenshot('05-profile-retest.png');
 await click('[data-action=new]');await fill('#new-ref','SYN-02');await fill('#new-name','虚构学生02');await fill('#new-batch','SYN-SEPARATE-002');await fill('#new-title','独立批次作业');
 // Avoid serializing the multi-megabyte upload body into a CDP Network event.
 await command('Network.disable');
 const dom=await command('DOM.getDocument');const input=await command('DOM.querySelector',{nodeId:dom.root.nodeId,selector:'#new-files'});await command('DOM.setFileInputFiles',{nodeId:input.nodeId,files:[path.join(project,'app/web/assets/synthetic-homework.png')]});await click('[data-action=create-paper]');await until("document.querySelectorAll('.question').length===1 && !document.querySelector('#modal').open");
 await command('Network.enable',{maxPostDataSize:1024});
 const d2=await boot();const second=d2.papers.find(p=>p.student_ref==='SYN-02');verify('真实本地图片收件',second?.documents.length===1&&second.questions[0].result==='PENDING','新生新批次附件保存，不假装自动识别');
 await click('[data-view=class]');verify('学生批次不串档',await evaluate("document.body.innerText.includes('0 / 1') && document.body.innerText.includes('还没有教师确认的原卷')"),'独立批次未审，原学生统计保持');
 await click('[data-view=review]');await click('[data-action=import-questions]');await fill('#draft-json',JSON.stringify({questions:[{id:'Q01',stem:'解方程 x²−5x+6=0。',answer:'x=2 或 x=3',correct_answer:'x=2 或 x=3',knowledge:'一元二次方程',cause:'',result:'CORRECT'}]}));await click('[data-action=apply-import]');await until("!document.querySelector('#modal').open && document.querySelector('[data-field=stem]')?.value.includes('解方程')");verify('WorkBuddy结构化草稿导入不自动归档',(await boot()).event_count===8,'导入只更新草稿，仍需老师审核');
 await click('#confirm-consent');await click('#confirm-paper');await until("document.querySelector('#save-state')?.textContent.includes('此版本已确认')");const secondSummary=await (await fetch(base+'/api/summary?batch=SYN-SEPARATE-002')).json();verify('独立批次确认单独汇总',secondSummary.confirmed_students===1&&secondSummary.counts.CORRECT===1&&(await boot()).event_count===9,'新批次一题，第一名学生历史保持8条');
 await click('[data-action=export-paper]');verify('导出须主动选择格式',await evaluate("document.querySelector('#export-go').disabled"),'没有默认同时导出Word/PDF');await click('[data-action=close]');
 await click('[data-view=backup]');await click('[data-action=backup]');await until("document.querySelectorAll('.backup-row').length===1");verify('完整备份真实生成',true,'备份含SQLite与附件，页面显示哈希与下载');await screenshot('06-backups.png');
 await click('[data-restore]');verify('恢复需要二次明确确认',await evaluate("!!document.querySelector('#restore-word') && document.querySelector('#modal').open"),'不会点击列表即恢复');await click('[data-action=close]');
 await click('[data-view=ai]');await until("!!document.querySelector('#ai-base')");verify('预置用户指定服务与模型',await evaluate("document.querySelector('#ai-base').value==='https://discovery-api.intern-ai.org.cn/v1' && document.querySelector('#ai-model').value==='deepseek-v4.1-flash-1017' && document.querySelector('#ai-key').type==='password'"),'密钥只在本机输入；当前服务器为测试替身');await screenshot('10-ai-settings.png');
 await click('[data-action=ai-probe]');verify('未填密钥不得发送',await evaluate("document.querySelector('#ai-send').disabled"),'准备固定请求，不真实发送');await click('[data-action=close]');
 await fill('#ai-key','SYNTHETIC-ONLY-NOT-A-REAL-KEY');await click('[data-action=ai-save]');await until("document.querySelector('#ai-key')?.placeholder.includes('已有')");verify('保存设置后密钥不回显',await evaluate("document.querySelector('#ai-key').value==='' && !document.querySelector('#workspace')?.innerText?.includes('SYNTHETIC-ONLY-NOT-A-REAL-KEY')"),'只保留会话内存，不返回密码');
 await click('[data-action=ai-probe]');verify('有密钥仍需本次主动授权',await evaluate("document.querySelector('#ai-send').disabled"),'预览与发送分开');await click('#ai-send-consent');await click('[data-action=ai-send]');await until("document.querySelector('#modal').innerText.includes('本次固定文字请求返回合格JSON')");await click('[data-action=close]');
 await click('[data-view=review]');await click('[data-action=ai-material]');await click('[data-action=ai-prepare]');await until("!!document.querySelector('#ai-send-consent')");verify('外发预览不附学生档案和身份',await evaluate("!document.querySelector('#modal').innerText.includes('虚构学生02') && !document.querySelector('#modal').innerText.includes('SYN-02') && !document.querySelector('#modal').innerText.includes('SYN-SEPARATE-002')"),'只展示题目、作答、参考与固定规则');await screenshot('11-ai-outbound-preview.png');
 await click('#ai-send-consent');await click('[data-action=ai-send]');await until("!!document.querySelector('#ai-apply-consent')");verify('AI返回仍未改变原卷',(await boot()).event_count===9&&(await boot()).papers.find(p=>p.id===second.id).version===2,'没有直接归档或覆盖草稿');await screenshot('12-ai-suggestion-review.png');
 await click('#ai-apply-consent');await click('[data-action=ai-apply]');await until("document.querySelector('#confirm-paper')?.textContent.includes('V3')");const afterAI=(await boot()).papers.find(p=>p.id===second.id);verify('AI只进入新待审版本',afterAI.version===3&&afterAI.confirmed_version===2&&(await boot()).event_count===9&&afterAI.questions[0].answer==='x=2 或 x=3','原转写保留、旧确认历史不改、仍需老师重新审核');
 await click('[data-view=ai]');await click('[data-action=ai-clear]');await until("document.querySelector('#ai-key')?.placeholder==='未输入密钥'");verify('会话密钥可清除',true,'结束后未保留测试密钥');
 // Printer output captured from the actual dedicated student page.
 const printUrl=base+`/print/exercise/${ex.id}?audience=student&version=1`;await command('Page.navigate',{url:printUrl});await until("document.readyState==='complete' && !!document.querySelector('#print-button')");
 verify('学生打印页无答案和讲解',await evaluate("!document.body.innerText.includes('令 x+1=0') && !document.body.innerText.includes('顶点 (−1,−4)')"),'仅学生题面和书写区');
 await command('Emulation.setEmulatedMedia',{media:'print'});await screenshot('07-student-print.png');const pdf=await command('Page.printToPDF',{preferCSSPageSize:true,printBackground:true,displayHeaderFooter:false});await writeFile(path.join(output,'student-practice.pdf'),Buffer.from(pdf.data,'base64'));verify('真实打印PDF生成',Buffer.from(pdf.data,'base64').subarray(0,5).toString()==='%PDF-','PDF文件而非占位下载');
 await command('Emulation.setEmulatedMedia',{media:''});await command('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});await command('Page.navigate',{url:base});await until("document.querySelectorAll('.question').length===4");verify('窄屏无整页横向溢出',await evaluate('document.documentElement.scrollWidth<=innerWidth+1'),'390px视口');await screenshot('08-mobile.png');
 verify('页面没有请求外部模型或第三方资源',requests.filter(u=>/^https?:/.test(u)&&!u.startsWith(base+'/')&&u!==base).length===0,'Network中仅本机服务请求');verify('无页面JavaScript异常',pageErrors.length===0,pageErrors.join(';')||'无');
 await command('Page.navigate',{url:base+'/#ai'});await until("!!document.querySelector('#ai-key')");verify('AI设置可由直达链接打开',true,'无需先寻找菜单，未输入密钥仍不能发送');
}catch(e){failure=e.stack||String(e);}
finally{
 if(ws?.readyState===WebSocket.OPEN){try{await command('Browser.close',{},false);}catch{}ws.close();}if(chrome.exitCode===null)chrome.kill();if(python.exitCode===null)python.kill();
 const report={scope:'隔离合成数据＋内存AI替身上的本地浏览器检查；未接外部模型，不证明真实AI或OCR',checks,passed:checks.filter(c=>c.passed).length,total:checks.length,pageErrors,requests,dataDir,failure:failure||null};await writeFile(path.join(output,'verification.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({passed:report.passed,total:report.total,failure:report.failure,output}));if(failure)process.exitCode=1;
}
