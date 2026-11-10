const { spawn } = require('node:child_process');
const { createServer } = require('node:net');
const { randomBytes } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

async function startBackend(home, resources) {
  for (const port of [8019, 5179]) await new Promise((resolve, reject) => {
    const server = createServer(); server.once('error', () => reject(Error(`本地端口 ${port} 已占用，请先退出另一份晋学智辅或开发窗口。`)));
    server.listen(port, '127.0.0.1', () => server.close(resolve));
  });
  const env = { ...process.env, PYTHONUTF8: '1', JINXUE_DESKTOP_TOKEN: randomBytes(32).toString('hex') };
  const settings = path.join(home, 'desktop-settings.json');
  env.JINXUE_DATA_DIR = process.env.JINXUE_DATA_DIR || path.join(home, 'archive');
  if (!process.env.JINXUE_DATA_DIR && fs.existsSync(settings)) {
    const config = JSON.parse(fs.readFileSync(settings, 'utf8'));
    if (typeof config.dataDirectory !== 'string' || !path.isAbsolute(config.dataDirectory)) throw Error('资料目录设置无效，请保留设置文件并联系维护人员。');
    env.JINXUE_DATA_DIR = config.dataDirectory;
  }
  const child = spawn(path.join(resources, 'backend', 'JinxueBackend.exe'), [], { cwd: resources, env, windowsHide: true, stdio: 'ignore' });
  let failure;
  child.once('error', error => { failure = error; });
  async function stop() {
    if (!child.pid || child.exitCode !== null) return;
    await new Promise(resolve => {
      const killer = spawn('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
      killer.once('error', resolve); killer.once('exit', resolve);
    });
  }
  try {
    for (let n = 0; n < 200; n++) {
      if (failure || child.exitCode !== null) throw Error('本地服务未能启动，请检查资料目录写入权限或安全软件拦截。');
      try {
        const options = { signal: AbortSignal.timeout(800) };
        if ((await fetch('http://127.0.0.1:8019/health', options)).ok &&
            (await fetch('http://127.0.0.1:5179', { signal: AbortSignal.timeout(800) })).ok) {
          return { child, token: env.JINXUE_DESKTOP_TOKEN, stop };
        }
      } catch {}
      await new Promise(r => setTimeout(r, 150));
    }
    throw Error('本地服务启动超时，请退出后检查权限再重开。');
  } catch (error) { await stop(); throw error; }
}
module.exports = { startBackend };
