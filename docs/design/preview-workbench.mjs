// 本地原型预览与关键交互抽查，仅使用 Node 内置模块和独立 Chrome 配置目录。
import {spawn} from 'node:child_process';
import {mkdtemp,readFile,writeFile,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
const project=String.raw`E:\GPT\AI-Tutoring-Diagnosis`;
const output=path.join(project,'docs','design','prototype-preview');
await mkdir(output,{recursive:true});
const profile=await mkdtemp(path.join(tmpdir(),'jinxue-preview-'));
const chrome=spawn(String.raw`C:\Program Files\Google\Chrome\Application\chrome.exe`,[
 '--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check',
 '--disable-background-networking','--disable-sync','--disable-extensions',
 '--remote-debugging-port=0',`--user-data-dir=${profile}`,'about:blank'
],{windowsHide:true,stdio:'ignore'});
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const pending=new Map();let sequence=0,ws,session;
const checks=[],requests=[],pageErrors=[];
function verify(name,passed,detail){checks.push({name,passed,detail});if(!passed)throw new Error(name+': '+detail);}
async function command(method,params={},useSession=true){
 const id=++sequence;
 return new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>{pending.delete(id);reject(new Error('CDP timeout '+method));},12000);
  pending.set(id,{resolve:v=>{clearTimeout(timer);resolve(v);},reject:e=>{clearTimeout(timer);reject(e);}});
  ws.send(JSON.stringify({id,method,params,...(useSession&&session?{sessionId:session}:{})}));
 });
}
async function evaluate(expression){const result=await command('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(result.exceptionDetails)throw new Error(result.exceptionDetails.text);return result.result.value;}
const click=selector=>evaluate(`(()=>{const b=document.querySelector(${JSON.stringify(selector)});if(!b)throw new Error('missing control');b.click();return true;})()`);
async function screenshot(name){const r=await command('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});await writeFile(path.join(output,name),Buffer.from(r.data,'base64'));}
let failure;
try{
 let active;
 for(let i=0;i<100;i++){try{active=(await readFile(path.join(profile,'DevToolsActivePort'),'utf8')).trim().split(/\r?\n/);break;}catch{await delay(100);}}
 if(!active)throw new Error('Chrome debugging endpoint not ready');
 ws=new WebSocket(`ws://127.0.0.1:${active[0]}${active[1]}`);
 await new Promise((resolve,reject)=>{ws.addEventListener('open',resolve,{once:true});ws.addEventListener('error',reject,{once:true});});
 ws.addEventListener('message',event=>{
  const m=JSON.parse(String(event.data));
  if(m.id&&pending.has(m.id)){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(new Error(m.error.message)):p.resolve(m.result);}
  if(m.method==='Network.requestWillBeSent')requests.push(m.params.request.url);
  if(m.method==='Runtime.exceptionThrown')pageErrors.push(m.params.exceptionDetails.text);
 });
 const target=await command('Target.createTarget',{url:'about:blank'},false);
 session=(await command('Target.attachToTarget',{targetId:target.targetId,flatten:true},false)).sessionId;
 await command('Page.enable');await command('Runtime.enable');await command('Network.enable');
 await command('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false});
 await command('Page.navigate',{url:pathToFileURL(path.join(project,'prototype','index.html')).href});
 for(let i=0;i<80;i++){if(await evaluate("document.readyState==='complete' && !!document.querySelector('#homework-image')?.naturalWidth"))break;await delay(100);}
 verify('初始页面与本地原图加载',await evaluate("document.querySelector('#homework-image').naturalWidth>0 && document.querySelectorAll('.question-tab').length===4"),'原图加载，四个题目入口');
 verify('电脑屏幕内可见整卷确认按钮',await evaluate("document.querySelector('[data-action=\"archive\"]').getBoundingClientRect().bottom<=innerHeight"),'1440×900首屏确认动作可达');
 await screenshot('01-review-desktop.png');
 await click('[data-view="profile"]');
 verify('审核前档案为空',await evaluate("document.querySelector('#workspace').innerText.includes('让确认过的证据进入档案')"),'未审内容不进入演示档案');
 await click('[data-view="practice"]');
 verify('审核前补练被阻止',await evaluate("document.querySelector('#workspace').innerText.includes('先确认需要补齐的问题')"),'必须先确认原问题');
 await click('[data-view="review"]');await click('[data-action="archive"]');
 verify('整卷确认需要主动勾选',await evaluate("document.querySelector('#archive-confirm').disabled"),'确认按钮初始禁用');
 await click('#archive-check');await click('#archive-confirm');
 verify('整卷确认后状态更新',await evaluate("document.querySelector('#paper-status').textContent.includes('已确认')"),'仅本页演示确认');
 await click('[data-view="profile"]');
 verify('档案出现原卷证据',await evaluate("document.querySelectorAll('.timeline-item').length===1 && document.querySelector('#workspace').innerText.includes('原错题始终保留')"),'确认后有原卷时间线');
 await screenshot('02-profile-confirmed.png');
 await click('[data-view="class"]');
 const beforeClass=await evaluate("document.querySelector('tbody').innerText");
 await screenshot('03-class-current.png');
 await evaluate("document.querySelector('#class-batch').value='legacy';document.querySelector('#class-batch').dispatchEvent(new Event('change',{bubbles:true}));");
 verify('独立六题班级样例',await evaluate("document.querySelectorAll('tbody tr').length===6 && document.querySelector('#workspace').innerText.includes('60项有效状态')"),'独立批次与图片四题分开');
 await screenshot('04-class-ten-students.png');
 await click('[data-view="practice"]');await click('[data-action="generate"]');
 await screenshot('05-practice-draft.png');
 await click('[data-level="1"]');
 verify('切换档次不继承已生成与审批状态',await evaluate("!document.querySelector('[data-action=\"retest\"]') && !document.querySelector('.worksheet')"),'当前档次需要单独生成审稿');
 await click('[data-level="0"]');await click('[data-action="generate"]');
 verify('练习未审批不能复测',await evaluate("document.querySelector('[data-action=\"retest\"]').disabled"),'教师审稿先于复测');
 await click('[data-action="approve-practice"]');await click('#practice-check');await click('#practice-confirm');
 await click('[data-action="retest"]');await click('[data-action="fill-retest"]');await click('[data-action="save-retest"]');
 await click('[data-view="profile"]');
 verify('复测追加且历史保留',await evaluate("document.querySelectorAll('.timeline-item').length===2 && document.querySelector('#workspace').innerText.includes('继续观察')"),'两条时间线，未把一次答对判掌握');
 await screenshot('06-profile-after-retest.png');
 await click('[data-view="class"]');
 await evaluate("document.querySelector('#class-batch').value='image';document.querySelector('#class-batch').dispatchEvent(new Event('change',{bubbles:true}));");
 verify('复测不改原卷统计',beforeClass===await evaluate("document.querySelector('tbody').innerText"),'原卷表格保持原值');
 await click('[data-view="review"]');await click('[data-action="export"]');
 verify('未选导出格式不能确认',await evaluate("document.querySelector('#export-confirm').disabled"),'不默认生成两种格式');
 await click('input[value="PDF"]');await click('#export-confirm');
 verify('仅响应所选格式',await evaluate("document.querySelector('#toast').textContent.includes('PDF') && document.querySelector('#toast').textContent.includes('未生成实际文件')"),'原型没有冒充真实导出');
 await click('[data-action="export"]');await click('[data-action="close"]');
 verify('取消导出关闭选择且不执行导出',await evaluate("!document.querySelector('#modal').open"),'不回退生成Word或其他格式');
 await command('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
 await command('Page.navigate',{url:pathToFileURL(path.join(project,'prototype','index.html')).href});await delay(600);
 verify('窄屏无全页横向溢出',await evaluate('document.documentElement.scrollWidth<=window.innerWidth+1'),'390px宽度检查');
 await screenshot('07-review-mobile.png');
 verify('页面没有HTTP外发请求',requests.filter(url=>/^https?:/i.test(url)).length===0,'只读本地页面和本地图片');
 verify('未捕获页面JavaScript异常',pageErrors.length===0,pageErrors.join('; ')||'无');
}catch(error){failure=String(error.stack||error);}
finally{
 if(ws?.readyState===WebSocket.OPEN){try{await command('Browser.close',{},false);}catch{}ws.close();}
 if(chrome.exitCode===null){await delay(500);if(chrome.exitCode===null)chrome.kill();}
 const report={scope:'本地一次性原型的关键交互与截图检查；不是正式应用、AI、持久化或真实数据验收。',checks,passed:checks.filter(c=>c.passed).length,total:checks.length,requests,pageErrors,profileDirectory:profile,failure:failure||null};
 await writeFile(path.join(output,'verification.json'),JSON.stringify(report,null,2));
 console.log(JSON.stringify({passed:report.passed,total:report.total,failure:report.failure,output}));
}
if(failure)process.exitCode=1;
