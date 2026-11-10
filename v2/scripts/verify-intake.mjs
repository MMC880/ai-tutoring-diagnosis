// Real Electron UI and local HTTP/SQLite; synthetic materials, no model or key.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { createServer } from 'node:net';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { _electron } from 'playwright-core';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, '.qa-temp', 'intake', String(Date.now()));
const require = createRequire(import.meta.url);
const env = { ...process.env, PYTHONUTF8: '1', PYTHONDONTWRITEBYTECODE: '1' };
delete env.ELECTRON_RUN_AS_NODE;
const children = [], logs = [], checks = [], errors = [];
let desktop;
function pass(name) { checks.push({ name, status: 'PASS' }); console.log('PASS', name); }
function launch(command, args) {
  const child = spawn(command, args, { cwd: ROOT, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout.on('data', d => logs.push(String(d))); child.stderr.on('data', d => logs.push(String(d)));
  children.push(child); return child;
}
async function ready(url, child) {
  for (let n = 0; n < 100; n++) {
    if (child.exitCode !== null) throw Error('Test service exited');
    try { if ((await fetch(url, { signal: AbortSignal.timeout(1000) })).ok) return; } catch {}
    await new Promise(r => setTimeout(r, 200));
  }
  throw Error('Service timeout');
}
async function send(page, text) {
  await page.getByRole('textbox', { name: '消息', exact: true }).fill(text);
  await page.getByRole('button', { name: '发送', exact: true }).click();
}
async function drop(page, names) {
  const payload = await Promise.all(names.map(async name => ({ name, data: (await readFile(path.join(OUT, name))).toString('base64') })));
  const transfer = await page.evaluateHandle(items => {
    const dt = new DataTransfer();
    for (const { name, data } of items) dt.items.add(new File([Uint8Array.from(atob(data), c => c.charCodeAt(0))], name,
      { type: name.endsWith('.pdf') ? 'application/pdf' : 'image/jpeg' }));
    return dt;
  }, payload);
  await page.getByTestId('dropzone').dispatchEvent('drop', { dataTransfer: transfer });
  await page.getByTestId('intake-file').last().waitFor();
  await page.waitForFunction(n => document.querySelectorAll('[data-testid="intake-file"]').length === n, names.length);
}
try {
  await mkdir(OUT, { recursive: true });
  for (const port of [8019, 5179]) await new Promise((resolve, reject) => {
    const server = createServer(); server.once('error', reject); server.listen(port, '127.0.0.1', () => server.close(resolve));
  });
  const setup = launch(path.join(ROOT, '.venv/Scripts/python.exe'), ['-X', 'utf8', '-c',
    "import sys; from pathlib import Path; from PIL import Image; from pypdf import PdfWriter; p=Path(sys.argv[1]); [(Image.new('RGB',(80,60),c).save(p/f'p{i+1}.jpg')) for i,c in enumerate(['white','blue','red'])]; w=PdfWriter(); w.add_blank_page(width=300,height=400); w.add_blank_page(width=300,height=400); w.write(str(p/'paper.pdf')); (p/'broken.jpg').write_bytes(b'synthetic-unreadable-original')", OUT]);
  assert.equal(await new Promise(r => setup.once('exit', r)), 0);
  const backend = launch(path.join(ROOT, '.venv/Scripts/python.exe'), ['-X', 'utf8', '-B', '-c',
    "import sys; from pathlib import Path; import uvicorn; from backend.main import create_app; p=Path(sys.argv[1]); uvicorn.run(create_app(p/'probe.sqlite3',p/'archive'),host='127.0.0.1',port=8019,access_log=False)", OUT]);
  await ready('http://127.0.0.1:8019/health', backend);
  const vite = launch(process.execPath, [path.join(ROOT, 'node_modules/vite/bin/vite.js'), '--host', '127.0.0.1', '--port', '5179', '--strictPort']);
  await ready('http://127.0.0.1:5179', vite);
  desktop = await _electron.launch({ executablePath: require('electron'), args: [ROOT], env, timeout: 45000 });
  const main = await desktop.firstWindow();
  const opening = desktop.waitForEvent('window');
  await main.getByRole('button', { name: '打开 AI Agent', exact: true }).click();
  let agent = await opening; agent.on('pageerror', e => errors.push(e.message));
  agent.setDefaultTimeout(12000);
  await agent.getByRole('heading', { name: 'AI Agent', exact: true }).waitFor();
  await drop(agent, ['p1.jpg', 'p2.jpg', 'p3.jpg']);
  await agent.screenshot({ path: path.join(OUT, '01-files.png') });
  pass('Three dropped photos have named, removable file previews');
  let chatCalls = 0; agent.on('request', req => { if (req.url().endsWith('/api/chat')) chatCalls++; });
  await send(agent, '这是九年级一班学生 A 今天的数学作业，帮我归档。错题是第3、5、8题。');
  await agent.getByTestId('intake-clarification').waitFor();
  const saved = agent.waitForResponse(r => r.url().endsWith('/api/intake/resolve'));
  await agent.getByRole('button', { name: '新建档案并继续归档', exact: true }).click();
  const response = await saved; assert.equal(response.status(), 200);
  const result = await response.json(); assert.equal(result.status, 'SAVED');
  const receipt = result.receipt;
  await agent.getByTestId('intake-receipt').filter({ hasText: '教师明确错题3道' }).waitFor();
  assert.deepEqual(receipt.questions, ['3', '5', '8']); assert.equal(chatCalls, 0);
  assert.equal(await agent.locator('.message').count(), 2, 'Receipt must not erase conversation on identity resolution');
  for (const file of receipt.files) {
    const original = await readFile(path.join(OUT, file.original_name));
    const actual = await readFile(path.join(OUT, 'archive', file.relative_path));
    assert.ok(actual.equals(original)); assert.equal(createHash('sha256').update(actual).digest('hex'), file.sha256);
  }
  pass('Teacher instruction -> one new-student confirmation -> real originals/SQLite/Markdown receipt, no model');
  await send(agent, '学生A最近一个月错过哪些题？');
  await agent.locator('.message').filter({ hasText: '最近30天' }).waitFor();
  assert.equal(chatCalls, 0); pass('History query uses actual local records without sending archive to model');
  await drop(agent, ['p1.jpg', 'p2.jpg', 'p3.jpg']);
  await send(agent, '学生A今天的数学作业，帮我归档，第3、5、8题错。');
  await agent.getByTestId('intake-receipt').filter({ hasText: '未新建作业或错题' }).waitFor();
  pass('Repeated upload is visibly disclosed and does not duplicate assignments');
  await agent.getByRole('button', { name: '清除本组材料', exact: true }).click();
  await drop(agent, ['paper.pdf', 'broken.jpg']);
  await agent.getByTestId('intake-file').filter({ hasText: '2页' }).waitFor();
  await agent.getByTestId('intake-file').filter({ hasText: '仍可归档原件' }).waitFor();
  await send(agent, '学生A的数学作业，帮我归档，第9题错。');
  await agent.getByTestId('intake-receipt').filter({ hasText: '作业日期：待补' }).waitFor();
  pass('PDF page count and unreadable preview are shown; originals still archive with date pending');
  await agent.setViewportSize({ width: 390, height: 600 });
  const box = await agent.getByRole('textbox', { name: '消息', exact: true }).boundingBox();
  assert.ok(box && box.y + box.height <= 600);
  assert.ok(await agent.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await agent.screenshot({ path: path.join(OUT, '02-receipt-compact.png') });
  pass('Compact window keeps input and receipt accessible');
  await agent.close();
  const reopening = desktop.waitForEvent('window');
  await main.getByRole('button', { name: '打开 AI Agent', exact: true }).click();
  agent = await reopening;
  await agent.locator('summary').filter({ hasText: '学生档案' }).click();
  await agent.getByRole('textbox', { name: '学生称呼', exact: true }).fill('A');
  await agent.getByRole('button', { name: '选择或查找', exact: true }).click();
  await agent.getByTestId('latest-summary').filter({ hasText: '第9题错' }).waitFor();
  await send(agent, '最近一个月错过哪些题');
  await agent.locator('.message').filter({ hasText: '另有1份日期待补' }).waitFor();
  assert.deepEqual(errors, []);
  pass('Reopened Agent reads durable archive; undated material excluded from monthly count; no renderer errors');
  // Observe actual renderer request payloads; the reply transport is deliberately mocked.
  const modelRequests = [];
  await agent.route('**/api/chat', async route => {
    modelRequests.push(route.request().postDataJSON());
    await route.fulfill({ json: { text: '本地验证回复：已收到' } });
  });
  await agent.getByTestId('import-latest').click();
  await agent.getByRole('checkbox', { name: '允许保存AI待确认笔记', exact: true }).check();
  await send(agent, '学生A私有分析标记ALPHA，仅讨论此材料');
  await agent.waitForFunction(() => document.querySelectorAll('.message').length >= 4);
  assert.equal(modelRequests.length, 1);
  assert.ok(modelRequests[0].imported_summary.includes('第9题'));
  assert.equal(modelRequests[0].allow_save, true);
  await drop(agent, ['p1.jpg']);
  await send(agent, '学生B的数学作业，帮我归档，第7题错。');
  await agent.getByTestId('intake-clarification').waitFor();
  await agent.getByRole('button', { name: '新建档案并继续归档', exact: true }).click();
  await agent.getByTestId('intake-receipt').filter({ hasText: 'B · 数学' }).waitFor();
  await send(agent, '这是学生B的新分析请求BETA');
  await agent.waitForFunction(() => !document.querySelector('button[aria-label="Cancel"]'));
  for (let n = 0; n < 50 && modelRequests.length < 2; n++) await new Promise(r => setTimeout(r, 100));
  assert.equal(modelRequests.length, 2);
  const newScope = modelRequests[1];
  assert.equal(newScope.imported_summary, '');
  assert.equal(newScope.allow_save, false);
  assert.ok(!JSON.stringify(newScope.history).includes('ALPHA'), 'Previous student analysis must not leave in new scope');
  assert.deepEqual(newScope.history, [], 'Local archive receipts and previous model turns stay local');
  pass('Cross-student archive retains screen receipt but clears imported summary/save permission and model history');
} catch (error) {
  checks.push({ name: 'intake verification', status: 'FAIL', details: String(error) }); console.error(error); process.exitCode = 1;
} finally {
  if (desktop) await desktop.close();
  for (const child of children) if (child.exitCode === null) await new Promise(resolve => {
    const kill = spawn('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
    kill.on('exit', resolve); kill.on('error', resolve);
  });
  await writeFile(path.join(OUT, 'result.json'), JSON.stringify({ transport: 'LOCAL_NO_MODEL', checks, errors }, null, 2));
  await writeFile(path.join(OUT, 'services.log'), logs.join(''));
  console.log('Evidence:', OUT);
}
