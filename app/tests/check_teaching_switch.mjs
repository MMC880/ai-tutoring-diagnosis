// Exercise the real teaching panel with delayed local responses; no server or network.
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const source=await readFile(new URL('../web/teaching-panel.js',import.meta.url),'utf8');
function fixture(){
 const fields={disabled:false,isConnected:true},select={value:'B'};
 let release;
 const wait=new Promise(resolve=>release=resolve);
 const old={id:'A',version:1,entries:[]};
 const editor={id:'B',version:1,entries:[]};
 const ctx=vm.createContext({view:'teaching',dirty:false,document:{addEventListener(){}},
  $:s=>s==='#teaching-editor-fields'?fields:s==='#teaching-source-select'?select:null,
  esc:String,options:()=>'',changed(){ctx.dirty=true;},
  api:async path=>path==='teaching/materials'?[{id:'A'},{id:'B'}]:wait});
 vm.runInContext(source+'\nteachingEditorHTML=()=>"editor";this.state=teachingState;this.page=teachingPage;this.changeDraft=teachingChanged;',ctx);
 Object.assign(ctx.state,{selected:'B',editor:old});
 return {ctx,fields,select,release:()=>release(editor)};
}
let failed=0;
async function check(name,run){try{await run();console.log('PASS '+name);}catch(e){failed++;console.error('FAIL '+name+': '+e.message);}}
await check('source switch disables previous editor until response settles',async()=>{
 const f=fixture(),pending=f.ctx.page();
 try{assert.equal(f.fields.disabled,true);}finally{f.release();await pending;}
 assert.equal(f.fields.disabled,false);
});
await check('typing during delayed source load keeps original editor and dirty draft',async()=>{
 const f=fixture(),pending=f.ctx.page();await Promise.resolve();
 // Simulates any input already queued at the time the editor became disabled.
 f.ctx.changeDraft();f.release();
 await assert.rejects(pending,/编辑|修改/);
 assert.equal(f.ctx.state.editor.id,'A');assert.equal(f.ctx.state.selected,'A');
 assert.equal(f.select.value,'A');assert.equal(f.ctx.dirty,true);assert.equal(f.fields.disabled,false);
});
await check('save response locks editor before any following refresh wait',async()=>{
 const f=fixture();let releaseLoad;const wait=new Promise(resolve=>releaseLoad=resolve);
 Object.assign(f.ctx.state,{selected:'A'});f.ctx.renderEpoch=1;
 const root={dataset:{version:'1'}};
 f.ctx.$=selector=>selector==='#teaching-editor-fields'?f.fields:selector==='#teaching-editor'?root:null;
 f.ctx.$$=()=>[];f.ctx.toast=()=>{};
 f.ctx.api=async(path,payload)=>payload?{id:'A',version:2,status:'DRAFT',entries:[]}:
  path==='teaching/materials'?await wait: {id:'A',version:2,entries:[]};
 f.ctx.render=async()=>{f.ctx.dirty=false;return f.ctx.page();};
 f.ctx.refresh=async()=>{await wait;return f.ctx.render();};
 vm.runInContext('teachingCollect=()=>({entries:[]});this.handle=teachingHandle;',f.ctx);
 const pending=f.ctx.handle('teaching-save',{});await new Promise(resolve=>setImmediate(resolve));
 try{assert.equal(f.fields.disabled,true);}finally{releaseLoad([{id:'A'}]);await pending;}
 assert.equal(f.ctx.state.editor.version,2);
});
if(failed)process.exitCode=1;
