// Real Electron UI + real local storage. No external model or student material.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { _electron } from 'playwright-core';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, '.qa-temp', 'learning', String(Date.now()));
const require = createRequire(import.meta.url);
const checks = [], children = [], logs = [];
const env = { ...process.env, PYTHONUTF8: '1', PYTHONDONTWRITEBYTECODE: '1', JINXUE_DESKTOP_TOKEN: 'synthetic-local-test-token' };
// Keep asynchronous event assertion failures inside the try/finally cleanup.
process.on('unhandledRejection', error => { logs.push(String(error)); });
delete env.ELECTRON_RUN_AS_NODE;
let desktop;
function pass(name) { checks.push({ name, status: 'PASS' }); console.log('PASS', name); }
function launch(cmd, args) {
  const child = spawn(cmd, args, { cwd: ROOT, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout.on('data', b => logs.push(String(b))); child.stderr.on('data', b => logs.push(String(b))); children.push(child); return child;
}
async function ready(url, child) {
  for (let i = 0; i < 120; i++) {
    if (child.exitCode !== null) throw Error('Service exited');
    try { if ((await fetch(url)).ok) return; } catch {}
    await new Promise(r => setTimeout(r, 200));
  } throw Error('Startup timeout');
}
async function api(url, data) {
  const res = await fetch('http://127.0.0.1:8019' + url, data === undefined ? undefined : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
  const body = await res.json(); assert.ok(res.ok, JSON.stringify(body)); return body;
}
async function downloadFile(page, label, filename) {
  await desktop.evaluate(({ session }, destination) => {
    globalThis.jinxueDownload = 'WAITING';
    session.defaultSession.once('will-download', (_event, item) => {
      item.setSavePath(destination);
      item.once('done', (_event, state) => { globalThis.jinxueDownload = state; });
    });
  }, path.join(OUT, filename));
  await page.getByRole('link', { name: label }).click();
  for (let i = 0; i < 100; i++) {
    const state = await desktop.evaluate(() => globalThis.jinxueDownload);
    if (state !== 'WAITING') { assert.equal(state, 'completed'); return; }
    await new Promise(r => setTimeout(r, 100));
  }
  throw Error('Electron download timeout');
}
try {
  await mkdir(OUT, { recursive: true });
  const backend = launch(path.join(ROOT, '.venv/Scripts/python.exe'), ['-X', 'utf8', '-B', '-c',
    "import sys; from pathlib import Path; import uvicorn; from backend.main import create_app; p=Path(sys.argv[1]); uvicorn.run(create_app(archive_root=p/'archive'),host='127.0.0.1',port=8019,access_log=False)", OUT]);
  await ready('http://127.0.0.1:8019/health', backend);
  const vite = launch(process.execPath, [path.join(ROOT, 'node_modules/vite/bin/vite.js'), '--host', '127.0.0.1', '--port', '5179', '--strictPort']);
  await ready('http://127.0.0.1:5179', vite);
  const student = (await api('/api/students', { name: '合成学生', class_name: '合成一班', confirm_new: true })).student;
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aFOsAAAAASUVORK5CYII=', 'base64');
  const form = new FormData(); form.set('student_id', student.id); form.set('request_id', 'learning-desktop'); form.set('instruction', '数学作业归档，第3题错'); form.append('files', new Blob([png]), 'synthetic.png');
  const archived = await fetch('http://127.0.0.1:8019/api/intake', { method: 'POST', body: form }).then(r => r.json());
  assert.equal(archived.status, 'SAVED');
  const a = archived.receipt;
  desktop = await _electron.launch({ executablePath: require('electron'), args: [ROOT], env });
  const page = await desktop.firstWindow(); page.setDefaultTimeout(12000);
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.getByRole('textbox', { name: '学生称呼', exact: true }).fill(student.name);
  await page.getByRole('button', { name: '选择或查找', exact: true }).click();
  await page.getByLabel('学习作业').selectOption(a.assignment_id);
  await page.getByLabel('问题题号').selectOption('3');
  await page.getByLabel('知识点', { exact: true }).fill('二次函数顶点式');
  await page.getByLabel('关联依据').fill('合成测试第3题顶点符号，非真实学生证据');
  await page.getByRole('button', { name: '保存候选', exact: true }).click();
  await page.getByRole('status').filter({ hasText: '已保存修订1' }).waitFor();
  let stats = await api(`/api/learning/analysis?student_id=${student.id}&subject=math`);
  assert.equal(stats.personal.patterns.length, 0);
  await page.getByRole('button', { name: '老师确认知识点', exact: true }).click();
  await page.getByTestId('feedback-panel').waitFor();
  stats = await api(`/api/learning/analysis?student_id=${student.id}&subject=math`);
  assert.equal(stats.personal.patterns[0].assignment_count, 1);
  assert.equal(stats.classroom.student_count, 1);
  pass('Desktop candidate -> teacher confirmation -> evidence-linked personal and class counts');
  await downloadFile(page, '下载原件核对', 'downloaded.png');
  assert.ok((await readFile(path.join(OUT, 'downloaded.png'))).equals(png));
  pass('Actual Electron download preserves original bytes');
  await page.getByRole('button', { name: '准备三级补练草稿' }).click();
  await page.getByRole('button', { name: '老师审核通过', exact: true }).click();
  await page.getByLabel('复测原答').fill('顶点(-1,-4)，对称轴x=-1');
  await page.getByLabel('复测结果').selectOption('CORRECT');
  await page.getByRole('checkbox', { name: '老师确认本次独立完成' }).check();
  await downloadFile(page, '下载学生单档题面（无解答）', 'practice.md');
  assert.ok(!(await readFile(path.join(OUT, 'practice.md'), 'utf8')).includes('(-1,-4)'));
  await page.getByRole('button', { name: '登记复测并保留历史' }).click();
  await page.getByText('复测记录（1）', { exact: true }).waitFor();
  pass('Reviewed A/B/C fixture -> answer-free download -> separate persisted retest');
  await page.locator('summary').filter({ hasText: '老师更正／补日期与缺页' }).click();
  await page.getByLabel('更正后错题号').fill('');
  await page.getByLabel('更正作业日期').fill('2026-11-10');
  await page.getByLabel('缺页说明').fill('第6页未提供');
  await page.getByLabel('更正理由').fill('合成复核：第3题实际正确');
  await page.getByRole('button', { name: '追加更正并更新统计' }).click();
  await page.getByLabel('问题题号').locator('option').filter({ hasText: '第3题' }).waitFor({ state: 'detached' });
  await page.getByTestId('feedback-panel').waitFor({ state: 'detached' });
  const workspace = await api(`/api/learning/workspace?student_id=${student.id}&subject=math`);
  assert.deepEqual(workspace.assignments[0].questions, []); assert.deepEqual(workspace.assignments[0].original_questions, ['3']);
  assert.equal(workspace.retests.length, 1);
  pass('Correction updates current question scope without deleting original judgment/retest');
  await page.locator('summary').filter({ hasText: '本地资料与备份' }).click();
  await mkdir(path.join(OUT, 'backup'), { recursive: true });
  await desktop.evaluate(({ dialog }, folder) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [folder] }); }, path.join(OUT, 'backup'));
  await page.getByRole('button', { name: '选择文件夹并备份' }).click();
  await page.getByTestId('operations-result').filter({ hasText: '已备份并校验' }).waitFor();
  const text = await page.getByTestId('operations-result').innerText();
  const backup = text.match(/已备份并校验：(.*)；SHA/)[1];
  await desktop.evaluate(({ dialog }, values) => { let i = 0; dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [values[i++]] }); }, [backup, path.join(OUT, 'restored')]);
  await page.getByRole('button', { name: '校验备份并恢复到空目录' }).click();
  await page.getByTestId('operations-result').filter({ hasText: '已恢复并校验到' }).waitFor();
  assert.ok((await readFile(path.join(OUT, 'restored/intake.sqlite3'))).length > 0);
  await desktop.evaluate(({ dialog }) => { dialog.showOpenDialog = async () => ({ canceled: true, filePaths: [] }); });
  await page.getByRole('button', { name: '选择文件夹并备份' }).click();
  await page.getByTestId('operations-result').filter({ hasText: '已取消' }).waitFor();
  pass('Native IPC backup/verified restore/cancel with main-process dialog choices stubbed, not human clicks');
  const denied = await fetch('http://127.0.0.1:8019/api/operations/backup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ directory: OUT }) });
  assert.equal(denied.status, 403); assert.deepEqual(errors, []);
  await page.screenshot({ path: path.join(OUT, 'workbench.png'), fullPage: true });
  pass('Privileged operation rejects missing desktop token; no renderer errors');
} catch (error) { checks.push({ name: 'learning desktop', status: 'FAIL', error: String(error) }); console.error(error); process.exitCode = 1; }
finally {
  if (desktop) await desktop.close();
  for (const child of children) if (child.exitCode === null) await new Promise(resolve => { const kill = spawn('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true }); kill.once('exit', resolve); kill.once('error', resolve); });
  await writeFile(path.join(OUT, 'result.json'), JSON.stringify({ checks, dialog: 'STUBBED_CHOICES', provider: 'NOT_USED' }, null, 2));
  await writeFile(path.join(OUT, 'services.log'), logs.join('')); console.log('Evidence:', OUT);
}
