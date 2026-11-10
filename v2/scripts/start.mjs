import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const python = path.join(ROOT, '.venv', 'Scripts', 'python.exe');
if (!existsSync(python)) throw Error('缺少v2独立Python环境，请先按ENVIRONMENT.md部署');
const TEMP = path.resolve(ROOT, '../.cache/v2-temp'); mkdirSync(TEMP, {recursive:true});
const env = {...process.env, TEMP, TMP:TEMP, PYTHONUTF8:'1', PYTHONDONTWRITEBYTECODE:'1'};
env.JINXUE_DESKTOP_TOKEN = randomBytes(32).toString('hex');
const settingsFile = path.join(ROOT, '.local-data', 'desktop-settings.json');
if (existsSync(settingsFile)) env.JINXUE_DATA_DIR = JSON.parse(readFileSync(settingsFile, 'utf8')).dataDirectory;
const children = [];
const launch = (cmd,args) => { const child=spawn(cmd,args,{cwd:ROOT,env,stdio:'inherit',windowsHide:true}); children.push(child); return child; };
let stopping;
function stop() {
  return stopping ??= Promise.all(children.filter(c=>c.exitCode===null).map(child=>new Promise(resolve=>{
    if(process.platform==='win32') {
      // Only the exact PIDs spawned by this launcher, including their descendants.
      const task=spawn('taskkill.exe',['/PID',String(child.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});
      task.on('error',()=>{child.kill();resolve();});task.on('exit',resolve);
    }else{child.kill();child.once('exit',resolve);}
  })));
}
async function shutdown(code){await stop();process.exit(code);}
process.on('SIGINT',()=>void shutdown(0));
process.on('SIGTERM',()=>void shutdown(0));
async function wait(url, child) {
  for(let i=0;i<150;i++) { if(child.exitCode!==null) throw Error(`启动失败，退出码${child.exitCode}`); try{if((await fetch(url,{signal:AbortSignal.timeout(1000)})).ok)return;}catch{} await new Promise(r=>setTimeout(r,200)); }
  throw Error('本地服务启动超时');
}
try {
  // Reject occupied ports instead of accidentally attaching to an unrelated service.
  const {createServer}=await import('node:net');
  for(const port of [8019,5179]) await new Promise((resolve,reject)=>{const server=createServer();server.once('error',()=>reject(Error(`端口${port}已占用，请先退出上一轮验证`)));server.listen(port,'127.0.0.1',()=>server.close(resolve));});
  const backend=launch(python,['-X','utf8','-B','-m','uvicorn','backend.main:app','--host','127.0.0.1','--port','8019','--no-access-log']);
  await wait('http://127.0.0.1:8019/health',backend);
  const vite=launch(process.execPath,[path.join(ROOT,'node_modules/vite/bin/vite.js'),'--host','127.0.0.1','--port','5179','--strictPort']);
  await wait('http://127.0.0.1:5179',vite);
  console.log('晋学智辅2.0环境验证台：http://127.0.0.1:5179；CopilotKit独立页：/copilot.html');
  if(!process.argv.includes('--services-only')) {
    const electronEnv={...env}; delete electronEnv.ELECTRON_RUN_AS_NODE;
    const desktop=spawn(require('electron'),[ROOT,...(process.argv.includes('--lifecycle-check')?['--lifecycle-test']:[])],{cwd:ROOT,env:electronEnv,stdio:'inherit',windowsHide:true});children.push(desktop);
    desktop.on('error',e=>{console.error(e);void shutdown(1);});
    desktop.on('exit',()=>void shutdown(0));
  }
}catch(e){console.error(String(e));await shutdown(1);}
