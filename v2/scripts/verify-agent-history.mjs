// Actual Electron + HTTP + SQLite + MD. Only the external model transport is scripted.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, writeFile, readFile, copyFile, readdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { createServer } from 'node:net';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { _electron } from 'playwright-core';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, '.qa-temp', 'agent-history', String(Date.now()));
const WEB = path.join(ROOT, 'dist');
const require = createRequire(import.meta.url);
const checks = [], errors = [], requests = [], logs = [];
const env = { ...process.env, PYTHONUTF8: '1', PYTHONDONTWRITEBYTECODE: '1', JINXUE_HOME: path.join(OUT, 'profile') };
env.JINXUE_PROVIDER_CONFIG_PATH = path.join(OUT, 'isolated-provider.dpapi');
delete env.ELECTRON_RUN_AS_NODE;
let backend, desktop, main, agent, fixture;
async function api(endpoint, body) {
  const response = await fetch('http://127.0.0.1:18019' + endpoint, body === undefined ? undefined : {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  });
  assert.ok(response.ok, await response.clone().text()); return response.json();
}
async function check(name, action) {
  try { await action(); checks.push({ name, status: 'PASS' }); console.log('PASS', name); }
  catch (error) { checks.push({ name, status: 'FAIL', error: String(error) }); console.error('FAIL', name, error);
    await agent?.screenshot({ path: path.join(OUT, `failure-${checks.length}.png`) }).catch(() => {}); }
}
async function openAgent() {
  const opening = desktop.waitForEvent('window');
  await main.getByRole('button', { name: '打开 AI Agent', exact: true }).click();
  agent = await opening; agent.setDefaultTimeout(15000);
  agent.on('pageerror', error => errors.push(error.message));
  agent.on('request', r => { if (r.url().includes('/api/chat')) requests.push(JSON.parse(r.postData())); });
  await agent.getByTestId('health').filter({ hasText: '后端已连接' }).waitFor();
  await agent.waitForFunction(() => !document.querySelector('[aria-label="消息"]')?.disabled);
  await agent.getByTestId('history-access').locator('summary').click();
}
async function send(text) {
  await agent.getByRole('textbox', { name: '消息', exact: true }).fill(text);
  await agent.getByRole('button', { name: '发送', exact: true }).click();
  await agent.waitForFunction(() => !document.querySelector('[data-testid="task-status"]')?.textContent.includes('正在处理'));
}
try {
  await mkdir(OUT, { recursive: true });
  await new Promise((resolve, reject) => { const server = createServer(); server.once('error', reject);
    server.listen(18019, '127.0.0.1', () => server.close(resolve)); });
  backend = spawn(path.join(ROOT, '.venv/Scripts/python.exe'), ['-X', 'utf8', '-B', 'backend/verify_history_server.py', OUT],
    { cwd: ROOT, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  backend.stdout.on('data', d => logs.push(String(d))); backend.stderr.on('data', d => logs.push(String(d)));
  let ready = false;
  for (let n = 0; n < 150; n++) {
    if (backend.exitCode !== null) throw Error('Isolated backend exited: ' + logs.join(''));
    try { if ((await fetch('http://127.0.0.1:18019/health')).ok) { ready = true; break; } } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.ok(ready);
  fixture = JSON.parse(await readFile(path.join(OUT, 'fixtures.json'), 'utf8'));
  const blobs = {};
  for (const name of await readdir(path.join(fixture.archive, 'objects'))) {
    blobs[name] = createHash('sha256').update(await readFile(path.join(fixture.archive, 'objects', name))).digest('hex');
  }
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
  main = await desktop.firstWindow(); main.setDefaultTimeout(15000); main.on('pageerror', e => errors.push(e.message));
  await main.getByTestId('health').filter({ hasText: '后端已连接' }).waitFor();
  await main.getByTestId('student-list').getByRole('button').filter({ hasText: fixture.student.name }).click();
  await main.getByLabel('学习作业', { exact: true }).selectOption(fixture.new.assignment_id);
  await check('Selected assignment enters actual independent Agent; permissions default off', async () => {
    await openAgent();
    assert.equal(await agent.getByLabel('Agent分析作业', { exact: true }).inputValue(), fixture.new.assignment_id);
    assert.equal(await agent.getByLabel('授权读取当前学生本科历史').isChecked(), false);
    assert.equal(await agent.getByLabel('授权按需读取归档原图').isChecked(), false);
    assert.equal(await agent.getByLabel('授权保存历史分析笔记').isChecked(), false);
  });
  await check('Without grants archived analysis gives guidance and never reaches provider', async () => {
    const start = requests.length;
    await send('请分析已归档的这份作业第5题');
    await agent.locator('.message').filter({ hasText: /请重新选择.*图片/ }).waitFor();
    assert.equal(requests.length, start);
  });
  await check('Granted analysis executes history, specific questions, one original, and pending MD', async () => {
    await agent.getByLabel('授权读取当前学生本科历史').check();
    await agent.getByLabel('授权按需读取归档原图').check();
    await agent.getByLabel('授权保存历史分析笔记').check();
    await send('请分析已归档的这份作业第5题与以前二次函数错题的联系，保存待确认笔记');
    await agent.getByTestId('agent-receipt').filter({ hasText: '已写入并回读' }).waitFor();
    await agent.locator('.message').filter({ hasText: '历史原图未读取。仅合成传输测试' }).waitFor();
    const payload = requests.at(-1);
    assert.equal(payload.assignment_id, fixture.new.assignment_id);
    assert.equal(payload.images.length, 0);
    assert.ok(payload.allow_history && payload.allow_originals && payload.allow_save);
    const calls = JSON.parse(await readFile(path.join(OUT, 'model-requests.json'), 'utf8'));
    assert.equal(calls.length, 4);
    assert.ok(!JSON.stringify(calls[0]).includes('data:image'));
    const toolReads = calls[2].messages.filter(m => m.role === 'tool').map(m => JSON.parse(m.content));
    const structured = JSON.stringify(toolReads);
    assert.ok(structured.includes(fixture.old.assignment_id) && structured.includes('二次函数顶点式'));
    assert.ok(!structured.includes(fixture.foreign.assignment_id) && !structured.includes(fixture.english.assignment_id));
    assert.ok(!JSON.stringify(calls).includes('合成学生A'));
    const images = calls[2].messages.flatMap(m => Array.isArray(m.content) ? m.content.filter(p => p.type === 'image_url') : []);
    assert.equal(images.length, 1);
    const notes = await api(`/api/students/${fixture.student.id}/subjects/math/agent-notes`);
    assert.equal(notes.notes.length, 1);
    const md = notes.notes[0].markdown;
    for (const expected of ['AI_PENDING_REVIEW', fixture.old.assignment_id, fixture.new.assignment_id, '第3题', '第5题', '实际读取来源', fixture.new.files[0].sha256, '历史原图未读取']) assert.ok(md.includes(expected), expected);
    await writeFile(path.join(OUT, 'pending-note.md'), md);
    await copyFile(path.join(fixture.archive, 'objects', fixture.old.files[0].sha256), path.join(OUT, 'old-Q3.png'));
    await copyFile(path.join(fixture.archive, 'objects', fixture.new.files[0].sha256), path.join(OUT, 'current-Q5.png'));
    await agent.screenshot({ path: path.join(OUT, 'agent-history-result.png'), fullPage: true });
  });
  await check('Revoking read grants prevents previous historical replies being resent', async () => {
    await agent.getByLabel('授权读取当前学生本科历史').uncheck();
    await agent.getByLabel('授权按需读取归档原图').uncheck();
    await agent.getByLabel('授权保存历史分析笔记').uncheck();
    const previous = requests.length;
    await send('请解释上下对称的意思');
    assert.equal(requests.length, previous + 1, 'follow-up must actually reach the provider adapter');
    const calls = JSON.parse(await readFile(path.join(OUT, 'model-requests.json'), 'utf8'));
    const last = calls.at(-1);
    assert.ok(!JSON.stringify(last.messages).includes(fixture.old.assignment_id), 'revoked historical reply must not be resent');
    assert.deepEqual(requests.at(-1).history, []);
    assert.ok(!last.tools.some(t => ['search_student_history', 'read_assignment', 'read_assignment_image'].includes(t.function.name)));
  });
  await check('Teacher records and original hashes unchanged; pending note survives window reopening', async () => {
    const after = await api(`/api/learning/workspace?student_id=${fixture.student.id}&subject=math`);
    await writeFile(path.join(OUT, 'workspace-after.json'), JSON.stringify(after, null, 2));
    assert.deepEqual(after, JSON.parse(await readFile(path.join(OUT, 'workspace-before.json'), 'utf8')));
    for (const [name, digest] of Object.entries(blobs)) assert.equal(createHash('sha256').update(await readFile(path.join(fixture.archive, 'objects', name))).digest('hex'), digest);
    await agent.close(); await openAgent();
    assert.equal(await agent.getByLabel('授权读取当前学生本科历史').isChecked(), false);
    await agent.locator('details.agent-archive > summary').click();
    await agent.getByText('本地AI待确认笔记（1）', { exact: true }).click();
    await agent.getByTestId('agent-note').filter({ hasText: '实际读取来源' }).waitFor();
    await agent.screenshot({ path: path.join(OUT, 'persisted-note.png'), fullPage: true });
  });
  await check('Subject/student switches revoke grants and previous assignment context', async () => {
    await agent.getByLabel('授权读取当前学生本科历史').check();
    await agent.getByLabel('授权按需读取归档原图').check();
    await agent.getByTestId('subject-english').click();
    await agent.waitForFunction(() => !document.querySelector('[aria-label="授权读取当前学生本科历史"]')?.checked);
    assert.equal(await agent.getByLabel('授权按需读取归档原图').isChecked(), false);
    assert.equal(await agent.getByLabel('Agent分析作业', { exact: true }).inputValue(), '');
    await agent.getByLabel('授权读取当前学生本科历史').check();
    await agent.getByLabel('学生称呼', { exact: true }).fill(fixture.other.name);
    await agent.getByRole('button', { name: '选择或查找', exact: true }).click();
    await agent.getByTestId('current-student').filter({ hasText: fixture.other.name }).waitFor();
    assert.equal(await agent.getByLabel('授权读取当前学生本科历史').isChecked(), false);
    assert.equal(await agent.getByLabel('Agent分析作业', { exact: true }).inputValue(), '');
  });
  await check('No renderer uncaught errors', async () => assert.deepEqual(errors, []));
} catch (error) { checks.push({ name: 'harness', status: 'FAIL', error: String(error) }); console.error(error); }
finally {
  if (desktop) await desktop.close();
  if (backend && backend.exitCode === null) await new Promise(resolve => {
    const killer = spawn('taskkill.exe', ['/PID', String(backend.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
    killer.once('exit', resolve); killer.once('error', resolve);
  });
  await writeFile(path.join(OUT, 'result.json'), JSON.stringify({ scope: 'ACTUAL_ELECTRON_LOCAL_RECORDS_MOCK_EXTERNAL_MODEL',
    limitations: 'No real model, real student, packaged EXE or teacher usability validation. Mock selects known tool calls; real local tools and storage execute.', checks, requests, errors }, null, 2));
  await writeFile(path.join(OUT, 'services.log'), logs.join(''));
  console.log('Evidence:', OUT);
  if (checks.some(c => c.status === 'FAIL')) process.exitCode = 1;
}
