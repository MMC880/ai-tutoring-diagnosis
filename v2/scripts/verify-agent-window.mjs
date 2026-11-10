// Catches the missing AI-service entry, duplicate windows and duplicated settings page.
// Uses real Electron, preload, renderer and HTTP backend; no external provider calls.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { createServer } from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { _electron, chromium } from 'playwright-core';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, '.qa-temp/agent-window');
const require = createRequire(import.meta.url);
const env = { ...process.env, PYTHONUTF8: '1', PYTHONDONTWRITEBYTECODE: '1', JINXUE_VERIFY_MOCK: '1' };
delete env.ELECTRON_RUN_AS_NODE;
const checks = [], logs = [], errors = [];
const children = [];
let desktop, browser;
function pass(name, details) { checks.push({ name, status: 'PASS', details }); console.log('PASS', name); }
function launch(cmd, args) {
  const child = spawn(cmd, args, { cwd: ROOT, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout.on('data', data => logs.push(String(data)));
  child.stderr.on('data', data => logs.push(String(data)));
  children.push(child); return child;
}
async function ready(url, child) {
  for (let n = 0; n < 100; n++) {
    if (child.exitCode !== null) throw Error('Local test service exited');
    try { if ((await fetch(url, { signal: AbortSignal.timeout(1000) })).ok) return; } catch {}
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  throw Error('Local test service timeout');
}
try {
  await mkdir(OUT, { recursive: true });
  for (const port of [8019, 5179]) await new Promise((resolve, reject) => {
    const server = createServer(); server.once('error', reject);
    server.listen(port, '127.0.0.1', () => server.close(resolve));
  });
  const backend = launch(path.join(ROOT, '.venv/Scripts/python.exe'), ['-X', 'utf8', '-B', '-m', 'backend.verify_provider_server']);
  await ready('http://127.0.0.1:8019/health', backend);
  const vite = launch(process.execPath, [path.join(ROOT, 'node_modules/vite/bin/vite.js'), '--host', '127.0.0.1', '--port', '5179', '--strictPort']);
  await ready('http://127.0.0.1:5179', vite);
  desktop = await _electron.launch({ executablePath: require('electron'), args: [ROOT], env, timeout: 45000 });
  const main = await desktop.firstWindow(); main.on('pageerror', e => errors.push(e.message));
  await main.getByTestId('health').filter({ hasText: '后端已连接' }).waitFor();
  assert.equal(await main.getByRole('button', { name: '打开 AI Agent', exact: true }).count(), 1,
    'AI服务必须有一个打开独立Agent聊天窗口的按钮');
  pass('AI service has visible Agent entry');
  // Configure ONLY a local deterministic test transport, not a real provider.
  await main.getByRole('textbox', { name: 'API密钥', exact: true }).fill('local-mock-only-secret');
  await main.getByRole('button', { name: '配置并测试文字连接', exact: true }).click();
  await main.getByTestId('provider-status').filter({ hasText: '文字连接成功' }).waitFor();
  const name = '虚构窗口测试' + Date.now();
  await main.getByRole('textbox', { name: '学生称呼', exact: true }).fill(name);
  await main.getByRole('button', { name: '选择或查找', exact: true }).click();
  await main.getByRole('button', { name: '新建 ' + name, exact: true }).click();
  await main.getByTestId('current-student').filter({ hasText: name }).waitFor();
  await main.getByTestId('subject-physics').click();
  const opening = desktop.waitForEvent('window');
  await main.getByRole('button', { name: '打开 AI Agent', exact: true }).click();
  const agent = await opening; agent.on('pageerror', e => errors.push(e.message));
  await agent.getByRole('heading', { name: 'AI Agent', exact: true }).waitFor();
  await agent.getByTestId('agent-connection').filter({ hasText: '文字连接成功' }).waitFor();
  assert.equal(await agent.getByRole('textbox', { name: 'API密钥', exact: true }).count(), 0);
  assert.equal(await agent.getByRole('button', { name: '配置并测试文字连接', exact: true }).count(), 0);
  assert.equal(await agent.getByTestId('subject-physics').getAttribute('aria-pressed'), 'true');
  await agent.locator('summary').filter({ hasText: '学生档案' }).click();
  await agent.getByTestId('current-student').filter({ hasText: name }).waitFor();
  await agent.locator('summary').filter({ hasText: '学生档案' }).click();
  const geometry = await agent.getByRole('textbox', { name: '消息', exact: true }).boundingBox();
  const viewport = agent.viewportSize() ?? await agent.evaluate(() => ({ width: innerWidth, height: innerHeight }));
  assert.ok(geometry && geometry.y >= 0 && geometry.y + geometry.height <= viewport.height, 'Composer must be visible without scrolling');
  pass('Dedicated chat window shares configuration and explicit student/subject, composer visible');
  await agent.screenshot({ path: path.join(OUT, 'agent-empty.png') });
  const request = agent.waitForResponse(r => r.url().endsWith('/api/chat') && r.request().method() === 'POST');
  await agent.getByRole('textbox', { name: '消息', exact: true }).fill('桌面连接成功（合成测试，不保存）');
  await agent.getByRole('button', { name: '发送', exact: true }).click();
  const response = await request; assert.equal(response.status(), 200);
  const body = await response.json(); assert.equal(body.mode, 'provider'); assert.match(body.text, /桌面连接成功/);
  const payload = response.request().postDataJSON(); assert.equal(payload.subject, 'physics'); assert.ok(payload.student_id);
  assert.equal(payload.allow_save, false); assert.equal(payload.imported_summary, '');
  await agent.getByText('桌面连接成功。', { exact: true }).waitFor();
  pass('Independent Agent sends through configured backend without automatic archive import or save');
  await desktop.evaluate(({ BrowserWindow }) => { BrowserWindow.getAllWindows().find(w => w.isAlwaysOnTop()).minimize(); });
  await main.getByTestId('subject-english').click();
  for (let n = 0; n < 3; n++) await main.getByRole('button', { name: '打开 AI Agent', exact: true }).click();
  assert.equal(await agent.getByTestId('subject-physics').getAttribute('aria-pressed'), 'true', 'Existing chat must not silently switch student/subject');
  const native = await desktop.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().map(w => ({
    visible: w.isVisible(), minimized: w.isMinimized(), floating: w.isAlwaysOnTop(), url: w.webContents.getURL(), preferences: w.webContents.getLastWebPreferences(),
  })));
  assert.equal(native.length, 2); assert.ok(native.every(w => w.visible)); assert.ok(native.some(w => w.floating));
  assert.ok(native.every(w => !w.minimized));
  await agent.getByText('桌面连接成功。', { exact: true }).waitFor();
  for (const w of native) { assert.equal(w.preferences.sandbox, true); assert.equal(w.preferences.contextIsolation, true); assert.equal(w.preferences.nodeIntegration, false); }
  assert.equal(await agent.evaluate(() => typeof window.require), 'undefined');
  pass('Repeat clicks focus existing native window and preserve its chat; sandbox retained');
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64');
  const transfer = await agent.evaluateHandle(base64 => {
    const dt = new DataTransfer(); dt.items.add(new File([Uint8Array.from(atob(base64), c => c.charCodeAt(0))], 'synthetic.png', { type: 'image/png' })); return dt;
  }, png.toString('base64'));
  await agent.getByTestId('dropzone').dispatchEvent('drop', { dataTransfer: transfer });
  await agent.getByRole('img', { name: '测试图片：synthetic.png', exact: true }).waitFor();
  assert.ok(await agent.getByRole('img', { name: '测试图片：synthetic.png', exact: true }).evaluate(img => img.complete && img.naturalWidth === 1));
  const imageRequest = agent.waitForResponse(r => r.url().endsWith('/api/chat') && r.request().method() === 'POST');
  await agent.getByRole('textbox', { name: '消息', exact: true }).fill('图片接收测试，不保存');
  await agent.getByRole('button', { name: '发送', exact: true }).click();
  const imageResponse = await imageRequest; assert.equal(imageResponse.status(), 200);
  assert.equal(imageResponse.request().postDataJSON().images.length, 1);
  await agent.getByText('683917', { exact: true }).waitFor();
  pass('Agent image drop decodes, previews and sends attachment through local mock');
  await agent.screenshot({ path: path.join(OUT, 'agent-chat.png') });
  await main.screenshot({ path: path.join(OUT, 'ai-service-entry.png'), fullPage: true });
  const denied = await agent.evaluate(async () => {
    try { await window.jinxueDesktop.openAgent({ subject: 'math' }); return false; } catch { return true; }
  }); assert.equal(denied, true, 'Only trusted main window may open Agent');
  const invalid = await main.evaluate(async () => {
    try { await window.jinxueDesktop.openAgent({ subject: '../math' }); return false; } catch { return true; }
  }); assert.equal(invalid, true);
  const invalidStudent = await main.evaluate(async () => {
    try { await window.jinxueDesktop.openAgent({ subject: 'math', studentId: ['s001'] }); return false; } catch { return true; }
  }); assert.equal(invalidStudent, true);
  pass('IPC rejects Agent sender and invalid context; no filesystem bridge');
  await main.getByRole('button', { name: '清除本次密钥', exact: true }).click();
  await agent.getByTestId('agent-connection').filter({ hasText: '本地模拟' }).waitFor();
  pass('Open Agent receives provider configuration changes without a copied key');
  await agent.close();
  const reopening = desktop.waitForEvent('window');
  await main.getByRole('button', { name: '打开 AI Agent', exact: true }).click();
  const reopened = await reopening;
  await reopened.getByRole('heading', { name: 'AI Agent', exact: true }).waitFor();
  await reopened.waitForFunction(() => document.querySelector('[data-testid="subject-english"]')?.getAttribute('aria-pressed') === 'true');
  assert.equal(desktop.windows().length, 2);
  assert.equal(await reopened.locator('.message').count(), 0);
  pass('Closed Agent can reopen; unsaved conversation explicitly not persistent');
  await desktop.evaluate(({ Menu }) => { Menu.getApplicationMenu().items[0].submenu.items[0].click(); });
  assert.equal(desktop.windows().length, 2); pass('Menu entry also focuses singleton Agent');
  await reopened.setViewportSize({ width: 390, height: 600 });
  const compact = await reopened.getByRole('textbox', { name: '消息', exact: true }).boundingBox();
  assert.ok(compact && compact.y + compact.height <= 600);
  assert.equal(await reopened.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await reopened.screenshot({ path: path.join(OUT, 'agent-compact.png') });
  pass('Minimum-size chat retains visible input without horizontal overflow');
  browser = await chromium.launch({ executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true });
  const web = await browser.newPage();
  await web.goto('http://127.0.0.1:5179');
  const popup = web.waitForEvent('popup');
  await web.getByRole('button', { name: '打开 AI Agent', exact: true }).click();
  const webAgent = await popup;
  await webAgent.getByRole('heading', { name: 'AI Agent', exact: true }).waitFor();
  pass('Browser preview has usable separate chat fallback');
  assert.deepEqual(errors, []); pass('No uncaught renderer errors');
} catch (error) {
  checks.push({ name: 'Agent window verification', status: 'FAIL', details: String(error) }); console.error(error); process.exitCode = 1;
} finally {
  if (desktop) await desktop.close(); if (browser) await browser.close();
  for (const child of children) if (child.exitCode === null) await new Promise(resolve => {
    const killer = spawn('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
    killer.on('exit', resolve); killer.on('error', resolve);
  });
  await writeFile(path.join(OUT, 'result.json'), JSON.stringify({ time: new Date().toISOString(), transport: 'LOCAL_MOCK_NO_PROVIDER', checks, errors }, null, 2));
  await writeFile(path.join(OUT, 'services.log'), logs.join(''));
}
