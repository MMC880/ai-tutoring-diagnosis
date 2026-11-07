// Teacher profile report: synthetic isolated rows only; no external model requests.
import {spawn} from 'node:child_process';
import {mkdtemp,readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
const project=String.raw`E:\GPT\AI-Tutoring-Diagnosis`;
const output=path.join(project,'docs/design/teaching-search-browser');await mkdir(output,{recursive:true});
const tempBase=path.join(project,'app/.qa-temp');await mkdir(tempBase,{recursive:true});
const run=await mkdtemp(path.join(tempBase,'teaching-search-browser-'));
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
 const syntheticFile=path.join(run,'synthetic-teaching.docx');
 await new Promise((resolve,reject)=>{const p=spawn('python',['-c',"from docx import Document;import sys;d=Document();d.add_paragraph('Synthetic mathematics');d.save(sys.argv[1]);from PIL import Image;Image.new('RGB',(8,8),'white').save(sys.argv[1]+'.png')",syntheticFile],{windowsHide:true,stdio:'ignore'});p.on('exit',code=>code===0?resolve():reject(Error('fixture DOCX failed')));});
 const raw=Buffer.from(await readFile(syntheticFile)).toString('base64'),imageData=Buffer.from(await readFile(syntheticFile+'.png')).toString('base64');
 await evaluate(`(async()=>{
  const make=async(ref)=>api('papers',{student_ref:ref,student_name:ref,batch_id:'SYN-SEARCH',title:'合成卷',questions:[{id:'Q01',stem:'合成分式原题',answer:'原答',result:'INCORRECT',knowledge:''}]});
  const a=await make('SYN-A'),b=await make('SYN-B');
  const doc=await api('documents',{filename:'synthetic-teaching.docx',data:${JSON.stringify(raw)}});
  let m=await api('teaching/materials',{document_id:doc.id,title:'合成同名资料',scope:'山西初中数学'});
  m=await api('teaching/materials/'+m.id,{version:m.version,entries:Array.from({length:45},(_,i)=>({knowledge:i===44?'目标分式':'重复知识',content:i===44?'分母不能为零 <img src=x onerror=alert(1)>':'合成内容'+i,question_type:'条件判断',locator:'第'+(i+1)+'节'}))});
  await api('teaching/materials/'+m.id+'/approve',{version:m.version,consent:true});
  const doc2=await api('documents',{filename:'other.png',data:${JSON.stringify(imageData)}});
  let n=await api('teaching/materials',{document_id:doc2.id,title:'合成同名资料',scope:'另一出处'});
  n=await api('teaching/materials/'+n.id,{version:n.version,entries:[{knowledge:'目标分式',content:'另一资料内容',locator:'第1页'}]});await api('teaching/materials/'+n.id+'/approve',{version:n.version,consent:true});
  globalThis.searchFixture={a,b,m,n};await load();paperId=a.id;view='review';await render();
 })()`);
 const writesBefore=requests.filter(r=>r.method==='POST').length;
 await click('[data-q=Q01] [data-action=teaching-link]');await until("!!document.querySelector('#teaching-catalog-select')");
 verify('关联窗口有搜索与按资料筛选',await evaluate("!!document.querySelector('#teaching-catalog-query')&&!!document.querySelector('#teaching-catalog-material')"));
 verify('目录46项初始空选择且只显示20项',await evaluate("document.querySelectorAll('#teaching-catalog-select option').length===21&&document.querySelector('#teaching-catalog-select').value===''&&document.querySelector('[data-action=teaching-bind]').disabled&&document.querySelector('#teaching-catalog-count').textContent.includes('46')"));
 await click('[data-action=teaching-catalog-next]');await click('[data-action=teaching-catalog-next]');
 verify('末页全部可达不静默截断',await evaluate("document.querySelectorAll('#teaching-catalog-select option').length===7&&document.querySelector('[data-action=teaching-catalog-next]').disabled"));
 await fill('#teaching-catalog-query','目标分式');
 verify('关键词匹配同名不同出处都保留',await evaluate("document.querySelectorAll('#teaching-catalog-select option').length===3"));
 await fill('#teaching-catalog-material',await evaluate('searchFixture.m.id'));
 verify('同名资料按ID筛选不混并',await evaluate("document.querySelectorAll('#teaching-catalog-select option').length===2&&document.querySelector('#teaching-catalog-select option[value]').textContent!==''"));
 const selectedIndex=await evaluate("document.querySelectorAll('#teaching-catalog-select option')[1].value");await fill('#teaching-catalog-select',selectedIndex);
 verify('所选内容及固定出处可核对并转义',await evaluate("(()=>{const e=document.querySelector('#teaching-catalog-preview');return e.textContent.includes('分母不能为零')&&e.textContent.includes('第45节')&&e.textContent.includes('V2')&&e.textContent.includes('<img src=x')&&!e.querySelector('img')&&!document.querySelector('[data-action=teaching-bind]').disabled})()"));
 if(process.env.JINXUE_SEARCH_TYPE_RED==='1')verify('所选预览显示题型',await evaluate("document.querySelector('#teaching-catalog-preview').textContent.includes('题型：条件判断')"));
 await fill('#teaching-catalog-query','不存在');
 verify('改搜索清空旧选项且无结果明确说明',await evaluate("document.querySelector('#teaching-catalog-select').value===''&&document.querySelector('[data-action=teaching-bind]').disabled&&document.querySelector('#teaching-catalog-preview').textContent.includes('尚未选择')&&document.querySelector('#teaching-catalog-count').textContent.includes('0')"));
 await fill('#teaching-catalog-query','分母 条件判断');await fill('#teaching-catalog-select',selectedIndex);
 await click('[data-action=teaching-bind]');await until("!document.querySelector('#modal').open");
 verify('精确回填原目录条目而非过滤下标',await evaluate("(()=>{const row=document.querySelector('[data-q=Q01]'),ref=JSON.parse(row.querySelector('[data-field=teaching_ref]').value);return ref.material_id===searchFixture.m.id&&ref.entry_id===searchFixture.m.entries[44].id&&ref.version===2&&row.querySelector('[data-field=knowledge]').value==='目标分式'&&dirty})()"));
 verify('查找与关联不自动写档或确认',requests.filter(r=>r.method==='POST').length===writesBefore);
 await click('[data-action=save-paper]');await until('!dirty');
 await click('[data-q=Q01] [data-action=teaching-link]');await until("!!document.querySelector('#teaching-catalog-query')");
 await fill('#teaching-catalog-query','目标分式');await fill('#teaching-catalog-material',await evaluate('searchFixture.m.id'));await fill('#teaching-catalog-select',selectedIndex);
 await evaluate("globalThis.searchOriginalApi=api;api=async function(path,...args){if(path.includes('/versions/'))throw Error('合成来源读取失败');return searchOriginalApi(path,...args)}");await click('[data-action=teaching-bind]');
 verify('来源回读失败不回填并可重试',await evaluate("document.querySelector('#modal').open&&!dirty&&document.querySelector('#toast').textContent.includes('来源读取失败')"));await evaluate('api=searchOriginalApi');
 await evaluate("api=async function(path,...args){if(path.includes('/versions/'))await new Promise(r=>setTimeout(r,500));return searchOriginalApi(path,...args)}");await click('[data-action=teaching-bind]');await click('[data-action=close]');await delay(650);
 verify('真实点击取消在回读中立即生效且不回填',await evaluate("!document.querySelector('#modal').open&&!dirty"));await evaluate('api=searchOriginalApi');
 await click('[data-q=Q01] [data-action=teaching-link]');await until("!!document.querySelector('#teaching-catalog-query')");await fill('#teaching-catalog-query','目标分式');await fill('#teaching-catalog-material',await evaluate('searchFixture.m.id'));await fill('#teaching-catalog-select',selectedIndex);
 await evaluate("api=async function(path,...args){if(path.includes('/versions/'))await new Promise(r=>setTimeout(r,500));return searchOriginalApi(path,...args)}");await click('[data-action=teaching-bind]');await fill('#teaching-catalog-query','不存在');await delay(650);
 verify('回读期间换过滤取消旧选择回填',await evaluate("document.querySelector('#modal').open&&!dirty&&document.querySelector('#teaching-catalog-select').value===''") );await evaluate('api=searchOriginalApi');
 await fill('#teaching-catalog-query','目标分式');await fill('#teaching-catalog-select',selectedIndex);
 await evaluate("api=async function(path,...args){if(path.includes('/versions/'))await new Promise(r=>setTimeout(r,500));return searchOriginalApi(path,...args)}");await click('[data-action=teaching-bind]');await evaluate("modal('<p>新核对窗口</p>')");await delay(650);
 verify('回读期间开新窗口保留新窗不回填',await evaluate("document.querySelector('#modal').textContent.includes('新核对窗口')&&!dirty"));await evaluate('api=searchOriginalApi;close()');
 await evaluate("api=async function(path,...args){if(path==='teaching/catalog')await new Promise(r=>setTimeout(r,500));return searchOriginalApi(path,...args)}");await click('[data-q=Q01] [data-action=teaching-link]');await evaluate("modal('<p>目录读取中的新窗</p>');close()");await delay(650);
 verify('目录迟到不覆盖已打开关闭的新窗',await evaluate("!document.querySelector('#modal').open"));await evaluate('api=searchOriginalApi');
 await evaluate("api=async function(path,...args){if(path==='teaching/catalog')await new Promise(r=>setTimeout(r,500));return searchOriginalApi(path,...args)}");await click('[data-q=Q01] [data-action=teaching-link]');await evaluate("(async()=>{paperId=searchFixture.b.id;await render()})()");await delay(650);
 verify('目录读取中换学生不弹回旧生选择器',await evaluate("paper().id===searchFixture.b.id&&!document.querySelector('#modal').open"));await evaluate('api=searchOriginalApi');
 await click('[data-q=Q01] [data-action=teaching-link]');await until("!!document.querySelector('#teaching-catalog-query')");await fill('#teaching-catalog-query','目标分式');await fill('#teaching-catalog-material',await evaluate('searchFixture.m.id'));await fill('#teaching-catalog-select',selectedIndex);
 await evaluate("(async()=>{let m=await api('teaching/materials/'+searchFixture.m.id);await api('teaching/materials/'+m.id,{version:m.version,title:m.title,scope:m.scope,edition:'新待审稿',entries:m.entries})})()");
 await click('[data-action=teaching-bind]');await until("!document.querySelector('#modal').open");
 verify('来源新待审稿不替换选中的历史已审核版本',await evaluate("JSON.parse(document.querySelector('[data-q=Q01] [data-field=teaching_ref]').value).version===2&&dirty"));
 await click('[data-action=save-paper]');await until('!dirty');await click('[data-q=Q01] [data-action=teaching-link]');await until("!!document.querySelector('#teaching-catalog-query')");await fill('#teaching-catalog-query','目标分式');await fill('#teaching-catalog-material',await evaluate('searchFixture.m.id'));await fill('#teaching-catalog-select',selectedIndex);
 verify('所选预览显示题型',await evaluate("document.querySelector('#teaching-catalog-preview').textContent.includes('题型：条件判断')"));
 await capture('01-teaching-search-desktop.png');await command('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});await capture('02-teaching-search-mobile.png');
 verify('390px窗口无横向溢出',await evaluate("document.documentElement.scrollWidth<=innerWidth&&document.querySelector('#modal').scrollWidth<=document.querySelector('#modal').clientWidth+1"));
 verify('没有AI准备发送或学生确认请求',requests.every(r=>!r.url.endsWith('/prepare')&&!r.url.endsWith('/send')&&!(r.method==='POST'&&r.url.includes('/papers/')&&r.url.endsWith('/confirm')))&&pageErrors.length===0);
} catch(e){failure=e.stack||String(e);} finally {
 if(ws){try{await command('Browser.close',{},false);}catch{}ws.close();}chrome.kill();service.kill();
 const report={scope:'隔离合成教学目录查找与精确待审关联；非真实知识内容/教学验收',checks,passed:checks.filter(c=>c.passed).length,total:checks.length,pageErrors,failure:failure||null};
 await writeFile(path.join(output,process.env.JINXUE_SEARCH_RED==='1'?'red.json':'verification.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({passed:report.passed,total:report.total,failure:report.failure,output}));if(failure)process.exitCode=1;
}
