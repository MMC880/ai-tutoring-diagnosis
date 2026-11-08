// Batch intake: synthetic isolated rows only; no external model requests.
import {spawn} from 'node:child_process';
import {mkdtemp,readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {revealViewControl} from './teacher-browser-navigation.mjs';
const project=path.resolve(import.meta.dirname,'../..');
const output=path.join(project,'docs/design/review-flow-browser');await mkdir(output,{recursive:true});
const tempBase=path.join(project,'app/.qa-temp');await mkdir(tempBase,{recursive:true});
const run=await mkdtemp(path.join(tempBase,'review-flow-browser-'));
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
 ws.onmessage=ev=>{const m=JSON.parse(ev.data);if(m.id){const p=pending.get(m.id);pending.delete(m.id);if(p)m.error?p.reject(Error(m.error.message)):p.resolve(m.result);}if(m.method==='Network.requestWillBeSent')requests.push(m.params.request.url);if(m.method==='Runtime.exceptionThrown')pageErrors.push(m.params.exceptionDetails.text);};
 const target=await command('Target.createTarget',{url:'about:blank'},false);
 session=(await command('Target.attachToTarget',{targetId:target.targetId,flatten:true},false)).sessionId;
 await command('Runtime.enable');await command('Network.enable',{maxPostDataSize:1024});
 await command('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
 await command('Page.navigate',{url:base});await until("typeof data!=='undefined'&&data&&document.querySelector('[data-action=seed]')");


 await evaluate(`(async()=>{const q=[{id:'Q01',stem:'合成同卷题',answer:'1',correct_answer:'2',knowledge:'方程',cause:'待核实',result:'INCORRECT'}];const make=(ref,batch='SYN-REVIEW')=>api('papers',{student_ref:ref,student_name:'合成'+ref,title:'连续审核样例',batch_id:batch,questions:q});const a=await make('SYN-F01'),b=await make('SYN-F02'),c=await make('SYN-F03'),e=await make('SYN-F04'),d=await make('SYN-OTHER','SYN-OTHER');const cq=structuredClone(q);cq[0].result='MISSING';await api('papers/'+c.id+'/draft',{version:1,questions:cq});await api('papers/'+c.id+'/confirm',{version:2,consent:true});window.flowFixture={a:a.id,b:b.id,c:c.id,e:e.id,d:d.id};await load();paperId=a.id;view='review';await render()})()`);
 verify('整卷页有同批连续审核入口',await evaluate("!!document.querySelector('#review-flow')&&!!document.querySelector('[data-action=review-flow-next]')"));
 await until("document.querySelector('[data-review-flow=received]')?.textContent==='4'");
 verify('本批进度分开显示确认和待审',await evaluate("document.querySelector('[data-review-flow=confirmed]').textContent==='1'&&document.querySelector('[data-review-flow=waiting]').textContent==='3'&&document.querySelector('#review-flow').textContent.includes('应收人数未知')"));
 const before=(await (await fetch(base+'/api/bootstrap')).json()).event_count;
 await click('[data-action=review-flow-next]');await until("paperId===flowFixture.b&&document.querySelector('[data-action=review-flow-next]')");
 verify('当前未确认时仍可手动切到下一份且不自动确认',await evaluate("(async()=>{const p=await api('papers/'+flowFixture.a);return p.confirmed_version===0&&(await api('bootstrap')).event_count==="+before+"})()"));
 await click('#confirm-consent');await click('#confirm-paper');await until("paperId===flowFixture.b&&paper().confirmed_version===paper().version");
 verify('确认后留在当前学生',await evaluate("paperId===flowFixture.b"));
 await click('[data-action=review-flow-next]');await until("paperId===flowFixture.e");verify('跳过本版已确认的缺材料卷',await evaluate("paperId!==flowFixture.c&&paper().batch_id==='SYN-REVIEW'"));
 await click('[data-action=review-flow-next]');await until("paperId===flowFixture.a");verify('末尾循环回本批待审卷',await evaluate("paperId===flowFixture.a"));
 await fill('[data-field=answer]','合成未保存编辑');await evaluate("window.oldFlowConfirm=confirm;window.confirm=()=>false");await click('[data-action=review-flow-next]');
 verify('拒绝离开保留未保存编辑',await evaluate("paperId===flowFixture.a&&dirty&&document.querySelector('[data-field=answer]').value==='合成未保存编辑'"));
 await evaluate("window.confirm=()=>true");await click('[data-action=review-flow-next]');await until("paperId===flowFixture.e");
 verify('同意离开不会偷偷保存上一卷',await evaluate("(async()=>{const p=await api('papers/'+flowFixture.a);return p.questions[0].answer==='1'&&p.confirmed_version===0})()"));await evaluate("window.confirm=oldFlowConfirm");
 await evaluate("window.flowRealApi=api;window.releaseFlowTarget=null;api=(r,p)=>r==='papers/'+flowFixture.a&&p===undefined?new Promise(resolve=>window.releaseFlowTarget=async()=>resolve(await flowRealApi(r,p))):flowRealApi(r,p)");await click('[data-action=review-flow-next]');await until("typeof releaseFlowTarget==='function'");
 await evaluate("(async()=>{await flowRealApi('papers/'+flowFixture.a+'/confirm',{version:1,consent:true});await releaseFlowTarget()})()");await delay(200);
 verify('目标在读取期间被确认不临时换人',await evaluate("paperId===flowFixture.e&&document.querySelector('#review-flow').textContent.includes('已更新')"));await evaluate("api=flowRealApi");await click('[data-action=review-flow-refresh]');
 await until("document.querySelector('[data-action=review-flow-next]').disabled");verify('只有当前待审不能叫全部完成',await evaluate("document.querySelector('#review-flow').textContent.includes('当前卷仍待审')&&!document.querySelector('#review-flow').textContent.includes('全部完成')"));
 await click('#confirm-consent');await click('#confirm-paper');await until("paper().confirmed_version===paper().version&&document.querySelector('[data-review-flow=waiting]')?.textContent==='0'");
 verify('本版全确认仍提醒材料核对',await evaluate("document.querySelector('#review-flow').textContent.includes('材料')&&document.querySelector('[data-action=review-flow-next]').disabled"));
 await capture('01-review-flow-desktop.png');
 await evaluate("(async()=>{const p=await api('papers/'+flowFixture.a),q=structuredClone(p.questions);q[0].answer='合成修订';await api('papers/'+p.id+'/draft',{version:p.version,questions:q});await load();paperId=flowFixture.b;await render()})()");await until("!document.querySelector('[data-action=review-flow-next]').disabled");
 await evaluate("window.flowRealApi=api;window.releaseFlowList=null;api=(r,p)=>r==='intake'&&!window.releaseFlowList?new Promise(resolve=>window.releaseFlowList=async()=>resolve(await flowRealApi(r,p))):flowRealApi(r,p)");await click('[data-action=review-flow-next]');await until("typeof releaseFlowList==='function'");await click('[data-view=profile]');await evaluate("releaseFlowList()");await delay(150);
 verify('切页后的迟到导航不带回旧学生',await evaluate("view==='profile'&&paperId===flowFixture.b"));await evaluate("api=flowRealApi");await click('[data-view=review]');await until("!document.querySelector('[data-action=review-flow-next]').disabled");
 await evaluate("window.flowRealApi=api;window.releaseFlowList=null;api=(r,p)=>r==='intake'&&!window.releaseFlowList?new Promise(resolve=>window.releaseFlowList=async()=>resolve(await flowRealApi(r,p))):flowRealApi(r,p)");await click('[data-action=review-flow-next]');await until("typeof releaseFlowList==='function'");await fill('[data-field=answer]','请求期间的新编辑');await evaluate("releaseFlowList()");await delay(150);
 verify('请求期间新编辑不被迟到导航覆盖',await evaluate("paperId===flowFixture.b&&dirty&&document.querySelector('[data-field=answer]').value==='请求期间的新编辑'"));await until("!document.querySelector('[data-action=review-flow-next]').disabled&&document.querySelector('#review-flow').textContent.includes('本次切换已取消')");verify('编辑取消后说明原因并恢复候选',await evaluate("document.querySelector('#review-flow').textContent.includes('内容保留')"));await evaluate("api=flowRealApi;dirty=false");await click('[data-view=review]');await until("!document.querySelector('[data-action=review-flow-next]').disabled");

 if(process.env.JINXUE_REVIEW_TARGET_RED!=='1'){
 await evaluate("window.flowRealApi=api;window.releaseFlowList=null;api=(r,p)=>r==='intake'&&!window.releaseFlowList?new Promise(resolve=>window.releaseFlowList=async()=>resolve(await flowRealApi(r,p))):flowRealApi(r,p)");await click('[data-action=review-flow-next]');await until("typeof releaseFlowList==='function'");await click('[data-action=add-question]');await click('[data-action=add-question]');
 verify('请求期间新增题目复现场景成立',await evaluate("document.querySelectorAll('#questions .question').length===2&&dirty"));
 await evaluate("releaseFlowList()");await delay(200);verify('非输入事件新增题目不被迟到导航丢弃',await evaluate("paperId===flowFixture.b&&document.querySelectorAll('#questions .question').length===2&&dirty"));
 await evaluate("api=flowRealApi;dirty=false");await click('[data-view=review]');await until("!document.querySelector('[data-action=review-flow-next]').disabled");
 }

 await evaluate("window.flowRealApi=api;window.releaseFlowList=null;api=(r,p)=>r==='intake'&&!releaseFlowList?new Promise(resolve=>window.releaseFlowList=async()=>resolve(await flowRealApi(r,p))):flowRealApi(r,p)");await click('[data-action=review-flow-next]');await until("typeof releaseFlowList==='function'");await evaluate("materialsOpen();releaseFlowList()");await delay(200);
 verify('请求期间打开材料窗口不会切换其学生',await evaluate("paperId===flowFixture.b&&document.querySelector('#modal').open&&materialsEditor.paperId===flowFixture.b"));await click('[data-action=close]');await evaluate("api=flowRealApi");await click('[data-action=review-flow-refresh]');await until("!document.querySelector('[data-action=review-flow-next]').disabled");

 await evaluate("window.flowRealApi=api;window.releaseFlowList=null;api=(r,p)=>r==='intake'&&!releaseFlowList?new Promise(resolve=>window.releaseFlowList=async()=>resolve(await flowRealApi(r,p))):flowRealApi(r,p)");await click('[data-action=review-flow-next]');await until("typeof releaseFlowList==='function'");await evaluate("materialsOpen();close();releaseFlowList()");await delay(200);
 verify('请求期间窗口打开又关闭也取消旧导航',await evaluate("paperId===flowFixture.b&&document.querySelector('#review-flow').textContent.includes('本次切换已取消')"));await evaluate("api=flowRealApi");await click('[data-action=review-flow-refresh]');await until("!document.querySelector('[data-action=review-flow-next]').disabled");
 await evaluate("window.flowRealApi=api;api=(r,p)=>r==='intake'?Promise.reject(Error('合成清单读取失败')):flowRealApi(r,p)");await click('[data-action=review-flow-next]');await until("document.querySelector('#review-flow').textContent.includes('合成清单读取失败')");
 verify('清单失败不继续启用旧目标',await evaluate("paperId===flowFixture.b&&document.querySelector('[data-action=review-flow-next]').disabled"));await evaluate("api=flowRealApi");await click('[data-action=review-flow-refresh]');await until("!document.querySelector('[data-action=review-flow-next]').disabled");
 verify('刷新后恢复本批候选',await evaluate("document.querySelector('#review-flow').textContent.includes('SYN-F01')"));

 await evaluate("(async()=>{const p=await api('papers/'+flowFixture.b),q=structuredClone(p.questions);q[0].answer='合成其他窗口修改';await api('papers/'+p.id+'/draft',{version:p.version,questions:q})})()");await click('[data-action=review-flow-next]');await until("document.querySelector('#review-flow').textContent.includes('当前卷已更新')");
 verify('当前来源被其他窗口修改时停止导航',await evaluate("paperId===flowFixture.b&&document.querySelector('[data-action=review-flow-next]').disabled"));
 await click('[data-action=review-flow-reload]');await until("paper().version===2&&document.querySelector('[data-review-flow=waiting]')");verify('明确重新读取能加载当前卷新版本',await evaluate("paperId===flowFixture.b&&document.querySelector('[data-field=answer]').value==='合成其他窗口修改'&&paper().confirmed_version===1"));

 await evaluate("(async()=>{const q=structuredClone(paper().questions);await api('papers',{student_ref:'SYN-F05',student_name:'合成F05',batch_id:'SYN-REVIEW',title:'新增候选',questions:q})})()");await click('[data-action=review-flow-refresh]');await until("document.querySelector('#review-flow').textContent.includes('SYN-F05')");
 await evaluate("(async()=>{const r=await api('intake'),b=r.batches.find(x=>x.batch_id==='SYN-REVIEW'),p=b.papers.find(x=>x.student_ref==='SYN-F05');await api('papers/'+p.id+'/confirm',{version:p.version,consent:true})})()");await click('[data-action=review-flow-next]');await delay(150);
 verify('点击前显示候选已确认时不改跳其他学生',await evaluate("paperId===flowFixture.b&&document.querySelector('#review-flow').textContent.includes('目标卷已更新')"));
 await fill('#paper-select',await evaluate('flowFixture.d'));await until("paperId===flowFixture.d&&document.querySelector('[data-review-flow=received]')?.textContent==='1'");
 verify('不跨批次寻找待审学生',await evaluate("document.querySelector('[data-action=review-flow-next]').disabled&&document.querySelector('#review-flow').textContent.includes('SYN-OTHER')"));
 await command('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});await evaluate("document.querySelector('#review-flow').scrollIntoView({block:'start'})");await capture('02-review-flow-mobile.png');verify('窄屏进度与按钮无横向溢出',await evaluate("document.documentElement.scrollWidth<=innerWidth"));
 verify('连续导航不发送AI且无页面异常',requests.every(u=>!u.endsWith('/prepare')&&!u.endsWith('/send'))&&pageErrors.length===0);
} catch(e){failure=e.stack||String(e);} finally {
 if(ws){try{await command('Browser.close',{},false);}catch{}ws.close();}chrome.kill();service.kill();
 const report={scope:'隔离合成同批连续审核，非真实教师批改或省时验收',checks,passed:checks.filter(c=>c.passed).length,total:checks.length,pageErrors,failure:failure||null};
 await writeFile(path.join(output,process.env.JINXUE_REVIEW_FLOW_RED==='1'?'red.json':'verification.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({passed:report.passed,total:report.total,failure:report.failure,output}));if(failure)process.exitCode=1;
}
