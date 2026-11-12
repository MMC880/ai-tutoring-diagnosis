// Actual packaged desktop, isolated current-user DPAPI file, synthetic credential only.
import assert from 'node:assert/strict';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { createServer } from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { _electron } from 'playwright-core';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, '.qa-temp/provider-restart', String(Date.now()));
const exe = path.resolve(process.argv[2]);
const realSaved = process.argv.includes('--saved-real-config');
const env = { ...process.env, JINXUE_HOME: path.join(OUT, 'profile'), JINXUE_DATA_DIR: path.join(OUT, 'archive') };
delete env.ELECTRON_RUN_AS_NODE;
if (!realSaved) env.JINXUE_PROVIDER_CONFIG_PATH = path.join(OUT, 'secure/provider.dpapi');
else delete env.JINXUE_PROVIDER_CONFIG_PATH;
const checks = [], errors = [], network = [];
let desktop, page;
async function check(name, fn) { await fn(); checks.push({ name, status: 'PASS' }); console.log('PASS', name); }
async function start() {
  for (const port of [8019, 5179]) await new Promise((resolve, reject) => {
    const server = createServer(); server.once('error', reject);
    server.listen(port, '127.0.0.1', () => server.close(resolve));
  });
  desktop = await _electron.launch({ executablePath: exe, env, timeout: 90000 });
  page = await desktop.firstWindow(); page.setDefaultTimeout(15000);
  page.on('pageerror', e => errors.push(e.message));
  page.on('request', r => { if (r.url().includes('/api/provider')) network.push({ method: r.method(), url: r.url() }); });
  await page.getByTestId('health').filter({ hasText: '后端已连接' }).waitFor({ timeout: 30000 });
  await page.getByRole('button', { name: 'AI 服务设置', exact: true }).click();
}
async function stop() { await desktop.close(); desktop = null; }
async function state() { return (await fetch('http://127.0.0.1:8019/api/provider')).json(); }
try {
  await mkdir(OUT, { recursive: true });
  await start();
  if (!realSaved) {
    await check('Fresh packaged desktop has no stored Key', async () => {
      assert.equal((await state()).key_loaded, false);
      assert.equal((await state()).storage_available, true);
    });
    // Configure without probing a synthetic Key against any external service.
    const response = await fetch('http://127.0.0.1:8019/api/provider', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ base_url: 'https://example.org/v1', model: 'synthetic-model',
        api_key: 'synthetic-desktop-restart-key', remember: true }),
    });
    assert.ok(response.ok);
    await check('Saved ciphertext excludes synthetic plaintext', async () => {
      const raw = await readFile(env.JINXUE_PROVIDER_CONFIG_PATH);
      assert.equal(raw.includes(Buffer.from('synthetic-desktop-restart-key')), false);
    });
  } else {
    await check('Existing real configuration restored without input or automatic probe', async () => {
      assert.equal((await state()).key_loaded, true);
      assert.equal((await state()).connection, 'NOT_TESTED');
      assert.equal((await state()).storage_status, 'RESTORED');
    });
  }
  await stop(); await start();
  await check('New actual EXE and backend recover bound configuration', async () => {
    const s = await state(); assert.equal(s.key_loaded, true); assert.equal(s.config_saved, true);
    assert.equal(s.storage_status, 'RESTORED'); assert.equal(s.connection, 'NOT_TESTED');
    assert.equal(s.model, realSaved ? 'deepseek-v4.1-flash-1017' : 'synthetic-model');
    assert.equal(s.base_url, realSaved ? 'https://discovery-api.intern-ai.org.cn/v1' : 'https://example.org/v1');
    assert.equal(await page.getByLabel('API密钥', { exact: true }).inputValue(), '');
    await page.getByTestId('provider-storage').filter({ hasText: '已从本机Windows加密存储恢复配置' }).waitFor();
    await page.getByRole('button', { name: '测试当前连接（无需重输Key）', exact: true }).isEnabled().then(assert.ok);
    assert.equal(network.some(r => r.method === 'POST'), false);
  });
  if (realSaved) {
    // Explicit user-authorized no-student probe. Authentication failure is NOT a persistence failure.
    await page.getByRole('button', { name: '测试当前连接（无需重输Key）', exact: true }).click();
    await page.getByTestId('provider-status').filter({ hasText: /文字连接成功|HTTP|无法连接|超时|无效|未符合/ }).waitFor({ timeout: 90000 });
    const text = await page.getByTestId('provider-status').innerText();
    checks.push({ name: 'Real provider probe after desktop restart', status: text.startsWith('文字连接成功') ? 'PASS' : 'FAIL', result: text });
  }
  await page.screenshot({ path: path.join(OUT, 'restored-settings.png') });
  if (!realSaved) {
    await check('Clear button removes saved item and disables active Key', async () => {
      await page.getByRole('button', { name: '清除密钥与本机保存项', exact: true }).click();
      await page.getByTestId('provider-status').filter({ hasText: '密钥已清除' }).waitFor();
      assert.equal((await state()).key_loaded, false);
    });
    await stop(); await start();
    await check('Cleared Key stays absent after another real desktop restart', async () => {
      assert.equal((await state()).key_loaded, false);
    });
  }
  assert.deepEqual(errors, []);
} catch (e) { checks.push({ name: 'verification', status: 'FAIL', error: String(e) }); }
finally {
  if (desktop) await stop();
  await writeFile(path.join(OUT, 'result.json'), JSON.stringify({ exe, realSaved, checks, errors, requests: network,
    limits: 'Same Windows user, real process restart; not OS reboot or another machine. No student materials sent.' }, null, 2));
  console.log('Evidence:', OUT);
  if (checks.some(c => c.status === 'FAIL')) process.exitCode = 1;
}
