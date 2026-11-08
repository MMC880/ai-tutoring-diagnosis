// Teacher profile report: synthetic isolated rows only; no external model requests.
import {spawn} from 'node:child_process';
import {mkdtemp,readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
const project=path.resolve(import.meta.dirname,'../..');
const output=path.join(project,'docs/design/profile-report-browser');await mkdir(output,{recursive:true});
const tempBase=path.join(project,'app/.qa-temp');await mkdir(tempBase,{recursive:true});
const run=await mkdtemp(path.join(tempBase,'profile-report-browser-'));
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
 ws.onmessage=ev=>{const m=JSON.parse(ev.data);if(m.id){const p=pending.get(m.id);pending.delete(m.id);if(p)m.error?p.reject(Error(m.error.message)):p.resolve(m.result);}if(m.method==='Network.requestWillBeSent')requests.push({url:m.params.request.url,method:m.params.request.method});if(m.method==='Runtime.exceptionThrown')pageErrors.push(m.params.exceptionDetails.text);};
 const target=await command('Target.createTarget',{url:'about:blank'},false);
 session=(await command('Target.attachToTarget',{targetId:target.targetId,flatten:true},false)).sessionId;




 await command('Emulation.setDeviceMetricsOverride',{width:1440,height:1080,deviceScaleFactor:1,mobile:false});
 await command('Runtime.enable');await command('Network.enable',{maxPostDataSize:1024});
 await command('Page.navigate',{url:base});await until("typeof data!=='undefined'&&!!data&&document.querySelector('#app .shell')");
 await evaluate(`(async()=>{
  const create=async ref=>{const p=await api('papers',{student_ref:ref,student_name:ref==='SYN-A'?'合成<img src=x onerror=alert(1)>':'合成乙生',batch_id:'SYN-REPORT',title:'合成数学卷',questions:[{id:'Q01',stem:'求 y=(x+1)²−4 的顶点',answer:'原错误',result:'INCORRECT',knowledge:'顶点式',cause:'待核实'}]});await api('papers/'+p.id+'/confirm',{version:1,consent:true});return p;};
  const a=await create('SYN-A'),b=await create('SYN-B');
  const e=await api('exercises',{paper_id:a.id,question_id:'Q01',level:'基础巩固',stem:'合成基础练习',answer:'2',explanation:'教师讲解'});await api('exercises/'+e.id+'/approve',{version:1,consent:true});
  await api('retests',{exercise_id:e.id,version:1,result:'CORRECT',condition:'独立完成',answer:'合成作答',consent:true,request_id:crypto.randomUUID()});
  await api('exercises/'+e.id+'/update',{version:1,level:'基础巩固',stem:'未测新版',answer:'3',explanation:'新版讲解'});await api('exercises/'+e.id+'/approve',{version:2,consent:true});
  globalThis.reportFixture={a,b,e};await load();paperId=a.id;profileStudentId=a.student_id;view='profile';await render();
 })()`);
 verify('档案有个人学情报告入口',await evaluate("!!document.querySelector('[data-action=report-preview]')"));
 const writesBefore=requests.filter(r=>r.method==='POST').length;
 await click('[data-action=report-preview]');await until("!!document.querySelector('.profile-report-preview')");
 verify('只读预览保留当前和历史版本差异',await evaluate("(()=>{const t=document.querySelector('.profile-report-preview').textContent;return t.includes('当前版本V2：等待复测')&&t.includes('历史复测V1')&&document.querySelector('#profile-report').textContent.includes('教师核对稿')&&!t.includes('合成乙生')})()"),await evaluate("document.querySelector('.profile-report-preview').textContent"));
 verify('预览姓名转义',await evaluate("document.querySelector('.profile-report-preview').textContent.includes('<img src=x')&&!document.querySelector('.profile-report-preview img')"));
 verify('默认无格式无勾选且禁止导出',await evaluate("!document.querySelector('input[name=report-format]:checked')&&!document.querySelector('#report-consent').checked&&document.querySelector('#report-export').disabled"));
 await click('input[name=report-format][value=docx]');verify('选格式仍需核对勾选',await evaluate("document.querySelector('#report-export').disabled"));
 await click('#report-consent');verify('格式和核对齐备才启用',await evaluate("!document.querySelector('#report-export').disabled"));
 await evaluate("globalThis.reportDownloads=0;globalThis.originalAnchorClick=HTMLAnchorElement.prototype.click;HTMLAnchorElement.prototype.click=function(){reportDownloads++}");
 await click('#report-export');await until("reportDownloads===1");
 verify('Word下载请求成功且关闭预览',await evaluate("!document.querySelector('#modal').open")&&requests.some(r=>r.url.includes('/api/export/profile/')&&r.url.includes('.docx?fingerprint=')));
 await click('[data-action=report-preview]');await until("!!document.querySelector('#report-export')");
 await click('input[name=report-format][value=pdf]');await click('#report-consent');
 await evaluate("globalThis.reportOpened='';globalThis.originalWindowOpen=window.open;window.open=(url)=>{reportOpened=url;return {document:{body:{}},closed:false,location:{replace:(next)=>{reportOpened=next}},close(){this.closed=true}}};");
 await click('#report-export');await until("!!reportOpened");
 verify('打印选择仅打开带快照指纹本地页',await evaluate("reportOpened.startsWith('/print/profile/'+reportFixture.a.student_id+'?fingerprint=')"));
 await evaluate("window.open=originalWindowOpen");
 await click('[data-action=report-preview]');await until("!!document.querySelector('#report-export')");
 await evaluate("(async()=>{const p=await api('papers/'+reportFixture.a.id);p.questions[0].answer='新的未确认草稿';await api('papers/'+p.id+'/draft',{version:p.version,questions:p.questions})})()");
 await click('input[name=report-format][value=docx]');await click('#report-consent');await click('#report-export');
 verify('资料更新拒绝旧版导出且不下载',await evaluate("reportDownloads===1&&document.querySelector('#toast').textContent.includes('已更新')&&document.querySelector('#report-export').disabled"));
 await click('[data-action=close]');
 await evaluate("globalThis.reportOriginalApi=api;api=async function(path,...args){if(path.endsWith('/report'))await new Promise(r=>setTimeout(r,500));return reportOriginalApi(path,...args)}");
 await click('[data-action=report-preview]');await evaluate("(async()=>{await archiveSelect(reportFixture.b.student_id)})()");await delay(650);
 verify('读取期间换学生不弹出旧生报告',await evaluate("document.querySelector('#profile-content').dataset.student===reportFixture.b.student_id&&!document.querySelector('#modal').open"));await evaluate('api=reportOriginalApi');
 await evaluate("api=async function(path,...args){if(path.endsWith('/report'))await new Promise(r=>setTimeout(r,500));return reportOriginalApi(path,...args)}");
 await click('[data-action=report-preview]');await evaluate("modal('<p>新窗口</p>');close()");await delay(650);
 verify('新窗口开关取消迟到报告',await evaluate("!document.querySelector('#modal').open"));await evaluate('api=reportOriginalApi');
 await click('[data-action=report-preview]');await until("!!document.querySelector('#report-export')");await click('input[name=report-format][value=docx]');await click('#report-consent');
 await evaluate("globalThis.reportOriginalFetch=fetch;fetch=async function(url,...args){const result=await reportOriginalFetch(url,...args);if(String(url).startsWith('/api/export/profile/'))await new Promise(r=>setTimeout(r,500));return result}");
 await click('#report-export');await evaluate("close();modal('<p>另一个窗口</p>')");await delay(650);
 verify('下载回调迟到不下载也不关闭新窗口',await evaluate("reportDownloads===1&&document.querySelector('#modal').open&&document.querySelector('#modal').textContent.includes('另一个窗口')"));await evaluate('fetch=reportOriginalFetch;close()');
 await click('[data-action=report-preview]');await until("!!document.querySelector('#report-export')");
 verify('每次重开重置格式和确认',await evaluate("document.querySelector('#report-export').disabled&&!document.querySelector('#report-consent').checked"));

 await click('input[name=report-format][value=pdf]');await click('#report-consent');
 await evaluate("window.open=()=>null");await click('#report-export');
 verify('浏览器阻止打印弹窗时保留预览并说明',await evaluate("document.querySelector('#modal').open&&document.querySelector('#toast').textContent.includes('弹窗')"));await evaluate('window.open=originalWindowOpen');
 await click('[data-action=close]');await click('[data-action=report-preview]');await until("!!document.querySelector('#report-export')");

 await click('input[name=report-format][value=pdf]');await click('#report-consent');
 await evaluate("globalThis.realReportPrintWindow=null;window.open=(...args)=>{realReportPrintWindow=originalWindowOpen(...args);return realReportPrintWindow};api=async function(path,...args){if(path.endsWith('/report'))await new Promise(r=>setTimeout(r,5500));return reportOriginalApi(path,...args)}");
 await click('#report-export');await until("!!realReportPrintWindow&&realReportPrintWindow.location.pathname.startsWith('/print/profile/')");
 verify('慢核对仍真实打开本地打印且无opener',await evaluate("!realReportPrintWindow.closed&&realReportPrintWindow.opener===null&&realReportPrintWindow.document.body.textContent.includes('教师核对稿')"));
 await evaluate('realReportPrintWindow.close();window.open=originalWindowOpen;api=reportOriginalApi');
 await click('[data-action=report-preview]');await until("!!document.querySelector('#report-export')");
 await capture('01-report-desktop.png');
 await command('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});await capture('02-report-mobile.png');
 verify('390px报告无横向溢出',await evaluate("document.documentElement.scrollWidth<=innerWidth&&document.querySelector('#modal').scrollWidth<=document.querySelector('#modal').clientWidth+1"));
 await evaluate('close()');
 verify('预览导出阶段零写入',requests.filter(r=>r.method==='POST').length===writesBefore+1);
 const report=await (await fetch(base+'/api/profiles/'+await evaluate('reportFixture.a.student_id')+'/report')).json();
 const doc=await fetch(base+'/api/export/profile/'+report.student_id+'.docx?fingerprint='+report.fingerprint);verify('合成Word真实输出',doc.ok);await writeFile(path.join(output,'synthetic-report.docx'),Buffer.from(await doc.arrayBuffer()));
 await command('Page.navigate',{url:base+'/print/profile/'+report.student_id+'?fingerprint='+report.fingerprint});await until("document.body?.textContent.includes('教师核对稿')");
 const pdf=await command('Page.printToPDF',{printBackground:true,preferCSSPageSize:true});await writeFile(path.join(output,'synthetic-report.pdf'),Buffer.from(pdf.data,'base64'));await capture('03-report-print.png');
 verify('打印页含确认原答和历史复测不含新草稿',await evaluate("document.body.textContent.includes('原错误')&&document.body.textContent.includes('历史复测V1')&&!document.body.textContent.includes('新的未确认草稿')"));
 verify('无AI请求与页面异常',requests.every(r=>!r.url.endsWith('/prepare')&&!r.url.endsWith('/send'))&&pageErrors.length===0);
} catch(e){failure=e.stack||String(e);} finally {
 if(ws){try{await command('Browser.close',{},false);}catch{}ws.close();}chrome.kill();service.kill();
 const report={scope:'隔离合成个人教师学情报告，非真实教学验收',checks,passed:checks.filter(c=>c.passed).length,total:checks.length,pageErrors,failure:failure||null};
 await writeFile(path.join(output,process.env.JINXUE_REPORT_RED==='1'?'red.json':'verification.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({passed:report.passed,total:report.total,failure:report.failure,output}));if(failure)process.exitCode=1;
}
