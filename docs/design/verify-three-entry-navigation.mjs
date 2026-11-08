// Isolated synthetic teacher-led review UI; no external model requests.
import {spawn} from 'node:child_process';
import {mkdtemp,readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
const project=path.resolve(import.meta.dirname,'../..');
const output=path.join(project,'app/.qa-temp/three-entry-browser');await mkdir(output,{recursive:true});
const tempBase=path.join(project,'app/.qa-temp');await mkdir(tempBase,{recursive:true});
const run=await mkdtemp(path.join(tempBase,'archive-browser-'));
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
 await command('Page.navigate',{url:base});await until("!!document.querySelector('main')");
 verify('日常主入口仅学生档案、登记作业、班级学情',await evaluate("JSON.stringify([...document.querySelectorAll('[aria-label=主要功能] [data-view]')].map(e=>e.textContent.trim()))===JSON.stringify(['学生档案','登记作业','班级学情'])"));
 verify('默认档案、设置单列且空库可收件',await evaluate("document.querySelector('[aria-label=主要功能] [data-view=profile]').getAttribute('aria-current')==='page'&&!!document.querySelector('[data-view=settings]')&&!!document.querySelector('main [data-action=new]')&&!document.querySelector('.sidebar')"));
 await click('[data-view=settings]');await until("!!document.querySelector('#workspace-settings')");
 verify('设置承接AI、教学资料、备份与试点',await evaluate("['ai','teaching','backup','pilot'].every(v=>document.querySelector('#workspace-settings [data-view='+v+']'))&&!document.querySelector('#paper-select')"));
 await click('#workspace-settings [data-view=ai]');await until("!!document.querySelector('#ai-key')");
 verify('设置子页明确归设置且原发送授权保留',await evaluate("document.querySelector('.settings-nav [data-view=settings]').getAttribute('aria-current')==='page'&&!document.querySelector('.main-nav [aria-current=page]')&&!document.querySelector('#paper-select')&&!!document.querySelector('[data-action=ai-probe]')"));
 await click('[data-action=ai-probe]');await until("!!document.querySelector('#ai-send-consent')");
 verify('导航调整不绕过AI逐次预览和授权',await evaluate("!document.querySelector('#ai-send-consent').checked&&document.querySelector('[data-action=ai-send]').disabled"));await click('[data-action=close]');
 const fixture=await evaluate(`(async()=>{
  const a=await api('seed',{});await api('papers/'+a.id+'/confirm',{version:a.version,consent:true});
  const b=await api('papers',{student_ref:'SYN-NAV-B',student_name:'合成学生B',batch_id:'SYN-NAV-BATCH',title:'B的合成作业',questions:[{id:'Q01',stem:'1+1',answer:'2',correct_answer:'2',result:'CORRECT',knowledge:'整数运算'}]});await api('papers/'+b.id+'/confirm',{version:b.version,consent:true});
  const e=await api('exercises',{paper_id:a.id,question_id:'Q01',level:'基础巩固',stem:'合成待审练习',answer:'待核对',explanation:'合成讲解'});
  return {a:a.id,b:b.id,aStudent:a.student_id,bStudent:b.student_id,e:e.id};
 })()`);
 // Each legacy URL must still render its own page after a full reload, under the right parent.
 for(const [route,parent,selector] of [['review','intake','#questions'],['practice','profile','.practice-grid'],['queue','profile','.queue-workspace'],['intake','intake','.intake-workspace'],['class','class','.stats'],['ai','settings','#ai-key'],['teaching','settings','main .panel'],['backup','settings','main .panel'],['pilot','settings','main .panel']]){
  await command('Page.navigate',{url:base+'/?legacy-check='+route+'#'+route});await until(`!!document.querySelector(${JSON.stringify(['review','practice','class'].includes(route)?'main .empty':selector)})`);
  verify('旧链接 #'+route+' 保留页面及所属入口',await evaluate(`location.hash===${JSON.stringify('#'+route)}&&document.querySelector('.teacher-shell')?.dataset.workspace===${JSON.stringify(parent)}&&${parent==='settings'?"document.querySelector('.settings-nav [data-view=settings]')":"document.querySelector('.main-nav [data-view="+(parent==='intake'?'registration':parent)+"]')"}.getAttribute('aria-current')==='page'`));
 }
 await click('.main-nav [data-view=profile]');await until("!!document.querySelector('#profile-content')");
 const choose=id=>click('[data-action=archive-select][data-student="'+id+'"]');
 await choose(fixture.aStudent);await until("document.querySelector('#profile-content')?.dataset.state==='ready'");
 const before=await evaluate("api('bootstrap').then(x=>({events:x.event_count,papers:JSON.stringify(x.papers)}))");
 await click('.settings-nav [data-view=settings]');await click('#workspace-settings [data-view=teaching]');await until("document.querySelector('h1')?.textContent==='教学资料库'");
 verify('资料库保留原审核和本地整理入口',await evaluate("!!document.querySelector('[data-action=teaching-new]')||!!document.querySelector('[data-action=teaching-import]')"));
 await click('[data-view=backup]');await until("!!document.querySelector('[data-action=backup]')");await click('[data-action=backup]');await until("!!document.querySelector('[data-restore]')");
 await click('[data-restore]');await until("!!document.querySelector('#restore-word')");await click('[data-action=confirm-restore]');
 verify('备份恢复仍要求明确确认',await evaluate("document.querySelector('#modal').open&&document.querySelector('#restore-word').value===''&&document.querySelector('#toast').textContent.includes('恢复')"));await click('[data-action=close]');
 await click('[data-view=pilot]');await until("document.querySelector('h1')?.textContent==='试点记录'");
 await click('.main-nav [data-view=profile]');await until("document.querySelector('#profile-content')?.dataset.state==='ready'");
 verify('设置往返保持明确选择的学生与档案',await evaluate(`document.querySelector('#profile-content').dataset.student===${JSON.stringify(fixture.aStudent)}&&document.querySelector('[data-action=archive-select][aria-pressed=true]').dataset.student===${JSON.stringify(fixture.aStudent)}`));
 const after=await evaluate("api('bootstrap').then(x=>({events:x.event_count,papers:JSON.stringify(x.papers)}))");
 verify('浏览设置及取消恢复不改作业或确认历史',before.events===after.events&&before.papers===after.papers);
 await evaluate("document.querySelector('#toast').classList.remove('show')");await capture('01-three-entry-desktop.png');
 await click('.workspace-subnav [data-view=queue]');await until("!!document.querySelector('.queue-workspace')");
 verify('补练待办从档案内部可达并明示全体范围',await evaluate("document.querySelector('.main-nav [data-view=profile]').getAttribute('aria-current')==='page'&&document.querySelector('.workspace-subnav').textContent.includes('全部学生')"));
 await click('.main-nav [data-view=registration]');await until("!!document.querySelector('#registration-page')");await click('.workspace-subnav [data-view=intake]');await until("!!document.querySelector('#intake-batch')");
 const batch=await evaluate(`api('papers/'+${JSON.stringify(fixture.a)}).then(p=>p.batch_id)`);await fill('#intake-batch',batch);
 await until(`!!document.querySelector('.intake-paper[data-paper="${fixture.a}"]')`);
 await click(`.intake-paper[data-paper="${fixture.a}"] [data-action=intake-open]`);await until("!!document.querySelector('#questions')");
 verify('登记进入原整卷核对且仍归登记作业',await evaluate(`document.querySelector('#paper-select').value===${JSON.stringify(fixture.a)}&&document.querySelector('.main-nav [data-view=registration]').getAttribute('aria-current')==='page'`));
 await fill('#questions .question [data-field=answer]','尚未保存的导航测试作答');
 await command('Page.enable');let acceptDialog=false;ws.addEventListener('message',ev=>{const m=JSON.parse(ev.data);if(m.method==='Page.javascriptDialogOpening')command('Page.handleJavaScriptDialog',{accept:acceptDialog}).catch(()=>{});});
 await click('.settings-nav [data-view=settings]');
 verify('取消进入设置保留审核草稿与原页面',await evaluate("!!document.querySelector('#questions')&&document.querySelector('#questions .question [data-field=answer]').value==='尚未保存的导航测试作答'&&document.querySelector('.main-nav [data-view=registration]').getAttribute('aria-current')==='page'"));
 await click('[data-action=save-paper]');await until("document.querySelector('#toast').textContent.includes('草稿已保存')");
 await click('.settings-nav [data-view=settings]');await until("!!document.querySelector('#workspace-settings')");
 await click('.main-nav [data-view=registration]');await until("!!document.querySelector('#registration-page')");await click('.workspace-subnav [data-view=intake]');await until("!!document.querySelector('#intake-batch')");await click('.workspace-subnav [data-view=review]');await until("!!document.querySelector('#questions')");
 verify('已保存草稿跨入口往返可回读',await evaluate("document.querySelector('#questions .question [data-field=answer]').value==='尚未保存的导航测试作答'"));
 await click('.workspace-subnav [data-view=practice]');await until("!!document.querySelector('#ex-stem')");await fill('#ex-explanation','尚未保存的补练讲解');
 await click('.main-nav [data-view=registration]');
 verify('取消切入口保留练习编辑和审批限制',await evaluate("document.querySelector('#ex-explanation')?.value==='尚未保存的补练讲解'&&document.querySelector('[data-action=approve-exercise]').disabled&&document.querySelector('.main-nav [data-view=profile]').getAttribute('aria-current')==='page'"));
 acceptDialog=true;await click('.main-nav [data-view=profile]');await until("document.querySelector('#profile-content')?.dataset.state==='ready'");
 // Hold an actual profile response while the teacher leaves through the new settings entry.
 await evaluate(`window.realNavFetch=fetch;window.fetch=async(...args)=>{const response=await realNavFetch(...args);if(String(args[0])==='/api/profiles/'+${JSON.stringify(fixture.bStudent)})return new Promise(resolve=>window.releaseNavProfile=()=>resolve(response));return response;}`);
 await choose(fixture.bStudent);await until("typeof window.releaseNavProfile==='function'");await click('.settings-nav [data-view=settings]');await until("!!document.querySelector('#workspace-settings')");
 await evaluate('releaseNavProfile();window.fetch=realNavFetch;true');await delay(200);
 verify('切设置取消迟到学生响应且不覆盖新页面',await evaluate("!!document.querySelector('#workspace-settings')&&!document.querySelector('#profile-content')"));
 await click('.main-nav [data-view=profile]');await until("document.querySelector('#profile-content')?.dataset.state==='ready'");
 await command('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});await evaluate("document.querySelector('#toast').classList.remove('show')");await capture('02-three-entry-mobile.png');
 verify('窄屏三入口与设置都可见、无整页横向溢出',await evaluate("document.documentElement.scrollWidth<=innerWidth+1&&[...document.querySelectorAll('.main-nav button,.settings-nav button')].every(e=>{const r=e.getBoundingClientRect();return r.width>0&&r.left>=0&&r.right<=innerWidth})"));
 await command('Input.dispatchKeyEvent',{type:'keyDown',key:'Tab',code:'Tab',windowsVirtualKeyCode:9});await command('Input.dispatchKeyEvent',{type:'keyUp',key:'Tab',code:'Tab',windowsVirtualKeyCode:9});
 verify('键盘能聚焦可操作控件',await evaluate("['BUTTON','INPUT','SELECT','TEXTAREA','A'].includes(document.activeElement.tagName)"));
 await click('.settings-nav [data-view=settings]');await capture('03-settings-mobile.png');
 verify('窄屏设置入口不溢出',await evaluate("!!document.querySelector('#workspace-settings')&&document.documentElement.scrollWidth<=innerWidth+1"));
 await click('#workspace-settings [data-view=ai]');await until("!!document.querySelector('#ai-model')");
 await fill('#ai-model','SYN-UNSAVED-MODEL');acceptDialog=false;await click('.settings-nav [data-view=settings]');
 verify('取消返回设置首页保留未保存AI配置',await evaluate("document.querySelector('#ai-model')?.value==='SYN-UNSAVED-MODEL'"));
 acceptDialog=true;await click('.settings-nav [data-view=settings]');await until("!!document.querySelector('#workspace-settings')");
 verify('明确放弃配置不写入本机设置或调用模型',await evaluate("api('ai/settings').then(x=>x.model!=='SYN-UNSAVED-MODEL')"));
 verify('全程没有真实外发、自动发布或页面异常',requests.every(u=>!/^https?:/.test(u)||u.startsWith(base)&&!u.endsWith('/send'))&&pageErrors.length===0,JSON.stringify(pageErrors));
}catch(e){failure=e.stack||String(e);}
finally{
 if(ws?.readyState===WebSocket.OPEN){try{await command('Browser.close',{},false);}catch{}ws.close();}
 if(chrome.exitCode===null)chrome.kill();if(service.exitCode===null)service.kill();
 const report={scope:'任务02三入口/设置，独立合成库，不代表真实教学与Windows封装验收',checks,passed:checks.filter(c=>c.passed).length,total:checks.length,pageErrors,requests,failure:failure||null,dataDir};
 const name=process.env.JINXUE_NAV_RED==='1'?'red.json':'verification.json';await writeFile(path.join(output,name),JSON.stringify(report,null,2));console.log(JSON.stringify({passed:report.passed,total:report.total,failure:report.failure,output}));if(failure)process.exitCode=1;
}
