// Isolated synthetic teacher-led review UI; no external model requests.
import {spawn} from 'node:child_process';
import {mkdtemp,readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
const project=String.raw`E:\GPT\AI-Tutoring-Diagnosis`;
const output=path.join(project,'docs/design/teaching-library-browser');await mkdir(output,{recursive:true});
const tempBase=path.join(project,'app/.qa-temp');await mkdir(tempBase,{recursive:true});
const run=await mkdtemp(path.join(tempBase,'teaching-browser-'));
const dataDir=path.join(run,'data'),profile=path.join(run,'chrome');
const service=spawn('python',[path.join(project,'app/tests/browser_fixture_server.py'),'--data-dir',dataDir,'--port','0'],{windowsHide:true,stdio:['ignore','pipe','pipe']});
let serviceLog='';service.stdout.on('data',b=>serviceLog+=b);service.stderr.on('data',b=>serviceLog+=b);
const chrome=spawn(String.raw`C:\Program Files\Google\Chrome\Application\chrome.exe`,['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check','--disable-background-networking','--disable-sync','--disable-extensions','--remote-debugging-port=0',`--user-data-dir=${profile}`,'about:blank'],{windowsHide:true,stdio:'ignore'});
const delay=ms=>new Promise(r=>setTimeout(r,ms));
const pending=new Map();let seq=0,ws,session,base,failure;
const checks=[],requests=[],pageErrors=[];
function verify(name,ok,detail=''){checks.push({name,passed:!!ok,detail});if(!ok)throw Error(name+': '+detail);}
async function command(method,params={},useSession=true){const id=++seq;return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{pending.delete(id);reject(Error('CDP timeout '+method));},15000);pending.set(id,{resolve:v=>{clearTimeout(timer);resolve(v);},reject:e=>{clearTimeout(timer);reject(e);}});ws.send(JSON.stringify({id,method,params,...(useSession&&session?{sessionId:session}:{})}));});}
async function evaluate(expression){const r=await command('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true,userGesture:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;}
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
 ws.onmessage=ev=>{const m=JSON.parse(ev.data);if(m.id){const p=pending.get(m.id);pending.delete(m.id);if(p)m.error?p.reject(Error(m.error.message)):p.resolve(m.result);}if(m.method==='Network.requestWillBeSent')requests.push(m.params.request.url);if(m.method==='Runtime.exceptionThrown')pageErrors.push(m.params.exceptionDetails.text);};
 const target=await command('Target.createTarget',{url:'about:blank'},false);
 session=(await command('Target.attachToTarget',{targetId:target.targetId,flatten:true},false)).sessionId;
 await command('Runtime.enable');await command('Network.enable');
 await command('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
 await command('Page.navigate',{url:base});await until("typeof data!=='undefined'&&data&&document.querySelector('[data-action=seed]')");
 await click('[data-action=seed]');await until("document.querySelectorAll('#questions .question').length===4");
 verify('有独立教学资料入口',await evaluate("!!document.querySelector('[data-view=teaching]')"));
 await evaluate("window.teachingFixturePaper=paper().id");
 await click('[data-view=teaching]');await until("!!document.querySelector('[data-action=teaching-import]')");
 verify('没有资料时目录为空而非预填官方知识库',await evaluate("document.querySelectorAll('.teaching-source').length===0"));
 await click('[data-action=teaching-import]');
 const syntheticFile=path.join(run,'synthetic-teaching.docx');
 await new Promise((resolve,reject)=>{const p=spawn('python',['-c',"from docx import Document;import sys;d=Document();d.add_paragraph('Synthetic math teaching: denominator must not equal zero');d.save(sys.argv[1])",syntheticFile],{windowsHide:true,stdio:'ignore'});p.on('exit',code=>code===0?resolve():reject(Error('fixture DOCX failed')));});
 await fill('#teaching-import-title','合成数学教案');await fill('#teaching-import-scope','初中数学·分式');
 const doc=await command('DOM.getDocument');const fileNode=await command('DOM.querySelector',{nodeId:doc.root.nodeId,selector:'#teaching-import-file'});await command('DOM.setFileInputFiles',{nodeId:fileNode.nodeId,files:[syntheticFile]});
 await click('[data-action=teaching-import-save]');await until("!!document.querySelector('#teaching-editor')");
 verify('导入Word只形成待审资料并可看提取文字',await evaluate("teachingState.editor.status==='DRAFT'&&document.querySelector('#teaching-editor').textContent.includes('denominator must not equal zero')"));
 verify('未审核资料不进入可关联目录',await evaluate("(async()=>((await api('teaching/catalog')).length===0))()"));
 await click('[data-action=teaching-add-entry]');
 await fill('.teaching-entry [data-entry-field=knowledge]','分式取值限制');
 await fill('.teaching-entry [data-entry-field=locator]','第一节，第1段');
 await fill('.teaching-entry [data-entry-field=content]','原分母不能为零，化简后限制仍须保留。');
 await click('[data-action=teaching-save]');
 await until("teachingState.editor.entries.length===1&&!dirty");
 await click('#teaching-consent');await fill('#teaching-edition','合成修订说明');
 verify('编辑撤销资料审核同意',await evaluate("!document.querySelector('#teaching-consent').checked&&document.querySelector('[data-action=teaching-approve]').disabled"));
 await click('[data-action=teaching-save]');await click('#teaching-consent');await click('[data-action=teaching-approve]');
 await until("teachingState.editor.status==='APPROVED'");
 verify('资料显式审核后才有目录条目',await evaluate("(async()=>{const c=await api('teaching/catalog');return c.length===1&&c[0].locator==='第一节，第1段'})()"));
 await evaluate("window.approvedTeachingRef={material_id:teachingState.editor.id,version:teachingState.editor.version,entry_id:teachingState.editor.entries[0].id};window.materialId=teachingState.editor.id");
 await fill('.teaching-entry [data-entry-field=content]','提交时的草稿内容');
 await evaluate("window.originalTeachingApi=api;api=async function(path,payload){if(path==='teaching/materials/'+materialId&&payload)return await new Promise((resolve,reject)=>{window.releaseTeachingSave=()=>originalTeachingApi(path,payload).then(resolve,reject)});return originalTeachingApi(path,payload)}");
 await click('[data-action=teaching-save]');
 await fill('.teaching-entry [data-entry-field=content]','发送后继续编辑，不能被旧响应覆盖');
 await evaluate("releaseTeachingSave();true");await until("!busy");await evaluate("api=originalTeachingApi");
 verify('保存中继续编辑不会丢失新文字',await evaluate("document.querySelector('.teaching-entry [data-entry-field=content]').value==='发送后继续编辑，不能被旧响应覆盖'&&dirty&&!document.querySelector('#teaching-consent').checked"));
 await fill('.teaching-entry [data-entry-field=content]','原分母不能为零，化简后限制仍须保留。');await click('[data-action=teaching-save]');
 await click('[data-view=review]');await until("!!document.querySelector('[data-q=Q01] [data-action=teaching-link]')");
 await click('[data-q=Q01] [data-action=teaching-link]');await until("!!document.querySelector('#teaching-catalog-select')");
 verify('未选择条目不能默认绑定第一个',await evaluate("document.querySelector('[data-action=teaching-bind]').disabled&&document.querySelector('#modal').open&&JSON.parse(document.querySelector('[data-q=Q01] [data-field=teaching_ref]').value)===null&&!dirty"));
 await fill('#teaching-catalog-select','0');await click('[data-action=teaching-bind]');
 verify('知识引用只填本行待审草稿',await evaluate("JSON.parse(document.querySelector('[data-q=Q01] [data-field=teaching_ref]').value).material_id===materialId&&document.querySelector('[data-q=Q01] [data-field=knowledge]').value==='分式取值限制'&&dirty"));
 await click('[data-action=save-paper]');
 verify('保存后能追到已审核资料出处',await evaluate("paper().questions[0].teaching_ref.material_id===materialId&&document.querySelector('[data-q=Q01] .teaching-linked').textContent.includes('第一节，第1段')"));
 verify('没有自动确认学生成绩',await evaluate("data.event_count===0"));
 await click('[data-view=teaching]');await until("!!document.querySelector('#teaching-editor')");
 await fill('.teaching-entry [data-entry-field=content]','新草稿：需老师再次核对');await click('[data-action=teaching-save]');
 verify('资料修订回到待审且旧引用仍指向旧内容',await evaluate("(async()=>{const x=await api('papers/'+teachingFixturePaper+'/teaching-links');return teachingState.editor.status==='DRAFT'&&x.links.Q01.content==='原分母不能为零，化简后限制仍须保留。'&&!x.links.Q01.is_current})()"));
 await capture('01-teaching-library-desktop.png');
 await click('[data-view=review]');await until("document.querySelector('[data-q=Q01] .teaching-linked')?.textContent.includes('历史已审核')");
 await click('[data-q=Q01] [data-action=teaching-show]');await until("!!document.querySelector('.teaching-reference')");
 verify('原题可打开固定版本的教学内容',await evaluate("document.querySelector('.teaching-reference').textContent.includes('原分母不能为零，化简后限制仍须保留。')&&!document.querySelector('.teaching-reference').textContent.includes('新草稿')"));
 await command('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});await capture('02-teaching-reference-mobile.png');
 verify('窄屏教学引用可读无横向溢出',await evaluate("document.querySelector('#modal').scrollWidth<=document.querySelector('#modal').clientWidth+1"));
 verify('没有外部模型调用或页面异常',requests.every(u=>u.startsWith(base)||u==='about:blank')&&requests.every(u=>!u.endsWith('/send')&&!u.endsWith('/prepare'))&&pageErrors.length===0,JSON.stringify(pageErrors));
}catch(e){failure=e.stack||String(e);}
finally{
 if(ws?.readyState===WebSocket.OPEN){try{await command('Browser.close',{},false);}catch{}ws.close();}
 if(chrome.exitCode===null)chrome.kill();if(service.exitCode===null)service.kill();
 const report={scope:'隔离合成Word、本地教学资料和版本引用；非真实教案/公式识读验收',checks,passed:checks.filter(c=>c.passed).length,total:checks.length,pageErrors,failure:failure||null,dataDir};
 const name=process.env.JINXUE_TEACHING_RED==='1'?'red.json':'verification.json';await writeFile(path.join(output,name),JSON.stringify(report,null,2));console.log(JSON.stringify({passed:report.passed,total:report.total,failure:report.failure,output}));if(failure)process.exitCode=1;
}
