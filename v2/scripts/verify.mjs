import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, _electron } from 'playwright-core';
const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, '.qa-temp');
await mkdir(OUT,{recursive:true});
const checks=[];
const record=(name,details)=>{checks.push({name,status:'PASS',details});console.log('PASS',name,details??'');};
const base='http://127.0.0.1:8019';
let browser, desktop;
const blocked=[];
const errors=[];
try {
  const h=await (await fetch(base+'/health')).json();assert.equal(h.mode,'synthetic-only');record('FastAPI real HTTP health',h);
  const sql=await (await fetch(base+'/api/sqlite-probe',{method:'POST'})).json();assert.equal(sql.value,'中文读写验证');record('SQLite disk write/read in isolated probe',sql);
  const skill=await (await fetch(base+'/api/skill')).json();assert.equal(skill.display_name,'数学错题复盘');assert.ok(skill.instructions.includes('单次错误'));record('Official skills-ref Chinese skill read and validate',{name:skill.name,displayName:skill.display_name});
  browser=await chromium.launch({executablePath:'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',headless:true});
  const ctx=await browser.newContext({viewport:{width:1120,height:900}});
  await ctx.route('**/*',route=>{const u=new URL(route.request().url());if(['127.0.0.1','localhost'].includes(u.hostname)||['data:','blob:'].includes(u.protocol))return route.continue();blocked.push(u.origin);return route.abort();});
  const page=await ctx.newPage();page.on('pageerror',e=>errors.push(String(e)));
  await page.goto('http://127.0.0.1:5179');
  await page.getByTestId('health').filter({hasText:'后端已连接'}).waitFor();
  await page.getByTestId('skill').filter({hasText:'数学错题复盘'}).waitFor();
  record('React browser to FastAPI communication');
  await page.getByRole('textbox',{name:'消息',exact:true}).fill('验证中文对话');
  await page.getByRole('button',{name:'发送',exact:true}).click();
  await page.getByText('本地模拟回复：已接收“验证中文对话”',{exact:false}).waitFor();
  record('assistant-ui actual send / local HTTP response');
  const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=','base64');
  const data=await page.evaluateHandle(base64=>{
    const dt=new DataTransfer();dt.items.add(new File([Uint8Array.from(atob(base64),c=>c.charCodeAt(0))],'合成测试.png',{type:'image/png'}));return dt;
  },png.toString('base64'));
  await page.getByTestId('dropzone').dispatchEvent('drop',{dataTransfer:data});
  await page.getByRole('img',{name:'测试图片：合成测试.png'}).waitFor();
  assert.ok(await page.getByRole('img',{name:'测试图片：合成测试.png'}).evaluate(img=>img.complete&&img.naturalWidth===1));
  await page.getByText('图片接收成功',{exact:false}).waitFor();
  record('DOM drag/drop -> actual image decode API -> preview');
  await page.getByRole('textbox',{name:'消息',exact:true}).fill('图片附件消息');
  await page.getByRole('button',{name:'发送',exact:true}).click();
  await page.getByText('图片数量 1',{exact:false}).waitFor();record('assistant-ui image attachment in sent message');
  assert.equal(await page.locator('.previews img').count(),0, 'Sent attachments must not consume the next message quota');
  await page.screenshot({path:path.join(OUT,'assistant-ui.png'),fullPage:true});
  await page.goto('http://127.0.0.1:5179/copilot.html');
  await page.getByTestId('copilot-ready').filter({hasText:'Agent 已就绪'}).waitFor();
  await page.getByRole('button',{name:'运行模拟 Agent'}).click();
  await page.getByTestId('copilot-status').filter({hasText:'模拟工具已更新界面'}).waitFor({timeout:20000});
  assert.equal(await page.getByRole('alert').textContent(),'');
  record('CopilotKit independent AG-UI HTTP agent -> frontend tool -> UI state');
  await page.screenshot({path:path.join(OUT,'copilotkit.png'),fullPage:true});
  assert.deepEqual(errors,[]);record('Browser uncaught errors',errors);
  const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
  desktop=await _electron.launch({executablePath:require('electron'),args:[ROOT,'--floating-test'],env,timeout:40000});
  await desktop.firstWindow();
  for(let i=0;i<100 && desktop.windows().length<2;i++)await new Promise(r=>setTimeout(r,100));
  const window=desktop.windows().find(w=>!w.url().includes('floating=1'));
  assert.ok(window, 'Missing normal window');
  await window.getByTestId('health').filter({hasText:'后端已连接'}).waitFor();
  const windows=await desktop.evaluate(({BrowserWindow,app})=>({versions:process.versions,profile:app.getPath('userData'),windows:BrowserWindow.getAllWindows().map(w=>({visible:w.isVisible(),floating:w.isAlwaysOnTop(),preferences:w.webContents.getLastWebPreferences()}))}));
  assert.equal(windows.windows.length,2);assert.ok(windows.windows.every(w=>w.visible));assert.ok(windows.windows.some(w=>w.floating));
  for(const w of windows.windows){assert.equal(w.preferences.nodeIntegration,false);assert.equal(w.preferences.contextIsolation,true);assert.equal(w.preferences.sandbox,true);}
  record('Actual Electron normal + independent always-on-top Windows windows',windows);
  assert.equal(await window.evaluate(()=>typeof window.require),'undefined');record('Electron renderer Node isolation');
  await window.getByRole('textbox',{name:'消息',exact:true}).fill('Electron中文通信测试');
  await window.getByRole('button',{name:'发送',exact:true}).click();
  await window.getByText('本地模拟回复：已接收“Electron中文通信测试”',{exact:false}).waitFor();
  record('Actual Electron renderer -> Python chat response');
  await window.screenshot({path:path.join(OUT,'electron.png')});
  const floating=desktop.windows().find(w=>w.url().includes('floating=1'));if(floating){await floating.getByTestId('health').filter({hasText:'后端已连接'}).waitFor();await floating.screenshot({path:path.join(OUT,'electron-floating.png')});}
}catch(e){checks.push({name:'verification interrupted',status:'FAIL',details:String(e)});console.error(e);process.exitCode=1;}
finally {
  if(desktop)await desktop.close();if(browser)await browser.close();
  await writeFile(path.join(OUT,'verification.json'),JSON.stringify({time:new Date().toISOString(),checks,blockedExternalOrigins:[...new Set(blocked)],errors,limits:['Local deterministic replies only; no AI provider, OCR or real student data tested.','Drag/drop simulated DOM DataTransfer, not physical Explorer gesture.','Electron development run, not packaged EXE or clean-machine verification.']},null,2));
}
