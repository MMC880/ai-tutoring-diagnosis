// UX-01/02/03: real Electron controls + isolated FastAPI/SQLite; no provider or student data.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { createServer } from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { _electron } from 'playwright-core';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, '.qa-temp', 'ux-routing', String(Date.now()));
const WEB = path.resolve(process.argv[2] || path.join(ROOT, 'dist'));
const require = createRequire(import.meta.url);
const checks = [], requests = [], errors = [], logs = [];
const env = { ...process.env, PYTHONUTF8: '1', PYTHONDONTWRITEBYTECODE: '1', JINXUE_HOME: path.join(OUT, 'profile') };
env.JINXUE_PROVIDER_CONFIG_PATH = path.join(OUT, 'isolated-provider.dpapi');
delete env.ELECTRON_RUN_AS_NODE;
let backend, desktop, main, agent;
async function send(text) {
  await agent.getByRole('textbox', { name: '消息', exact: true }).fill(text);
  await agent.getByRole('button', { name: '发送', exact: true }).click();
  await agent.waitForFunction(() => !document.querySelector('[data-testid="task-status"]')?.textContent.includes('正在处理'));
}
async function attach() {
  await agent.getByLabel('添加测试图片').setInputFiles(path.join(OUT, 'paper.jpg'));
  await agent.getByTestId('intake-file').waitFor();
  await agent.waitForFunction(() => !document.querySelector('input[type="file"]')?.disabled);
}
async function openAgent() {
  if (agent) await agent.close();
  const opening = desktop.waitForEvent('window');
  await main.getByRole('button', { name: '打开 AI Agent', exact: true }).click();
  agent = await opening;
  agent.setDefaultTimeout(10000);
  agent.on('pageerror', error => errors.push(error.message));
  agent.on('request', request => {
    const url = new URL(request.url());
    if (url.pathname.startsWith('/api/')) requests.push({ path: url.pathname, method: request.method(), body: request.postData() });
  });
  await agent.getByRole('heading', { name: 'AI Agent', exact: true }).waitFor();
  await agent.getByRole('textbox', { name: '消息', exact: true }).waitFor({ state: 'visible' });
  await agent.waitForFunction(() => !document.querySelector('[aria-label="消息"]')?.disabled);
}
async function check(name, action) {
  try { await action(); checks.push({ name, status: 'PASS' }); console.log('PASS', name); }
  catch (error) {
    checks.push({ name, status: 'FAIL', error: String(error) });
    console.error('FAIL', name, String(error));
    await agent?.screenshot({ path: path.join(OUT, `failure-${checks.length}.png`) }).catch(() => {});
  }
}
async function api(endpoint, body) {
  const response = await fetch('http://127.0.0.1:18019' + endpoint, body === undefined ? undefined : {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  assert.ok(response.ok); return response.json();
}
try {
  await mkdir(OUT, { recursive: true });
  await new Promise((resolve, reject) => {
    const server = createServer(); server.once('error', reject);
    server.listen(18019, '127.0.0.1', () => server.close(resolve));
  });
  // Only this process owns port 18019; the user's 8019/5179 session stays untouched.
  const program = "import sys; from pathlib import Path; from PIL import Image; import uvicorn; from backend.main import create_app; p=Path(sys.argv[1]); Image.new('RGB',(160,120),'white').save(p/'paper.jpg'); uvicorn.run(create_app(p/'probe.sqlite3',p/'archive'),host='127.0.0.1',port=18019,access_log=False)";
  backend = spawn(path.join(ROOT, '.venv/Scripts/python.exe'), ['-X', 'utf8', '-B', '-c', program, OUT], {
    cwd: ROOT, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
  });
  backend.stdout.on('data', data => logs.push(String(data))); backend.stderr.on('data', data => logs.push(String(data)));
  let ready = false;
  for (let n = 0; n < 100; n++) {
    if (backend.exitCode !== null) throw Error('Isolated backend exited');
    try { if ((await fetch('http://127.0.0.1:18019/health')).ok) { ready = true; break; } } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.ok(ready, 'Isolated backend ready');
  const student = (await api('/api/students', { name: '体验甲', confirm_new: true })).student;
  // Keep the real Electron entry/preload/security; route only its local HTTP to this test's assets/API.
  const host = `const {app,session}=require('electron');const fs=require('node:fs');const path=require('node:path');
app.whenReady().then(()=>session.defaultSession.protocol.handle('http',async req=>{
const u=new URL(req.url);if(u.hostname!=='127.0.0.1')return new Response('blocked',{status:403});
if(u.port==='5179'){const web=${JSON.stringify(WEB)};const file=path.resolve(web,'.'+decodeURIComponent(u.pathname==='/'?'/index.html':u.pathname));
if(!file.startsWith(web+path.sep)||!fs.existsSync(file))return new Response('not found',{status:404});
const mime=file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html';return new Response(fs.readFileSync(file),{headers:{'content-type':mime+'; charset=utf-8'}});}
if(u.port==='8019'){const ct=req.headers.get('content-type');const body=['GET','HEAD'].includes(req.method)?undefined:Buffer.from(await req.arrayBuffer());
const res=await fetch('http://127.0.0.1:18019'+u.pathname+u.search,{method:req.method,headers:ct?{'content-type':ct}:{},body});
return new Response(await res.arrayBuffer(),{status:res.status,headers:{...Object.fromEntries(res.headers),'access-control-allow-origin':'http://127.0.0.1:5179'}});}
return new Response('blocked',{status:403});}));require(${JSON.stringify(path.join(ROOT, 'desktop/main.cjs'))});`;
  await writeFile(path.join(OUT, 'host.cjs'), host);
  desktop = await _electron.launch({ executablePath: require('electron'), args: [path.join(OUT, 'host.cjs')], env, timeout: 45000 });
  main = await desktop.firstWindow(); main.setDefaultTimeout(10000);
  await main.getByTestId('health').filter({ hasText: '后端已连接' }).waitFor();
  await main.getByTestId('student-list').getByRole('button').filter({ hasText: '体验甲' }).click();
  await main.getByTestId('current-student').filter({ hasText: '体验甲' }).waitFor();

  await check('UX-03: successful archive leaves one consistent completion state', async () => {
    await openAgent(); await attach();
    await send('学生体验甲今天的数学作业，帮我归档。第3、5、8题错。');
    await agent.getByTestId('intake-receipt').filter({ hasText: '已归档并回读' }).waitFor();
    assert.equal(await agent.getByTestId('intake-file').count(), 0);
    const state = await agent.getByTestId('dropzone').innerText();
    assert.doesNotMatch(state, /尚未归档/);
    assert.match(state, /已归档/);
    await agent.screenshot({ path: path.join(OUT, 'archive-completed.png') });
  });
  await check('UX-01: query with a selected photo stays local and retains the photo', async () => {
    await openAgent(); await attach(); const start = requests.length;
    await send('学生体验甲最近一个月错过哪些题？');
    await agent.locator('.message').filter({ hasText: '最近30天' }).waitFor();
    assert.deepEqual(requests.slice(start).filter(r => r.method === 'POST').map(r => r.path), ['/api/intake/query']);
    assert.equal(await agent.getByTestId('intake-file').count(), 1);
    await agent.screenshot({ path: path.join(OUT, 'history-photo-stays-local.png') });
  });
  await check('UX-01: retained photo can then be explicitly analyzed; history stays out of model payload', async () => {
    // Start independently, so this verifies local-reply exclusion even on a RED run.
    await openAgent(); await send('学生体验甲最近一个月错过哪些题？');
    await agent.locator('.message').filter({ hasText: '最近30天' }).waitFor();
    await attach(); const start = requests.length;
    await send('请分析这张数学作业，解释第5题');
    await agent.locator('.message').filter({ hasText: '本地模拟回复' }).waitFor();
    const posted = requests.slice(start).find(r => r.path === '/api/chat'); assert.ok(posted);
    const payload = JSON.parse(posted.body); assert.equal(payload.image_count, 1);
    assert.deepEqual(payload.history, []);
  });
  await check('UX-02: analyzing an archived assignment with no selected image gives local guidance, no write or model', async () => {
    await openAgent(); const start = requests.length;
    await send('再分析刚才归档的那张作业');
    await agent.locator('.message').filter({ hasText: /请重新选择.*图片/ }).waitFor();
    assert.equal((await agent.getByRole('alert').allTextContents()).length, 0);
    assert.deepEqual(requests.slice(start).filter(r => r.method === 'POST'), []);
    await agent.screenshot({ path: path.join(OUT, 'archived-analysis-guidance.png') });
  });
  await check('UX-02: selected photo + archived-analysis request goes to analysis, not duplicate archive', async () => {
    await openAgent(); await attach(); const start = requests.length;
    await send('再分析刚才归档的那张作业');
    await agent.locator('.message').filter({ hasText: '本地模拟回复' }).waitFor();
    const posted = requests.slice(start).filter(r => r.method === 'POST');
    assert.deepEqual(posted.map(r => r.path), ['/api/intake/analysis-image', '/api/chat']);
    assert.equal(JSON.parse(posted[1].body).image_count, 1);
  });
  await check('UX-02: do not archive instruction analyzes selected photo without writing', async () => {
    await openAgent(); await attach(); const start = requests.length;
    await send('不要归档，只分析这张数学作业');
    await agent.locator('.message').filter({ hasText: '本地模拟回复' }).waitFor();
    assert.ok(!requests.slice(start).some(r => r.path === '/api/intake'));
  });
  await check('Explicit photo analysis mentioning knowledge points does not become a history query', async () => {
    await openAgent(); await attach(); const start = requests.length;
    await send('请分析这张作业涉及哪些知识点');
    await agent.locator('.message').filter({ hasText: '本地模拟回复' }).waitFor();
    assert.deepEqual(requests.slice(start).filter(r => r.method === 'POST').map(r => r.path), ['/api/intake/analysis-image', '/api/chat']);
  });
  await check('UX-02: explicit new archive remains local even when later analysis is also mentioned', async () => {
    await openAgent(); await attach(); const start = requests.length;
    await send('学生体验甲今天的数学作业，帮我归档，之后再分析。第3题错。');
    await agent.getByTestId('intake-receipt').filter({ hasText: '未新建作业或错题' }).waitFor();
    assert.deepEqual(requests.slice(start).filter(r => r.method === 'POST').map(r => r.path), ['/api/intake']);
  });
  await check('UX-01: query of archived records does not start a new archive', async () => {
    await openAgent(); await attach(); const start = requests.length;
    await send('查一下之前归档的作业，学生体验甲最近一个月错过哪些题？');
    await agent.locator('.message').filter({ hasText: '最近30天' }).waitFor();
    assert.deepEqual(requests.slice(start).filter(r => r.method === 'POST').map(r => r.path), ['/api/intake/query']);
  });
  const history = await api('/api/intake/query', { text: '学生体验甲最近一个月错过哪些题？', student_id: student.id, subject: 'math' });
  assert.equal(history.assignments.length, 1); assert.equal(history.confirmed_count, 3);
  assert.deepEqual(errors, []);
  checks.push({ name: 'Only one assignment and three confirmed teacher questions; no renderer errors', status: 'PASS' });
} catch (error) { checks.push({ name: 'verification harness', status: 'FAIL', error: String(error) }); console.error(error); }
finally {
  if (desktop) await desktop.close();
  if (backend && backend.exitCode === null) await new Promise(resolve => {
    const killer = spawn('taskkill.exe', ['/PID', String(backend.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
    killer.once('exit', resolve); killer.once('error', resolve);
  });
  await writeFile(path.join(OUT, 'result.json'), JSON.stringify({ scope: 'ISOLATED_ELECTRON_LOCAL_SIMULATION', web: WEB,
    limitation: 'Protocol wrapper + isolated source backend; normal packaged self-start and real provider are not tested', checks, requests, errors }, null, 2));
  await writeFile(path.join(OUT, 'services.log'), logs.join(''));
  console.log('Evidence:', OUT);
  if (checks.some(check => check.status === 'FAIL')) process.exitCode = 1;
}
