// Snapshot the packaged WebView2 only during explicit synthetic smoke mode.
import {readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
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
 const files=JSON.parse(await readFile(path.join(path.dirname(output),'mpo-input.json'),'utf8'));
 const batch=await command('Runtime.evaluate',{awaitPromise:true,returnByValue:true,expression:`(async()=>{
 const files=${JSON.stringify(files)},pause=ms=>new Promise(r=>setTimeout(r,ms));
 await handle('new',document.querySelector('[data-action=new]'));
 for(const [id,value] of Object.entries({'new-ref':'SYN-DESKTOP-A','new-name':'合成学生A','new-title':'MPO六张照片导入验证','new-batch':'SYN-MPO-NATIVE'}))document.getElementById(id).value=value;
 const transfer=new DataTransfer();for(const item of files){const bytes=Uint8Array.from(atob(item.data),c=>c.charCodeAt(0));transfer.items.add(new File([bytes],item.filename,{type:'image/jpeg'}));}
 document.querySelector('#new-files').files=transfer.files;
 document.querySelector('#create-paper').click();
 for(let i=0;i<100;i++){if(!document.querySelector('#modal').open&&paper()?.title==='MPO六张照片导入验证')break;await pause(100);}
 const p=paper();if(p?.title!=='MPO六张照片导入验证'||p.documents.length!==6)throw Error('Native six-photo import failed: '+document.querySelector('#toast').textContent);
 for(let i=0;i<6;i++){
 const doc=p.documents[i],response=await fetch('/api/files/'+doc.id),raw=new Uint8Array(await response.arrayBuffer());
 if(doc.filename!==files[i].filename||btoa(String.fromCharCode(...raw))!==files[i].data)throw Error('MPO original changed or reordered');
 const normalized=new Image();await new Promise((resolve,reject)=>{normalized.onload=resolve;normalized.onerror=reject;normalized.src='/api/papers/'+p.id+'/image/'+doc.id;});
 if(normalized.naturalWidth!==160||normalized.naturalHeight!==120)throw Error('MPO normalized primary size mismatch');
 const c=document.createElement('canvas');c.width=160;c.height=120;const context=c.getContext('2d');context.drawImage(normalized,0,0);
 const pixel=context.getImageData(80,60,1,1).data;if(pixel[0]>240&&pixel[1]>240&&pixel[2]>240)throw Error('MPO auxiliary white frame used instead of primary');
 }
 const img=new Image();await new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=()=>reject(Error('Native MPO primary image decode failed'));img.src='/api/files/'+p.documents[0].id;});
 if(img.naturalWidth!==160||img.naturalHeight!==120)throw Error('Native MPO primary size mismatch');
 img.style.maxWidth='240px';document.querySelector('main').prepend(img);return true;
 })()`});
 if(batch.exceptionDetails||batch.result?.value!==true)throw Error(JSON.stringify(batch.exceptionDetails||batch));
 const mpoShot=await command('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
 await writeFile(path.join(path.dirname(output),'packaged-mpo-import.png'),Buffer.from(mpoShot.data,'base64'));
 console.log('NATIVE_MPO_SIX_FILES_AND_PRIMARY_PREVIEW_OK');
 console.log('PACKAGED_WEBVIEW_SCREENSHOT_OK; CONNECTION_AND_BACKUP_UI_OK');
}finally{socket.close();}
