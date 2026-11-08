// Public UI/API checks in a fresh synthetic fixture. Never uses real student files or AI.
import {spawn} from 'node:child_process';
import {mkdtemp,readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
const project=path.resolve(import.meta.dirname,'../..');
const output=path.join(project,'app/.qa-temp/teacher-ui-polish-browser');await mkdir(output,{recursive:true});
const run=await mkdtemp(path.join(output,'run-')),dataDir=path.join(run,'data'),profile=path.join(run,'chrome');
const service=spawn('python',[path.join(project,'app/tests/browser_fixture_server.py'),'--data-dir',dataDir,'--port','0'],{windowsHide:true,stdio:['ignore','pipe','pipe']});
let serviceLog='';service.stdout.on('data',b=>serviceLog+=b);service.stderr.on('data',b=>serviceLog+=b);
const chrome=spawn(String.raw`C:\Program Files\Google\Chrome\Application\chrome.exe`,['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check','--disable-background-networking','--disable-sync','--disable-extensions','--remote-debugging-port=0',`--user-data-dir=${profile}`,'about:blank'],{windowsHide:true,stdio:'ignore'});
const delay=ms=>new Promise(r=>setTimeout(r,ms));
const pending=new Map(),checks=[],requests=[],pageErrors=[];let seq=0,ws,session,base,failure;
function verify(name,ok,detail=''){checks.push({name,passed:!!ok,detail});if(!ok)throw Error(name+': '+detail);}
async function command(method,params={},bound=true){const id=++seq;return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{pending.delete(id);reject(Error('CDP timeout '+method));},15000);pending.set(id,{resolve:v=>{clearTimeout(timer);resolve(v);},reject:e=>{clearTimeout(timer);reject(e);}});ws.send(JSON.stringify({id,method,params,...(bound&&session?{sessionId:session}:{})}));});}
async function evaluate(expression){const r=await command('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true,userGesture:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;}
async function until(e){for(let i=0;i<70;i++){if(await evaluate(e))return;await delay(100);}throw Error('wait failed '+e);}
async function click(s){await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(s)});if(!e||e.disabled)throw Error('Missing/disabled '+${JSON.stringify(s)});e.click()})()`);await delay(120);}
async function fill(s,v){await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(s)});e.value=${JSON.stringify(v)};e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));})()`);}
async function viewport(width,height){await command('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<600});await evaluate('window.scrollTo(0,0)');}
async function capture(name){const r=await command('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});await writeFile(path.join(output,name),Buffer.from(r.data,'base64'));}
async function choose(sid){await click('[data-action=archive-select][data-student="'+sid+'"]');await until("document.querySelector('#profile-content')?.dataset.state==='ready'");await evaluate('window.scrollTo(0,0)');}
try{
 for(let i=0;i<80;i++){try{base=JSON.parse(await readFile(path.join(dataDir,'server.json'),'utf8')).url;break;}catch{if(service.exitCode!==null)throw Error(serviceLog);await delay(100);}}
 if(!base)throw Error('Fixture did not start');
 let active;for(let i=0;i<70;i++){try{active=(await readFile(path.join(profile,'DevToolsActivePort'),'utf8')).trim().split(/\r?\n/);break;}catch{if(chrome.exitCode!==null)throw Error('Chrome exited '+chrome.exitCode);await delay(100);}}
 if(!active)throw Error('Chrome not ready');
 ws=new WebSocket('ws://127.0.0.1:'+active[0]+active[1]);await new Promise((r,j)=>{ws.addEventListener('open',r,{once:true});ws.addEventListener('error',j,{once:true});});
 ws.onmessage=ev=>{const m=JSON.parse(ev.data);if(m.id){const p=pending.get(m.id);pending.delete(m.id);if(p)m.error?p.reject(Error(m.error.message)):p.resolve(m.result);}if(m.method==='Network.requestWillBeSent')requests.push({url:m.params.request.url,method:m.params.request.method});if(m.method==='Runtime.exceptionThrown')pageErrors.push(m.params.exceptionDetails.text);};
 const target=await command('Target.createTarget',{url:'about:blank'},false);session=(await command('Target.attachToTarget',{targetId:target.targetId,flatten:true},false)).sessionId;
 await command('Runtime.enable');await command('Network.enable');await command('Page.enable');await viewport(1366,768);await command('Page.navigate',{url:base});await until("!!document.querySelector('main')");
 const fixture=await evaluate(`(async()=>{
  const q=(id,result,knowledge='二次函数顶点式')=>({id,stem:'求 y=(x-2)²+3 的顶点和对称轴',answer:result==='CORRECT'?'(2,3)，x=2':'(-2,3)，x=-2',correct_answer:'(2,3)，x=2',knowledge,result});
  const add=async(ref,title,batch,questions,confirm=true)=>{const p=await api('papers',{student_ref:ref,student_name:ref==='SYN-POL-C'?'合成待审学生':'合成学生',title,batch_id:batch,questions});if(confirm)await api('papers/'+p.id+'/confirm',{version:p.version,consent:true});return p;};
  const a=await add('SYN-POL-A','第一次合成作业','SYN-POL-01',[q('Q01','INCORRECT'),q('Q02','PENDING','待识读'),q('Q03','MISSING','缺页题')]);
  const a2=await add('SYN-POL-A','第二次合成作业','SYN-POL-02',[q('Q01','INCORRECT')]);
  const b=await add('SYN-POL-B','第一次合成作业','SYN-POL-01',[q('Q01','CORRECT')]);
  const c=await add('SYN-POL-C','尚未确认的作业','SYN-POL-03',[q('Q01','PENDING')],false);
  const d=await add('SYN-POL-D','第一次合成作业','SYN-POL-01',[q('Q01','PARTIAL')]);
  return {a:a.id,a2:a2.id,b:b.id,c:c.id,asid:a.student_id,bsid:b.student_id,csid:c.student_id};
 })()`);
 await command('Page.navigate',{url:base});await until("!!document.querySelector('[data-action=archive-select]')");await choose(fixture.asid);
 verify('档案首屏出现重复知识问题、作业份数与依据入口',await evaluate("(()=>{const p=document.querySelector('#archive-priorities');if(!p)return false;const item=p.querySelector('.archive-priority'),r=item?.getBoundingClientRect();return p.textContent.includes('二次函数顶点式')&&p.textContent.includes('2份作业')&&p.textContent.includes('待核对')&&!!p.querySelector('[data-action=learning-focus]')&&r.bottom<innerHeight-20})()"));
 await capture('01-profile-priorities-desktop.png');
 await click('#archive-priorities [data-action=learning-focus]');
 verify('关注摘要定位本人的知识问题并把键盘焦点带到依据区',await evaluate("document.activeElement.classList.contains('learning-group')&&document.activeElement.textContent.includes('二次函数顶点式')"));
 await click('.learning-group details > summary');await click('.learning-group [data-action=archive-open]');await until("document.querySelector('#modal').open");
 verify('前置摘要仍能回看本人的原题确认',await evaluate("document.querySelector('#modal').textContent.includes('SYN-POL-A')&&!!document.querySelector('.archive-evidence')"));await click('[data-action=close]');
 await choose(fixture.bsid);
 verify('同名学生切换后不残留上一学生的问题',await evaluate("document.querySelector('#profile-content').textContent.includes('SYN-POL-B')&&!document.querySelector('#archive-priorities .archive-priority')&&document.querySelector('#archive-priorities').textContent.includes('暂无已确认')"));
 await choose(fixture.csid);
 verify('未确认作业不制造知识薄弱点',await evaluate("!document.querySelector('#archive-priorities .archive-priority')&&document.querySelector('#profile-content').textContent.includes('尚无该学生的确认记录')"));
 await choose(fixture.asid);await click('.main-nav [data-view=registration]');await until("!!document.querySelector('#registration-page')");
 await click('.registration-paper[data-paper="'+fixture.a+'"] [data-action=registration-open]');await until("!!document.querySelector('#questions')");await evaluate('window.scrollTo(0,0)');
 await capture('02-review-first-question-desktop.png');
 const firstQuestion=await evaluate("(()=>{const q=document.querySelector('#questions .question').getBoundingClientRect(),f=document.querySelector('.review-footer').getBoundingClientRect();return {questionTop:q.top,footerTop:f.top,visible:q.top>=0&&q.top+120<f.top}})()");
 verify('1366×768首屏能看到第一道题与本次判定',firstQuestion.visible,JSON.stringify(firstQuestion));
 verify('核对仅保留一份选卷控件和明确的范围、日期、学生身份',await evaluate("document.querySelectorAll('#paper-select').length===1&&document.querySelector('#registration-context').textContent.includes('SYN-POL-A')&&document.querySelector('#registration-context').textContent.includes('登记范围未标明')&&document.querySelector('#assignment-date-summary').textContent.includes('未提供')"));
 await click('.workspace-subnav [data-view=practice]');await until("!!document.querySelector('.practice-grid')");
 verify('补练选卷的同名学生可按编号区分且选择范围提示正确',await evaluate(`(()=>{const s=document.querySelector('#paper-select'),a=[...s.options].find(o=>o.value===${JSON.stringify(fixture.a)}),b=[...s.options].find(o=>o.value===${JSON.stringify(fixture.b)});return a.text.includes('SYN-POL-A')&&b.text.includes('SYN-POL-B')&&s.getAttribute('aria-label').includes('学生作业')})()`));
 await click('.main-nav [data-view=registration]');await until("!!document.querySelector('#registration-page')");await click('.registration-paper[data-paper="'+fixture.a+'"] [data-action=registration-open]');await until("!!document.querySelector('#questions')");
 await click('.main-nav [data-view=class]');await until("!!document.querySelector('.stats')");await evaluate('window.scrollTo(0,0)');await capture('03-class-counts-desktop.png');
 verify('班级首屏明确本次作业与人数作答口径',await evaluate("(()=>{const t=document.querySelector('main').textContent;return t.includes('本次作业：第一次合成作业')&&t.includes('已收3名学生')&&t.includes('可判定2次作答中有1次错误')&&t.includes('部分正确1项')&&t.includes('待核对1项')&&t.includes('缺材料1项')&&!t.includes('二元有效作答')&&!document.querySelector('.toolbar').textContent.includes('4 名学生')})()"));
 await fill('#paper-select',fixture.c);await until("document.querySelector('.class-scope')?.textContent.includes('尚未确认的作业')");
 verify('没有可判定作答时不显示虚假的零错误率',await evaluate("document.querySelector('.class-statistics').textContent.includes('暂无可判定作答，不计算错误率')&&!document.querySelector('.class-statistics').textContent.includes('0.0%')"));
 await click('.main-nav [data-view=registration]');await until("!!document.querySelector('#registration-page')");
 const beforeNew=await evaluate("api('bootstrap').then(x=>({papers:x.papers.length,events:x.event_count}))");
 await click('[data-action=new]');await until("document.querySelector('#modal').open");await capture('04-new-assignment-dialog-desktop.png');
 verify('新作业使用中文归属说明并收起选填项，主操作在弹窗内可见',await evaluate("(()=>{const m=document.querySelector('#modal'),d=m.querySelector('.new-paper-options'),b=document.querySelector('#create-paper')?.getBoundingClientRect();return m.textContent.includes('同次作业编号')&&m.textContent.includes('同一次作业')&&d&&!d.open&&b.top>0&&b.bottom<innerHeight-12})()"));
 verify('选填字段保留单份、默认未知且附件仍可多选',await evaluate("['new-ref','new-name','new-batch','new-title','new-assignment-date','new-files','new-references'].every(id=>document.querySelectorAll('#'+id).length===1)&&document.querySelector('#new-assignment-date').value===''&&document.querySelector('#new-files').multiple&&document.querySelector('#new-references').multiple"));
 await click('.new-paper-options > summary');
 verify('老师可明确展开日期与参考答案',await evaluate("document.querySelector('#new-assignment-date').getBoundingClientRect().height>0&&document.querySelector('#new-references').getBoundingClientRect().height>0"));
 await click('[data-action=close]');
 const cancelled=await evaluate("api('bootstrap').then(x=>({papers:x.papers.length,events:x.event_count}))");
 verify('打开和取消新作业不写入记录',JSON.stringify(beforeNew)===JSON.stringify(cancelled));
 await click('[data-action=new]');await click('[data-action=create-paper]');
 verify('同次作业编号与标题仍需老师明确填写',await evaluate("document.querySelector('#modal').open&&document.querySelector('#new-batch').value===''&&document.querySelector('#toast').textContent.includes('同次作业编号')"));
 await fill('#new-batch','SYN-POL-MANUAL');await fill('#new-title','老师明确填写的新作业');
 await click('.new-paper-options > summary');await fill('#new-assignment-date','2026-11-08');await evaluate("document.querySelector('#new-assignment-date').focus()");
 await command('Input.dispatchKeyEvent',{type:'keyDown',key:'Backspace',code:'Backspace',windowsVirtualKeyCode:8});await command('Input.dispatchKeyEvent',{type:'keyUp',key:'Backspace',code:'Backspace',windowsVirtualKeyCode:8});
 await click('.new-paper-options > summary');await click('[data-action=create-paper]');
 verify('选填区收起后日期无效仍拒绝创建并展开定位',await evaluate("document.querySelector('#modal').open&&document.querySelector('.new-paper-options').open&&document.querySelector('#new-assignment-date').validity.badInput"));
 await fill('#new-assignment-date','');await click('.new-paper-options > summary');await click('[data-action=create-paper]');await until("document.querySelector('#registration-context')?.textContent.includes('SYN-POL-MANUAL')");
 const created=await evaluate("api('bootstrap').then(x=>({papers:x.papers.length,events:x.event_count,paper:x.papers.find(p=>p.batch_id==='SYN-POL-MANUAL')}))");
 verify('只填必要信息可创建当前学生的待录入作业，日期不推测且不自动归档',created.papers===beforeNew.papers+1&&created.events===beforeNew.events&&created.paper.student_id===fixture.asid&&!created.paper.assignment_date&&!created.paper.confirmed_version);
 verify('收拢布局后每题的原答与判定仍各只有一份控件',await evaluate("['stem','answer','correct_answer','knowledge','cause','result'].every(f=>document.querySelectorAll('#questions [data-field='+f+']').length===1)"));
 await fill('#questions [data-field=knowledge]','方程');await click('[data-action=save-paper]');await until("document.querySelector('#toast').textContent.includes('草稿已保存')");
 verify('简化界面保存仍仅写待审稿',await evaluate(`api('bootstrap').then(x=>x.event_count===${beforeNew.events}&&!x.papers.find(p=>p.batch_id==='SYN-POL-MANUAL').confirmed_version)`));
 await viewport(390,844);await click('.main-nav [data-view=profile]');await until("document.querySelector('#profile-content')?.dataset.state==='ready'");await choose(fixture.asid);await delay(4500);await capture('05-profile-mobile.png');
 verify('窄屏档案仍明确当前学生、知识线索与待核对边界且不横向溢出',await evaluate("document.documentElement.scrollWidth<=innerWidth+1&&document.querySelector('#profile-content').textContent.includes('SYN-POL-A')&&document.querySelector('#archive-priorities').textContent.includes('关联待核对')"));
 await click('#archive-priorities [data-action=learning-focus]');
 verify('窄屏可从关注问题定位完整依据',await evaluate("document.activeElement.classList.contains('learning-group')&&document.activeElement.getBoundingClientRect().top>=0"));
 await click('.main-nav [data-view=registration]');await until("!!document.querySelector('#registration-page')");await click('[data-action=new]');await until("document.querySelector('#modal').open");await capture('06-new-assignment-dialog-mobile.png');
 verify('窄屏新建弹窗不溢出，创建和取消操作可达',await evaluate("(()=>{const m=document.querySelector('#modal').getBoundingClientRect(),b=document.querySelector('#create-paper').getBoundingClientRect();return m.left>=0&&m.right<=innerWidth&&b.top>0&&b.bottom<innerHeight})()"));
 await click('.new-paper-options > summary');await fill('#new-title','合成长标题'.repeat(20));await capture('07-new-assignment-options-mobile.png');
 verify('展开选填内容与长标题时操作栏仍可见',await evaluate("document.querySelector('#create-paper').getBoundingClientRect().bottom<innerHeight&&document.documentElement.scrollWidth<=innerWidth+1"));await click('[data-action=close]');
 await click('.registration-paper[data-paper="'+fixture.a+'"] [data-action=registration-open]');await until("!!document.querySelector('#questions')");
 await evaluate("(()=>{const e=document.querySelector('#questions [data-field=knowledge]');e.scrollIntoView({block:'center'});e.focus({preventScroll:true})})()");await capture('08-review-question-mobile.png');
 verify('窄屏正在核对的输入不被固定操作条遮挡',await evaluate("(()=>{const r=document.activeElement.getBoundingClientRect(),f=document.querySelector('.review-footer').getBoundingClientRect();return document.activeElement.dataset.field==='knowledge'&&r.top>=0&&r.bottom<=f.top})()"));
 await click('.main-nav [data-view=class]');await until("!!document.querySelector('.class-scope')");await evaluate('window.scrollTo(0,0)');await capture('09-class-mobile.png');
 verify('窄屏班级统计不造成整页横向溢出',await evaluate("document.documentElement.scrollWidth<=innerWidth+1"));
 await viewport(1024,768);await click('.main-nav [data-view=profile]');await until("document.querySelector('#profile-content')?.dataset.state==='ready'");await evaluate('window.scrollTo(0,0)');await capture('10-profile-small-desktop.png');
 verify('较窄电脑窗口仍能阅读关注摘要',await evaluate("document.documentElement.scrollWidth<=innerWidth+1&&document.querySelector('#archive-priorities .archive-priority').getBoundingClientRect().bottom<innerHeight"));
 verify('走查没有脚本异常、外部请求或模型发送',pageErrors.length===0&&requests.every(r=>!/^https?:/.test(r.url)||r.url.startsWith(base+'/'))&&!requests.some(r=>/\/(send|probe)($|\?)/.test(r.url)),JSON.stringify(pageErrors));
 // Next UI slice is added after the preceding behavior passes.
}catch(e){failure=e.stack||String(e);}
finally{
 if(ws?.readyState===WebSocket.OPEN){try{await command('Browser.close',{},false);}catch{}ws.close();}
 if(chrome.exitCode===null)chrome.kill();if(service.exitCode===null)service.kill();
 const report={checks,passed:checks.filter(c=>c.passed).length,total:checks.length,pageErrors,requests,failure:failure||null};
 await writeFile(path.join(output,process.env.JINXUE_POLISH_RED==='1'?'red.json':'verification.json'),JSON.stringify(report,null,2));
 console.log(JSON.stringify({passed:report.passed,total:report.total,failure:report.failure,output}));if(failure)process.exitCode=1;
}
