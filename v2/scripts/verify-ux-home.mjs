// Catches settings obscuring the first screen and name-only student selection.
// Real Electron controls and isolated local records; never opens a user's archive.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { createServer } from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { _electron } from 'playwright-core';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, '.qa-temp', 'ux-home', String(Date.now()));
const exe = process.argv[2] ? path.resolve(process.argv[2]) : null;
const require = createRequire(import.meta.url);
const apiPort = exe ? 8019 : 18019;
const checks = [], errors = [], logs = [], requests = [];
const env = { ...process.env, PYTHONUTF8: '1', PYTHONDONTWRITEBYTECODE: '1',
  JINXUE_HOME: path.join(OUT, 'profile'), JINXUE_DATA_DIR: path.join(OUT, 'archive') };
env.JINXUE_PROVIDER_CONFIG_PATH = path.join(OUT, 'isolated-provider.dpapi');
delete env.ELECTRON_RUN_AS_NODE;
let backend, desktop, page;
async function free(port) {
  await new Promise((resolve, reject) => {
    const server = createServer(); server.once('error', reject);
    server.listen(port, '127.0.0.1', () => server.close(resolve));
  });
}
async function api(endpoint, body) {
  const response = await fetch(`http://127.0.0.1:${apiPort}` + endpoint, body === undefined ? undefined : {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  assert.ok(response.ok, `${endpoint}: ${response.status} ${response.ok ? '' : await response.text()}`); return response.json();
}
async function check(name, action) {
  try { await action(); checks.push({ name, status: 'PASS' }); console.log('PASS', name); }
  catch (error) {
    checks.push({ name, status: 'FAIL', error: String(error) }); console.error('FAIL', name, String(error));
    await page?.screenshot({ path: path.join(OUT, `failure-${checks.length}.png`) }).catch(() => {});
  }
}
async function assignment(student, subject, question, suffix) {
  const form = new FormData(); form.set('student_id', student.id); form.set('request_id', 'home-' + suffix);
  form.set('subject', subject);
  form.set('instruction', `${student.class_name}学生${student.name}${subject === 'math' ? '数学' : '英语'}作业归档，第${question}题错`);
  // Distinct valid images; duplicate protection stays enabled.
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aFOsAAAAASUVORK5CYII=', 'base64');
  form.append('files', new Blob([png, suffix]), suffix + '.png');
  const response = await fetch(`http://127.0.0.1:${apiPort}/api/intake`, { method: 'POST', body: form });
  assert.ok(response.ok); const staged = await response.json();
  const result = staged.status === 'SAVED' ? staged : await api('/api/intake/resolve', { flow_id: staged.flow_id, student_id: student.id });
  assert.equal(result.status, 'SAVED'); return result.receipt.assignment_id;
}
async function choose(student) {
  await page.getByTestId('student-list').getByRole('button').filter({ hasText: student.id }).click();
  await page.getByTestId('current-student').filter({ hasText: student.name }).waitFor();
}
try {
  await mkdir(OUT, { recursive: true });
  if (exe) {
    await free(8019); await free(5179);
    desktop = await _electron.launch({ executablePath: exe, env, timeout: 90000 });
    page = await desktop.firstWindow();
    await page.getByTestId('health').filter({ hasText: '后端已连接' }).waitFor({ timeout: 30000 });
  } else {
    await free(apiPort);
    const program = `import sys,httpx,uvicorn
from pathlib import Path
from backend.main import create_app
p=Path(sys.argv[1])
def respond(request):
    return httpx.Response(200,json={'model':'synthetic-model','choices':[{'message':{'role':'assistant','content':'晋学智辅连接成功。'}}]})
uvicorn.run(create_app(p/'probe.sqlite3',p/'archive',provider_transport=httpx.MockTransport(respond)),host='127.0.0.1',port=18019,access_log=False)`;
    backend = spawn(path.join(ROOT, '.venv/Scripts/python.exe'), ['-X', 'utf8', '-B', '-c', program, OUT], {
      cwd: ROOT, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
    });
    backend.stdout.on('data', b => logs.push(String(b))); backend.stderr.on('data', b => logs.push(String(b)));
    let ready = false;
    for (let n = 0; n < 100; n++) {
      if (backend.exitCode !== null) throw Error('Isolated backend exited');
      try { if ((await fetch(`http://127.0.0.1:${apiPort}/health`)).ok) { ready = true; break; } } catch {}
      await new Promise(r => setTimeout(r, 100));
    }
    assert.ok(ready);
    const host = `const {app,session}=require('electron');const fs=require('node:fs'),path=require('node:path');
app.whenReady().then(()=>session.defaultSession.protocol.handle('http',async req=>{
const u=new URL(req.url);if(u.hostname!=='127.0.0.1')return new Response('blocked',{status:403});
if(u.port==='5179'){const web=${JSON.stringify(path.join(ROOT, 'dist'))};const file=path.resolve(web,'.'+decodeURIComponent(u.pathname==='/'?'/index.html':u.pathname));
if(!file.startsWith(web+path.sep)||!fs.existsSync(file))return new Response('not found',{status:404});
const mime=file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html';return new Response(fs.readFileSync(file),{headers:{'content-type':mime+'; charset=utf-8'}});}
if(u.port==='8019'){const ct=req.headers.get('content-type');const body=['GET','HEAD'].includes(req.method)?undefined:Buffer.from(await req.arrayBuffer());
if(globalThis.rosterUnavailable&&u.pathname==='/api/students'&&req.method==='GET')return new Response('{"detail":"synthetic unavailable"}',{status:503,headers:{'content-type':'application/json','access-control-allow-origin':'http://127.0.0.1:5179'}});
const res=await fetch('http://127.0.0.1:18019'+u.pathname+u.search,{method:req.method,headers:ct?{'content-type':ct}:{},body});
return new Response(await res.arrayBuffer(),{status:res.status,headers:{...Object.fromEntries(res.headers),'access-control-allow-origin':'http://127.0.0.1:5179'}});}
return new Response('blocked',{status:403});}));require(${JSON.stringify(path.join(ROOT, 'desktop/main.cjs'))});`;
    await writeFile(path.join(OUT, 'host.cjs'), host);
    desktop = await _electron.launch({ executablePath: require('electron'), args: [path.join(OUT, 'host.cjs')], env, timeout: 45000 });
    page = await desktop.firstWindow();
  }
  page.setDefaultTimeout(7000); page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => { const url = new URL(request.url()); if (url.pathname.startsWith('/api/')) requests.push({ path: url.pathname, method: request.method() }); });

  await check('Empty home shows add-student guidance and collapsed AI settings', async () => {
    await page.getByTestId('student-list-empty').waitFor();
    assert.equal(await page.getByLabel('API密钥', { exact: true }).isVisible(), false);
    await page.getByRole('button', { name: '添加学生', exact: true }).waitFor();
  });
  const first = (await api('/api/students', { name: '王小明', class_name: '九年级一班', confirm_new: true })).student;
  const other = (await api('/api/students', { name: '李小雨', class_name: '九年级二班', confirm_new: true })).student;
  const duplicate = (await api('/api/students', { name: '王小明', class_name: '九年级二班', confirm_new: true })).student;
  for (let n = 1; n <= 25; n++) await api('/api/students', { name: '合成同学' + n, confirm_new: true });
  const firstMath = await assignment(first, 'math', '3', 'first-math');
  const firstEnglish = await assignment(first, 'english', '5', 'first-english');
  const otherMath = await assignment(other, 'math', '8', 'other-math');
  await page.reload(); await page.getByTestId('health').filter({ hasText: '后端已连接' }).waitFor();

  await check('First screen exposes four subjects and clickable scrollable students without search', async () => {
    const list = page.getByTestId('student-list'); await list.getByRole('button').last().waitFor();
    assert.equal(await list.getByRole('button').count(), 28);
    const height = await page.evaluate(() => innerHeight);
    for (const id of ['math', 'english', 'physics', 'chemistry']) {
      const box = await page.getByTestId('subject-' + id).boundingBox();
      assert.ok(box && box.y >= 0 && box.y + box.height <= height);
    }
    const box = await list.boundingBox(); assert.ok(box && box.y < height * 0.65 && box.y + box.height < height);
    assert.ok(await list.evaluate(e => e.scrollHeight > e.clientHeight && ['auto', 'scroll'].includes(getComputedStyle(e).overflowY)));
    assert.equal(await page.getByLabel('API地址', { exact: true }).isVisible(), false);
    await page.screenshot({ path: path.join(OUT, '01-home.png') });
  });
  await check('One click selects student and shows that student’s actual math archive', async () => {
    const before = requests.length; await choose(first);
    await page.getByLabel('学习作业').locator(`option[value="${firstMath}"]`).waitFor({ state: 'attached' });
    assert.equal(await page.getByLabel('学习作业').locator(`option[value="${otherMath}"]`).count(), 0);
    assert.equal(requests.slice(before).filter(r => r.method === 'POST').length, 0);
    await page.screenshot({ path: path.join(OUT, '02-selected.png') });
  });
  await check('Switching subjects and students never displays the previous student’s assignment', async () => {
    await page.getByTestId('subject-english').click();
    await page.getByLabel('学习作业').locator(`option[value="${firstEnglish}"]`).waitFor({ state: 'attached' });
    assert.equal(await page.getByLabel('学习作业').locator(`option[value="${firstMath}"]`).count(), 0);
    await page.getByTestId('subject-math').click(); await choose(other);
    await page.getByLabel('学习作业').locator(`option[value="${otherMath}"]`).waitFor({ state: 'attached' });
    assert.equal(await page.getByLabel('学习作业').locator(`option[value="${firstMath}"]`).count(), 0);
  });
  await check('Typing filters immediately, clearing restores all students, same names remain distinguishable', async () => {
    const search = page.getByLabel('筛选学生', { exact: true }); await search.fill('王小明');
    const list = page.getByTestId('student-list'); assert.equal(await list.getByRole('button').count(), 2);
    assert.match(await list.innerText(), /九年级一班/); assert.match(await list.innerText(), /九年级二班/);
    await choose(duplicate); assert.match(await page.getByTestId('current-student').innerText(), /九年级二班/);
    await search.fill('不存在的学生'); await page.getByTestId('student-filter-empty').waitFor();
    await page.getByRole('button', { name: '清除筛选', exact: true }).click();
    assert.equal(await list.getByRole('button').count(), 28);
  });
  await check('Roster scroll reaches late students and supports direct selection', async () => {
    const last = page.getByTestId('student-list').getByRole('button').filter({ hasText: '合成同学25' });
    await last.scrollIntoViewIfNeeded(); await last.click();
    await page.getByTestId('current-student').filter({ hasText: '合成同学25' }).waitFor();
    assert.ok(await page.getByTestId('student-list').evaluate(e => e.scrollTop > 0));
  });
  await check('Settings open only by button; Escape returns focus; Agent opens independently', async () => {
    await page.evaluate(() => scrollTo(0, 0));
    const open = page.getByRole('button', { name: 'AI 服务设置', exact: true }); await open.click();
    const dialog = page.getByRole('dialog', { name: 'AI 服务设置', exact: true }); await dialog.waitFor();
    await dialog.getByLabel('API地址', { exact: true }).waitFor();
    await dialog.getByRole('button', { name: '配置并测试文字连接', exact: true }).waitFor();
    await page.screenshot({ path: path.join(OUT, '03-settings.png') });
    await page.keyboard.press('Escape'); await dialog.waitFor({ state: 'hidden' });
    assert.ok(await open.evaluate(e => e === document.activeElement));
    const opening = desktop.waitForEvent('window'); await page.getByRole('button', { name: '打开 AI Agent', exact: true }).click();
    const agent = await opening; await agent.getByRole('heading', { name: 'AI Agent', exact: true }).waitFor();
    await agent.close();
  });
  if (!exe) await check('Connection test still works through the settings dialog with a local fake transport', async () => {
    await page.getByRole('button', { name: 'AI 服务设置', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'AI 服务设置', exact: true });
    await dialog.getByLabel('API地址', { exact: true }).fill('https://example.invalid/v1');
    await dialog.getByLabel('API密钥', { exact: true }).fill('synthetic-ui-test-only');
    await dialog.getByRole('button', { name: '配置并测试文字连接', exact: true }).click();
    await dialog.getByTestId('provider-status').filter({ hasText: '文字连接成功' }).waitFor();
    assert.equal(await dialog.getByLabel('API密钥', { exact: true }).inputValue(), '');
    await dialog.getByRole('button', { name: '清除密钥与本机保存项', exact: true }).click();
    await dialog.getByTestId('provider-status').filter({ hasText: '恢复本地模拟' }).waitFor();
    await dialog.getByRole('button', { name: '关闭设置', exact: true }).click();
  });
  if (!exe) await check('Roster load failure is distinct from no students and can be retried', async () => {
    await desktop.evaluate(() => { globalThis.rosterUnavailable = true; });
    await page.reload(); await page.getByTestId('student-list-error').waitFor();
    assert.equal(await page.getByTestId('student-list-empty').count(), 0);
    await desktop.evaluate(() => { globalThis.rosterUnavailable = false; });
    await page.getByRole('button', { name: '重试读取学生', exact: true }).click();
    await page.getByTestId('student-list').getByRole('button').last().waitFor();
    assert.equal(await page.getByTestId('student-list').getByRole('button').count(), 28);
  });
  await check('A newly created student appears immediately and remains listed after reload', async () => {
    await page.getByRole('button', { name: '添加学生', exact: true }).click();
    await page.getByLabel('学生称呼', { exact: true }).fill('新增测试生');
    await page.getByRole('button', { name: '选择或查找', exact: true }).click();
    await page.getByRole('button', { name: '新建 新增测试生', exact: true }).click();
    await page.getByTestId('student-list').getByRole('button').filter({ hasText: '新增测试生' }).waitFor();
    await page.reload(); await page.getByTestId('student-list').getByRole('button').filter({ hasText: '新增测试生' }).waitFor();
  });
  await check('Narrow window retains subject/student entry and settings controls without horizontal overflow', async () => {
    await page.setViewportSize({ width: 540, height: 780 }); await page.evaluate(() => scrollTo(0, 0));
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    assert.ok((await page.getByTestId('student-list').boundingBox()).y < 600);
    await page.getByRole('button', { name: 'AI 服务设置', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'AI 服务设置', exact: true });
    assert.ok(await dialog.evaluate(e => e.scrollWidth <= e.clientWidth));
    await page.screenshot({ path: path.join(OUT, '04-settings-narrow.png') });
    await dialog.getByRole('button', { name: '关闭设置', exact: true }).click();
  });
  assert.deepEqual(errors, []); checks.push({ name: 'No uncaught renderer errors', status: 'PASS' });
} catch (error) { checks.push({ name: 'verification harness', status: 'FAIL', error: String(error) }); console.error(error); }
finally {
  if (desktop) await desktop.close();
  if (backend && backend.exitCode === null) await new Promise(resolve => {
    const killer = spawn('taskkill.exe', ['/PID', String(backend.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
    killer.once('exit', resolve); killer.once('error', resolve);
  });
  await writeFile(path.join(OUT, 'result.json'), JSON.stringify({ scope: exe ? 'PACKAGED_SYNTHETIC_HOME' : 'ISOLATED_ELECTRON_SYNTHETIC_HOME', exe, checks, errors,
    limitation: exe ? 'No real provider test or teacher usability acceptance' : 'Real source backend + release web + desktop entry; provider transport synthetic only' }, null, 2));
  await writeFile(path.join(OUT, 'services.log'), logs.join('')); console.log('Evidence:', OUT);
  if (checks.some(c => c.status === 'FAIL')) process.exitCode = 1;
}
