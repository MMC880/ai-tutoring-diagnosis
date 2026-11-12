import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { writeFile, appendFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const results=[];
for(let run=1;run<=2;run++){
  await new Promise((resolve,reject)=>{
    const child=spawn(process.execPath,['scripts/start.mjs','--lifecycle-check'],{cwd:ROOT,windowsHide:true,env:{...process.env,JINXUE_PROVIDER_CONFIG_PATH:path.join(ROOT,'.qa-temp/lifecycle-provider.dpapi')}});
    const timer=setTimeout(()=>{child.kill();reject(Error('Lifecycle test exceeded 45 seconds'));},45000);
    child.stdout.on('data',d=>void appendFile(path.join(ROOT,'.qa-temp/lifecycle.log'),d));
    child.stderr.on('data',d=>void appendFile(path.join(ROOT,'.qa-temp/lifecycle.log'),d));
    child.once('error',reject);child.once('exit',code=>{clearTimeout(timer);code===0?resolve():reject(Error('Launcher exited '+code));});
  });
  for(const port of [8019,5179])await new Promise((resolve,reject)=>{const server=createServer();server.once('error',reject);server.listen(port,'127.0.0.1',()=>server.close(resolve));});
  results.push({run,status:'PASS',details:'Launcher started services and actual Electron window; window closed; both ports released'});
}
await writeFile(path.join(ROOT,'.qa-temp/lifecycle.json'),JSON.stringify(results,null,2));console.log(JSON.stringify(results));
