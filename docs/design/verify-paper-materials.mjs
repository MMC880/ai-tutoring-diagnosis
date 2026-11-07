// Batch intake: synthetic isolated rows only; no external model requests.
import {spawn} from 'node:child_process';
import {mkdtemp,readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
const project=String.raw`E:\GPT\AI-Tutoring-Diagnosis`;
const output=path.join(project,'docs/design/paper-materials-browser');await mkdir(output,{recursive:true});
const tempBase=path.join(project,'app/.qa-temp');await mkdir(tempBase,{recursive:true});
const run=await mkdtemp(path.join(tempBase,'materials-browser-'));
const dataDir=path.join(run,'data'),profile=path.join(run,'chrome');
const service=spawn('python',[path.join(project,'app/tests/browser_fixture_server.py'),'--data-dir',dataDir,'--port','0'],{windowsHide:true,stdio:['ignore','pipe','pipe']});
let serviceLog='';service.stdout.on('data',b=>serviceLog+=b);service.stderr.on('data',b=>serviceLog+=b);
const chrome=spawn(String.raw`C:\Program Files\Google\Chrome\Application\chrome.exe`,['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check','--disable-background-networking','--disable-sync','--disable-extensions','--remote-debugging-port=0',`--user-data-dir=${profile}`,'about:blank'],{windowsHide:true,stdio:'ignore'});
const delay=ms=>new Promise(r=>setTimeout(r,ms));
const pending=new Map();let seq=0,ws,session,base,failure;
const checks=[],requests=[],pageErrors=[];
function verify(name,ok,detail=''){checks.push({name,passed:!!ok,detail});if(!ok)throw Error(name+': '+detail);}
async function command(method,params={},useSession=true){const id=++seq;return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{pending.delete(id);reject(Error('CDP timeout '+method));},15000);pending.set(id,{resolve:v=>{clearTimeout(timer);resolve(v);},reject:e=>{clearTimeout(timer);reject(e);}});ws.send(JSON.stringify({id,method,params,...(useSession&&session?{sessionId:session}:{})}));});}
async function evaluate(expression){let r;try{r=await command('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true,userGesture:true});}catch(e){throw Error(e.message+' expression='+expression.slice(0,160));}if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;}
async function until(expr){for(let i=0;i<80;i++){if(await evaluate(expr))return;await delay(80);}throw Error('wait failed '+expr);}
async function click(selector){await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e||e.disabled)throw Error('Missing/disabled '+${JSON.stringify(selector)});e.click()})()`);await delay(160);}
async function fill(selector,value){await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});e.value=${JSON.stringify(value)};e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));})()`);}
async function capture(name){const r=await command('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});await writeFile(path.join(output,name),Buffer.from(r.data,'base64'));}
try{
 for(let i=0;i<80;i++){try{base=JSON.parse(await readFile(path.join(dataDir,'server.json'),'utf8')).url;break;}catch{if(service.exitCode!==null)throw Error(serviceLog);await delay(100);}}
 if(!base)throw Error('fixture not ready '+serviceLog);
 let active;for(let i=0;i<80;i++){try{active=(await readFile(path.join(profile,'DevToolsActivePort'),'utf8')).trim().split(/\r?\n/);break;}catch{await delay(100);}}
 if(!active)throw Error('Chrome not ready');
 ws=new WebSocket('ws://127.0.0.1:'+active[0]+active[1]);await new Promise((resolve,reject)=>{ws.addEventListener('open',resolve,{once:true});ws.addEventListener('error',reject,{once:true});});
 ws.onmessage=ev=>{const m=JSON.parse(ev.data);if(m.id){const p=pending.get(m.id);pending.delete(m.id);if(p)m.error?p.reject(Error(m.error.message)):p.resolve(m.result);}if(m.method==='Network.requestWillBeSent')requests.push(m.params.request.url);if(m.method==='Runtime.exceptionThrown')pageErrors.push(m.params.exceptionDetails.text);if(m.method==='Page.javascriptDialogOpening'){pageErrors.push('UNEXPECTED_DIALOG:'+m.params.type+':'+m.params.message);command('Page.handleJavaScriptDialog',{accept:false}).catch(()=>{});}};
 const target=await command('Target.createTarget',{url:'about:blank'},false);
 session=(await command('Target.attachToTarget',{targetId:target.targetId,flatten:true},false)).sessionId;
 await command('Page.enable');await command('Runtime.enable');await command('Network.enable',{maxPostDataSize:1024});
 await command('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
 await command('Page.navigate',{url:base});await until("typeof data!=='undefined'&&data&&document.querySelector('[data-action=seed]')");


 await click('[data-action=seed]');await until("document.querySelectorAll('#questions .question').length===4");
 verify('原卷材料整理入口存在',await evaluate("!!document.querySelector('[data-action=materials-open]')"));
 await evaluate(`(async()=>{const p=paper(),qs=structuredClone(p.questions);qs[2].result='MISSING';await api('papers/'+p.id+'/draft',{version:p.version,questions:qs});await load();await api('papers/'+p.id+'/confirm',{version:paper().version,consent:true});await load();await render();window.materialFixture={id:paper().id,student:paper().student_id,version:paper().version,old:paper().documents[0].id,events:data.event_count}})()`);
 await click('[data-action=materials-open]');await until("!!document.querySelector('#materials-editor')");
 verify('编辑器显示学生与来源版本',await evaluate("document.querySelector('#materials-context').textContent.includes(paper().student_ref)&&materialsEditor.version===paper().version"));
 verify('旧原件不能在此入口撤下或改用途',await evaluate("document.querySelectorAll('.material-row').length===1&&!document.querySelector('[data-action=materials-remove]')&&!document.querySelector('[data-material-role]')"));
 await evaluate(`(async()=>{const blob=await (await fetch('/assets/synthetic-homework.png')).blob();const dt=new DataTransfer();dt.items.add(new File([blob],'合成-P2.png',{type:'image/png'}));const input=document.querySelector('#materials-files');input.files=dt.files})()`);
 await click('[data-action=materials-add]');await until("document.querySelectorAll('.material-row').length===2");
 verify('新增文件仅进待保存清单',await evaluate("materialsEditor.rows[1].file instanceof File&&!materialsEditor.rows[1].uploaded&&document.querySelector('#materials-save').disabled"));
 await fill('[data-material-role]','参考答案');await click('#materials-consent');verify('核准目标后允许保存',await evaluate("!document.querySelector('#materials-save').disabled"));
 await click('[data-action=materials-up][data-index="1"]');verify('调整顺序撤销原同意',await evaluate("!document.querySelector('#materials-consent').checked&&document.querySelector('#materials-save').disabled"));
 await click('[data-action=close]');verify('取消清单不改卷面或事件',await evaluate("(async()=>{const p=await api('papers/'+materialFixture.id);return p.version===materialFixture.version&&p.documents.length===1&&(await api('bootstrap')).event_count===materialFixture.events})()"));
 await click('[data-action=materials-open]');await until("!!document.querySelector('#materials-editor')");
 await evaluate(`(async()=>{const blob=await (await fetch('/assets/synthetic-homework.png')).blob();const dt=new DataTransfer();dt.items.add(new File([blob],'合成-P2.png',{type:'image/png'}));document.querySelector('#materials-files').files=dt.files})()`);await click('[data-action=materials-add]');
 await click('[data-action=materials-up][data-index="1"]');await click('#materials-consent');await click('#materials-save');
 await until("!document.querySelector('#modal').open&&paper().version===materialFixture.version+1");
 verify('补交排序成功但当前卷重新待审',await evaluate("paper().documents.length===2&&paper().documents[1].id===materialFixture.old&&paper().confirmed_version===materialFixture.version&&data.event_count===materialFixture.events"));
 verify('补交不自动解除缺材料',await evaluate("paper().questions.find(q=>q.id==='Q03').result==='MISSING'"));
 verify('历史确认仍关联原附件',await evaluate("(async()=>{const p=await api('profiles/'+materialFixture.student);const e=p.events[0];const d=await api('profiles/'+materialFixture.student+'/evidence/'+e.id);return d.documents.length===1&&d.documents[0].id===materialFixture.old})()"));

 await click('[data-action=materials-open]');await until("!!document.querySelector('#materials-editor')");
 await evaluate("window.bootFailureApi=api;window.bootFailureVersion=paper().version;api=(r,p)=>r==='bootstrap'?Promise.reject(Error('合成刷新失败')):bootFailureApi(r,p)");
 await click('[data-action=materials-up][data-index="1"]');await click('#materials-consent');await click('#materials-save');await until("document.querySelector('#materials-error')?.textContent.includes('材料已保存')");
 verify('挂卷成功但刷新失败时不提示重复保存',await evaluate("materialsReloadNeeded&&document.querySelector('#materials-editor').disabled&&document.querySelector('#materials-error').textContent.includes('不要重复保存')"));
 await click('[data-action=close]');await evaluate("api=bootFailureApi");await click('[data-view=intake]');await click('[data-view=review]');await until("!!document.querySelector('[data-action=materials-open]')");
 verify('刷新失败后重新进入页面可同步',await evaluate("!materialsReloadNeeded&&paper().version===bootFailureVersion+1"));
 await evaluate("window.lateSourceVersion=paper().version");
 await click('[data-action=materials-open]');await until("!!document.querySelector('#materials-editor')");await capture('01-materials-desktop.png');
 await evaluate("window.realMaterialsApi=api;window.releaseMaterialsSave=null;api=(route,payload)=>route.endsWith('/documents')?new Promise(resolve=>window.releaseMaterialsSave=async()=>resolve(await realMaterialsApi(route,payload))):realMaterialsApi(route,payload)");
 await click('[data-action=materials-up][data-index="1"]');await click('#materials-consent');await click('#materials-save');await until("typeof releaseMaterialsSave==='function'");
 await click('[data-action=close]');await evaluate("(async()=>{view='intake';await render();releaseMaterialsSave()})()");await delay(300);
 verify('保存回执迟到不带回旧页面',await evaluate("view==='intake'&&!document.querySelector('#modal').open"));await evaluate("(async()=>{api=realMaterialsApi;view='review';await render()})()");
 verify('返回原卷会重新同步已提交版本',await evaluate("paper().version===lateSourceVersion+1&&paper().confirmed_version===materialFixture.version"));
 await click('[data-action=materials-open]');await until("!!document.querySelector('#materials-editor')");
 await evaluate(`(async()=>{const p=await api('papers/'+paperId),qs=structuredClone(p.questions);qs[0].answer+='合成另一窗口';await api('papers/'+p.id+'/draft',{version:p.version,questions:qs})})()`);
 await click('[data-action=materials-up][data-index="1"]');await click('#materials-consent');await click('#materials-save');await until("document.querySelector('#materials-error')?.textContent.includes('已更新')");
 verify('另一窗口更新后拒绝旧材料保存',await evaluate("document.querySelector('#modal').open&&document.querySelector('#materials-error').textContent.includes('已更新')"));
 await command('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});await capture('02-materials-mobile.png');verify('窄屏编辑器无横向溢出',await evaluate("document.querySelector('#modal').scrollWidth<=document.querySelector('#modal').clientWidth&&document.documentElement.scrollWidth<=innerWidth"));

 await click('[data-action=close]');await evaluate("(async()=>{await load();await render()})()");await click('[data-action=materials-open]');
 await evaluate(`(async()=>{const blob=await (await fetch('/assets/synthetic-homework.png')).blob(),dt=new DataTransfer();dt.items.add(new File([blob],'合成-P3.png',{type:'image/png'}));document.querySelector('#materials-files').files=dt.files;window.retryVersion=paper().version;window.retryApi=api;window.failBindOnce=true;api=(r,p)=>r.startsWith('papers/')&&r.endsWith('/documents')&&failBindOnce?(failBindOnce=false,Promise.reject(Error('合成一次挂卷失败'))):retryApi(r,p)})()`);
 const uploadsBefore=requests.filter(u=>u===base+'/api/documents').length;
 await click('[data-action=materials-add]');await click('#materials-consent');await click('#materials-save');await until("document.querySelector('#materials-error')?.textContent.includes('合成一次挂卷失败')");
 verify('挂卷失败保留已上传文件供本窗口复用',await evaluate("materialsEditor.rows.filter(r=>!r.existing).every(r=>!!r.uploaded)&&paper().version===retryVersion"));
 await click('#materials-save');await until("!document.querySelector('#modal').open&&paper().version===retryVersion+1");
 verify('重试挂卷不重复上传',requests.filter(u=>u===base+'/api/documents').length===uploadsBefore+1);await evaluate("api=retryApi");
 await click('[data-action=materials-open]');
 await evaluate(`(async()=>{const blob=await (await fetch('/assets/synthetic-homework.png')).blob(),dt=new DataTransfer();dt.items.add(new File([blob],'合成-P4.png',{type:'image/png'}));document.querySelector('#materials-files').files=dt.files;window.uploadApi=api;window.releaseMaterialUpload=null;window.uploadVersion=paper().version;api=(r,p)=>r==='documents'?new Promise(resolve=>window.releaseMaterialUpload=async()=>resolve(await uploadApi(r,p))):uploadApi(r,p)})()`);
 const bindsBefore=requests.filter(u=>u.includes('/papers/')&&u.endsWith('/documents')).length;
 await click('[data-action=materials-add]');await click('#materials-consent');await click('#materials-save');await until("typeof releaseMaterialUpload==='function'");await click('[data-action=close]');await evaluate("(async()=>{view='intake';await render();releaseMaterialUpload()})()");await delay(250);
 verify('上传期间关闭后不继续自动挂卷',requests.filter(u=>u.includes('/papers/')&&u.endsWith('/documents')).length===bindsBefore&&await evaluate("(async()=>{const p=await uploadApi('papers/'+materialFixture.id);return p.version===uploadVersion&&view==='intake'})()"));await evaluate("api=uploadApi");
 verify('材料操作不发AI且无页面异常',requests.every(u=>!u.endsWith('/prepare')&&!u.endsWith('/send'))&&pageErrors.length===0);
} catch(e){failure=e.stack||String(e);} finally {
 if(ws){try{await command('Browser.close',{},false);}catch{}ws.close();}chrome.kill();service.kill();
 const report={scope:'隔离合成材料补交和排序，非真实教师确认',checks,passed:checks.filter(c=>c.passed).length,total:checks.length,pageErrors,failure:failure||null};
 await writeFile(path.join(output,process.env.JINXUE_MATERIALS_RED==='1'?'red.json':'verification.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({passed:report.passed,total:report.total,failure:report.failure,output}));if(failure)process.exitCode=1;
}
