// Teacher profile report: synthetic isolated rows only; no external model requests.
import {spawn} from 'node:child_process';
import {mkdtemp,readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {revealViewControl} from './teacher-browser-navigation.mjs';
const project=path.resolve(import.meta.dirname,'../..');
const output=path.join(project,'docs/design/question-navigation-browser');await mkdir(output,{recursive:true});
const tempBase=path.join(project,'app/.qa-temp');await mkdir(tempBase,{recursive:true});
const run=await mkdtemp(path.join(tempBase,'question-navigation-browser-'));
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
async function click(selector){await revealViewControl(selector,{evaluate,click,until});await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e||e.disabled)throw Error('Missing/disabled '+${JSON.stringify(selector)});e.click()})()`);await delay(160);}
async function fill(selector,value){await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});e.value=${JSON.stringify(value)};e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));})()`);}
async function capture(name){const r=await command('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});await writeFile(path.join(output,name),Buffer.from(r.data,'base64'));}
try{
 for(let i=0;i<80;i++){try{base=JSON.parse(await readFile(path.join(dataDir,'server.json'),'utf8')).url;break;}catch{if(service.exitCode!==null)throw Error(serviceLog);await delay(100);}}
 if(!base)throw Error('fixture not ready '+serviceLog);
 let active;for(let i=0;i<80;i++){try{active=(await readFile(path.join(profile,'DevToolsActivePort'),'utf8')).trim().split(/\r?\n/);break;}catch{await delay(100);}}
 if(!active)throw Error('Chrome not ready');
 ws=new WebSocket('ws://127.0.0.1:'+active[0]+active[1]);await new Promise((resolve,reject)=>{ws.addEventListener('open',resolve,{once:true});ws.addEventListener('error',reject,{once:true});});
 ws.onmessage=ev=>{const m=JSON.parse(ev.data);if(m.id){const p=pending.get(m.id);pending.delete(m.id);if(p)m.error?p.reject(Error(m.error.message)):p.resolve(m.result);}if(m.method==='Network.requestWillBeSent')requests.push({url:m.params.request.url,method:m.params.request.method});if(m.method==='Runtime.exceptionThrown')pageErrors.push(m.params.exceptionDetails.text);};
 const target=await command('Target.createTarget',{url:'about:blank'},false);
 session=(await command('Target.attachToTarget',{targetId:target.targetId,flatten:true},false)).sessionId;





 await command('Emulation.setDeviceMetricsOverride',{width:1440,height:1080,deviceScaleFactor:1,mobile:false});
 await command('Runtime.enable');await command('Network.enable',{maxPostDataSize:1024});
 await command('Page.navigate',{url:base});await until("typeof data!=='undefined'&&!!data&&document.querySelector('#app .shell')");
 await evaluate(`(async()=>{
  const qs=[{id:'Q01',stem:'合成正确题',answer:'正确原答',result:'CORRECT'},
   {id:'Q02',stem:'化简分式',answer:'原答二',knowledge:'分式',result:'INCORRECT'},
   {id:'Q03',stem:'合成部分正确',answer:'原答三',result:'PARTIAL',teacher_result:'PARTIAL',teacher_mark:'保留老师原批注'},
   {id:'Q04',stem:'合成未核清题',answer:'疑点原答',result:'PENDING',recognition_notes:'负号不清',recognition_resolved:false},
   {id:'Q05',stem:'合成缺材料题',answer:'',result:'MISSING'},
   {id:'Q06',stem:'合成冲突题',answer:'原答六',result:'INCORRECT',teacher_result:'CORRECT'}];
  const a=await api('papers',{student_ref:'SYN-A',student_name:'合成A',batch_id:'SYN-NAV',title:'合成长卷',questions:qs});
  const b=await api('papers',{student_ref:'SYN-B',student_name:'合成B',batch_id:'SYN-NAV',title:'另一学生卷',questions:[{id:'B01',stem:'乙生专属题',answer:'乙生原答',result:'CORRECT'}]});
  globalThis.navFixture={a,b};await load();paperId=a.id;view='review';await render();
 })()`);
 verify('整卷具有题目筛选和定位入口',await evaluate("!!document.querySelector('#question-nav-filter')&&!!document.querySelector('#question-nav-target')"));
 verify('初始全部六行仍留在编辑器',await evaluate("document.querySelectorAll('#questions .question').length===6&&document.querySelectorAll('#questions .question:not([hidden])').length===6"));
 verify('初次加载就计入全部识读及批改提示',await evaluate("document.querySelector('#question-nav-counts').textContent.includes('有核对提示：2')"));
 const writesBefore=requests.filter(r=>r.method==='POST').length;
 await fill('#question-nav-filter','wrong');
 verify('错题包括部分正确三题不移除其余',await evaluate("document.querySelectorAll('#questions .question:not([hidden])').length===3&&collectQuestions().length===6&&document.querySelector('[data-q=Q03]').hidden===false"));
 await fill('#question-nav-filter','issues');
 verify('识读疑点和未核清分歧均可筛出',await evaluate("document.querySelectorAll('#questions .question:not([hidden])').length===2&&!document.querySelector('[data-q=Q04]').hidden&&!document.querySelector('[data-q=Q06]').hidden"));
 await fill('#question-nav-filter','missing');verify('缺材料独立筛选',await evaluate("document.querySelectorAll('#questions .question:not([hidden])').length===1&&!document.querySelector('[data-q=Q05]').hidden"));
 await fill('#question-nav-filter','all');await fill('#question-nav-query','不存在');
 verify('零匹配明确提示但全卷数据仍在',await evaluate("document.querySelectorAll('#questions .question:not([hidden])').length===0&&collectQuestions().length===6&&document.querySelector('#question-nav-empty').textContent.includes('没有匹配')"));
 await fill('#question-nav-query','Q02 分式');
 verify('多词搜索准确匹配本卷题目',await evaluate("document.querySelectorAll('#questions .question:not([hidden])').length===1&&!document.querySelector('[data-q=Q02]').hidden"));
 await fill('#question-nav-target','Q05');await click('[data-action=questions-locate]');
 verify('定位隐藏题先显示全卷并聚焦正确题',await evaluate("document.querySelectorAll('#questions .question:not([hidden])').length===6&&document.querySelector('#question-nav-query').value===''&&document.activeElement.dataset.q==='Q05'"));
 verify('纯筛选定位零写入且不勾确认',requests.filter(r=>r.method==='POST').length===writesBefore&&await evaluate("!dirty&&!document.querySelector('#confirm-consent').checked"));
 await fill('#question-nav-filter','wrong');await fill('[data-q=Q02] [data-field=answer]','未保存的原答修订');await fill('#question-nav-filter','pending');
 verify('切过滤保留未保存编辑与隐藏题批注',await evaluate("dirty&&collectQuestions().find(q=>q.id==='Q02').answer==='未保存的原答修订'&&collectQuestions().find(q=>q.id==='Q03').teacher_mark==='保留老师原批注'"));
 await click('[data-action=save-paper]');await until('!dirty&&paper().version===2');
 verify('保存仍写全卷并默认重新显示全部',await evaluate("paper().questions.length===6&&paper().questions.find(q=>q.id==='Q02').answer==='未保存的原答修订'&&paper().questions.find(q=>q.id==='Q03').teacher_mark==='保留老师原批注'&&document.querySelector('#question-nav-filter').value==='all'"));
 await fill('#question-nav-filter','pending');await click('#confirm-consent');await click('#confirm-paper');
 verify('隐藏分歧仍阻止整卷确认',await evaluate("data.event_count===0&&document.querySelector('#toast').textContent.includes('Q06')&&document.querySelector('#toast').textContent.includes('分歧')"));
 await fill('#question-nav-filter','wrong');await fill('[data-q=Q02] [data-field=result]','CORRECT');
 verify('编辑结果不突然隐藏当前行并提示刷新',await evaluate("!document.querySelector('[data-q=Q02]').hidden&&document.querySelector('#question-nav-stale').textContent.includes('题目已修改')&&dirty"));
 await click('[data-action=questions-refresh]');
 verify('明确刷新才应用新结果分类',await evaluate("document.querySelector('[data-q=Q02]').hidden&&document.querySelectorAll('#questions .question:not([hidden])').length===2"));
 await click('[data-action=add-question]');await fill('[data-q=Q07] [data-field=stem]','合成新增题');await fill('[data-q=Q07] [data-field=answer]','新增原答');
 verify('添加新题保留编辑行和全卷计数',await evaluate("!document.querySelector('[data-q=Q07]').hidden&&collectQuestions().length===7&&document.querySelector('#question-nav-status').textContent.includes('7')"));
 await click('[data-action=questions-refresh]');await click('[data-action=save-paper]');await until('!dirty&&paper().questions.length===7');
 verify('隐藏新增题同样保存',await evaluate("paper().questions.find(q=>q.id==='Q07').answer==='新增原答'"));
 await fill('#question-nav-filter','wrong');await evaluate("globalThis.oldQuestionNavButton=document.querySelector('[data-action=questions-refresh]')");
 await fill('#paper-select',await evaluate('navFixture.b.id'));await until("paper().id===navFixture.b.id&&!!document.querySelector('[data-q=B01]')");
 verify('切学生重置筛选与题号不串档',await evaluate("document.querySelector('#question-nav-filter').value==='all'&&document.querySelectorAll('#question-nav-target option').length===2&&!document.querySelector('[data-q=B01]').hidden&&collectQuestions()[0].answer==='乙生原答'"));
 verify('旧工具条操作拒绝影响新学生',await evaluate("(()=>{try{questionNavigationHandle('questions-refresh',oldQuestionNavButton);return false}catch{return !document.querySelector('[data-q=B01]').hidden}})()"));
 await fill('#paper-select',await evaluate('navFixture.a.id'));await until("paper().id===navFixture.a.id&&!!document.querySelector('[data-q=Q07]')");await fill('#question-nav-filter','wrong');await evaluate("document.querySelector('#question-navigation').scrollIntoView({block:'start'})");await capture('01-question-navigation-desktop.png');
 await command('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});await evaluate("document.querySelector('#question-navigation').scrollIntoView({block:'start'})");await capture('02-question-navigation-mobile.png');
 verify('390px整卷筛选无横向溢出',await evaluate("document.documentElement.scrollWidth<=innerWidth"));
 verify('无模型请求与页面异常',requests.every(r=>!r.url.endsWith('/prepare')&&!r.url.endsWith('/send'))&&pageErrors.length===0);
} catch(e){failure=e.stack||String(e);} finally {
 if(ws){try{await command('Browser.close',{},false);}catch{}ws.close();}chrome.kill();service.kill();
 const report={scope:'隔离合成整卷筛选/隐藏题保存与确认边界，不是实际教师省时验收',checks,passed:checks.filter(c=>c.passed).length,total:checks.length,pageErrors,failure:failure||null};
 await writeFile(path.join(output,process.env.JINXUE_QUESTION_NAV_RED==='1'?'red.json':'verification.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({passed:report.passed,total:report.total,failure:report.failure,output}));if(failure)process.exitCode=1;
}
