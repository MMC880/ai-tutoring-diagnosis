// No browser, network, credentials or live records. Force Image callbacks to finish out of order.
import vm from 'node:vm';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const images=[];
class FakeImage{constructor(){images.push(this);}set src(v){this.url=v;}get src(){return this.url;}}
const canvas={width:0,height:0};const button={disabled:false};
const context=vm.createContext({Image:FakeImage,document:{addEventListener(){}},$:(s)=>s==='#vision-canvas'?canvas:button});
vm.runInContext(await fs.readFile(new URL('../web/vision-panel.js',import.meta.url),'utf8'),context);
vm.runInContext("visionDraw=()=>{};visionEditor={paperId:'P',version:1,documentId:'A',image:null,crop:null,masks:[]};globalThis.a=visionLoadImage();visionEditor.documentId='B';globalThis.b=visionLoadImage();",context);
images[1].naturalWidth=200;images[1].naturalHeight=160;images[1].onload();await context.b;
images[0].naturalWidth=100;images[0].naturalHeight=80;images[0].onload();await context.a;
const state=vm.runInContext('({documentId:visionEditor.documentId,displayed:visionEditor.image.src})',context);
assert.equal(state.documentId,'B');assert.ok(state.displayed.endsWith('/image/B'),'Stale image A overwrote the selected image B');
console.log('IMAGE LOAD RACE: PASS, selected B still displays B');
