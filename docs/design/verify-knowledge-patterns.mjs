// Isolated synthetic teacher-led review UI; no external model requests.
import {spawn} from 'node:child_process';
import {mkdtemp,readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
const project=path.resolve(import.meta.dirname,'../..');
const output=path.join(project,'docs/design/knowledge-patterns-browser');await mkdir(output,{recursive:true});
const tempBase=path.join(project,'app/.qa-temp');await mkdir(tempBase,{recursive:true});
const run=await mkdtemp(path.join(tempBase,'patterns-browser-'));
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
async function selectStudent(id){await click('[data-action=archive-select][data-student="'+id+'"]');}
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
 await command('Page.navigate',{url:base});await until("typeof data!=='undefined'&&data&&typeof upload==='function'");
 const syntheticFile=path.join(run,'synthetic-patterns.docx');
 await new Promise((resolve,reject)=>{const child=spawn('python',['-c',"from docx import Document;import sys;d=Document();d.add_paragraph('Synthetic vertex lesson, review required');d.save(sys.argv[1])",syntheticFile],{windowsHide:true,stdio:'ignore'});child.on('error',reject);child.on('exit',code=>code===0?resolve():reject(Error('Synthetic DOCX failed')));});
 const raw=(await readFile(syntheticFile)).toString('base64');
 await evaluate(`(async()=>{
 const file=new File([Uint8Array.from(atob(${JSON.stringify(raw)}),c=>c.charCodeAt(0))],'synthetic-patterns.docx');
 const document=await upload(file,'参考答案');
 let m=await api('teaching/materials',{document_id:document.id,title:'合成知识关联资料',kind:'教案',scope:'初中数学'});
 m=await api('teaching/materials/'+m.id,{version:m.version,entries:[{knowledge:'顶点式符号',locator:'合成第一节',content:'令括号为零，检查坐标。'},{knowledge:'顶点式符号',locator:'合成第二节',content:'同名的另一条目，未认定等价。'}]});
 m=await api('teaching/materials/'+m.id+'/approve',{version:m.version,consent:true});
 const ref=(source,index)=>({material_id:source.id,version:source.version,entry_id:source.entries[index].id});
 let sequence=0;window.createPatternPaper=async function(reference,label,kind='求顶点',student='SYN-PAT-A'){
  const q={id:'Q01',stem:'求抛物线顶点或对称轴',answer:'(-2,3)，x=-2',knowledge:label,question_type:kind,cause:'待核实',result:'INCORRECT'};
  if(reference)q.teaching_ref=reference;
  const p=await api('papers',{student_ref:student,batch_id:'SYN-PAT-'+(++sequence),title:'合成第'+sequence+'次作业',questions:[q]});
  await api('papers/'+p.id+'/confirm',{version:p.version,consent:true});return p;
 };
 const p1=await createPatternPaper(ref(m,0),'顶点式符号');
 m=await api('teaching/materials/'+m.id,{version:m.version,entries:m.entries.map(entry=>({...entry,knowledge:'二次函数顶点与轴'}))});
 m=await api('teaching/materials/'+m.id+'/approve',{version:m.version,consent:true});
 const p2=await createPatternPaper(ref(m,0),'二次函数顶点与轴','求对称轴');
 await createPatternPaper(ref(m,1),'二次函数顶点与轴');
 const legacy=await createPatternPaper(null,'二次函数顶点与轴');
 const other=await createPatternPaper(ref(m,0),'二次函数顶点与轴','求顶点','SYN-PAT-B');
 window.patternFixture={p1:p1.id,p2:p2.id,legacy:legacy.id,other:other.id,sid:p2.student_id,otherSid:other.student_id,ref0:ref(m,0),ref1:ref(m,1)};
 paperId=p2.id;profileStudentId=p2.student_id;view='profile';await refresh();return true;
 })()`);
 verify('同一学生按知识条目归组，改名与不同题型合并',await evaluate("currentProfile.learning_analysis.groups.some(g=>g.basis==='TEACHING_ENTRY'&&g.wrong_count===2&&g.question_types.length===2&&g.knowledge_names.length===2)"));
 verify('同名不同条目和未关联标签保持分开',await evaluate("currentProfile.learning_analysis.groups.length===3&&currentProfile.learning_analysis.groups.filter(g=>g.basis==='TEACHING_ENTRY').length===2&&currentProfile.learning_analysis.groups.filter(g=>g.basis==='LABEL_ONLY').length===1"));
 verify('页面明确区分知识依据与标签线索',await evaluate("document.querySelector('.learning-groups').textContent.includes('按已审核知识条目归组')&&document.querySelector('.learning-groups').textContent.includes('标签线索（待核对关联）')"));
 const linkedId=await evaluate("currentProfile.learning_analysis.groups.find(g=>g.wrong_count===2).id");const card=`.learning-group[data-group="${linkedId}"]`;
 await click(card+' summary');
 verify('展开记录保留当次名称、题型与固定资料版本',await evaluate(`(()=>{const el=document.querySelector(${JSON.stringify(card)});return el.innerText.includes('顶点式符号')&&el.innerText.includes('求对称轴')&&el.innerText.includes('资料V2')&&el.innerText.includes('资料V3')})()`));
 verify('时间是确认时间，不编造实际作业日期',await evaluate(`document.querySelector(${JSON.stringify(card)}).innerText.includes('确认时间')&&document.querySelector(${JSON.stringify(card)}).innerText.includes('不等于实际作业日期')`));
 await evaluate(`document.querySelector(${JSON.stringify(card)}).scrollIntoView({block:'start'})`);
 await capture('01-knowledge-patterns-desktop.png');
 await click(card+' [data-action=archive-open]');await until("!!document.querySelector('.archive-evidence')");
 verify('可从聚合证据回看固定版本教学原件',await evaluate("!!document.querySelector('.archive-evidence .teaching-reference')&&document.querySelector('.archive-evidence').textContent.includes('合成知识关联资料')"));await click('[data-action=close]');
 await click(card+' [data-action=learning-practice]');await until("!!document.querySelector('#source-question')");
 verify('补练仍准确定位该组的最近原题',await evaluate("paperId===patternFixture.p2&&document.querySelector('#source-question').value==='Q01'&&data.exercises.length===0"));
 await click('[data-view=profile]');await until("!!document.querySelector('[data-action=archive-select]')");
 await selectStudent(await evaluate('patternFixture.otherSid'));await until("currentProfile?.student.id===patternFixture.otherSid");
 verify('同条目用于另一学生时不混入前一学生',await evaluate("currentProfile.learning_analysis.groups.length===1&&currentProfile.learning_analysis.groups[0].wrong_count===1"));
 await selectStudent(await evaluate('patternFixture.sid'));await until("currentProfile?.student.id===patternFixture.sid");
 await evaluate("(async()=>{const p=await api('papers/'+patternFixture.legacy);p.questions[0].teaching_ref=patternFixture.ref0;await api('papers/'+p.id+'/draft',{version:p.version,questions:p.questions});await refresh();})()");
 verify('老师修改关联草稿不提前改变已确认分组',await evaluate("currentProfile.learning_analysis.groups.length===3&&currentProfile.learning_analysis.groups.some(g=>g.basis==='LABEL_ONLY')"));
 await evaluate("(async()=>{const p=await api('papers/'+patternFixture.legacy);await api('papers/'+p.id+'/confirm',{version:p.version,consent:true});await refresh();})()");
 verify('重新确认后才合并，并保留全部历史',await evaluate("currentProfile.learning_analysis.groups.length===2&&currentProfile.learning_analysis.groups.some(g=>g.wrong_count===3)&&currentProfile.events.length===5"));
 await command('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
 await evaluate("(()=>{const card=document.querySelector('.learning-group');card.querySelector('details').open=true;card.scrollIntoView({block:'start'});})()");
 await capture('02-knowledge-patterns-mobile.png');
 verify('窄屏知识证据无横向溢出',await evaluate("document.documentElement.scrollWidth<=innerWidth+1"));
 verify('没有外部AI请求或页面异常',requests.every(u=>u.startsWith(base)||u==='about:blank')&&requests.every(u=>!u.endsWith('/send')&&!u.endsWith('/prepare'))&&pageErrors.length===0,JSON.stringify(pageErrors));
}catch(e){failure=e.stack||String(e);}
finally{
 if(ws?.readyState===WebSocket.OPEN){try{await command('Browser.close',{},false);}catch{}ws.close();}
 if(chrome.exitCode===null)chrome.kill();if(service.exitCode===null)service.kill();
 const report={scope:'隔离合成跨次知识关联；非真实学生诊断和教师业务验收',checks,passed:checks.filter(c=>c.passed).length,total:checks.length,pageErrors,failure:failure||null,dataDir};
 const name=process.env.JINXUE_TEACHING_RED==='1'?'red.json':'verification.json';await writeFile(path.join(output,name),JSON.stringify(report,null,2));console.log(JSON.stringify({passed:report.passed,total:report.total,failure:report.failure,output}));if(failure)process.exitCode=1;
}
