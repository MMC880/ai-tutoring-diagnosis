// Snapshot the packaged WebView2 only during explicit synthetic smoke mode.
import {writeFile} from 'node:fs/promises';
const [port,url,output]=process.argv.slice(2);
const targets=await (await fetch('http://127.0.0.1:'+port+'/json')).json();
const target=targets.find(t=>t.type==='page'&&t.url.startsWith(url));
if(!target)throw Error('Packaged WebView2 target not found');
const socket=new WebSocket(target.webSocketDebuggerUrl),pending=new Map();let seq=0;
await new Promise((r,j)=>{socket.addEventListener('open',r,{once:true});socket.addEventListener('error',j,{once:true});});
socket.onmessage=e=>{const m=JSON.parse(e.data);if(m.id){const p=pending.get(m.id);pending.delete(m.id);if(m.error)p.reject(Error(m.error.message));else p.resolve(m.result);}};
function command(method,params={}){const id=++seq;return new Promise((resolve,reject)=>{pending.set(id,{resolve,reject});socket.send(JSON.stringify({id,method,params}));});}
try{
 const result=await command('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
 await writeFile(output,Buffer.from(result.data,'base64'));
 const ui=await command('Runtime.evaluate',{awaitPromise:true,returnByValue:true,expression:`(async()=>{
 const previous=view;view='ai';await render();
 if(!document.querySelector('[data-action="ai-save-test"]')||!document.querySelector('#ai-connection-state'))throw Error('Missing connection test UI');
 document.querySelector('#ai-connection-state').textContent='连接成功';
 aiSettingsChanged(document.querySelector('#ai-model'));
 if(document.querySelector('#ai-connection-state').textContent.includes('连接成功'))throw Error('Stale connection state after editing');
 dirty=false;view='backup';await render();
 if(typeof window.pywebview.api.choose_backup!=='function'||!document.querySelector('[data-action="backup"]').textContent.includes('选择文件夹'))throw Error('Missing native backup picker bridge');
 view=previous;await render();return true;
 })()`});
 if(ui.exceptionDetails||ui.result?.value!==true)throw Error(JSON.stringify(ui.exceptionDetails||ui));
 console.log('PACKAGED_WEBVIEW_SCREENSHOT_OK; CONNECTION_AND_BACKUP_UI_OK');
}finally{socket.close();}
