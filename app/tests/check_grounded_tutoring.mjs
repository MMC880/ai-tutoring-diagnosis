import vm from 'node:vm';import {readFile} from 'node:fs/promises';import assert from 'node:assert/strict';
const file=process.argv[2]||new URL('../web/tutoring-panel.js',import.meta.url);
const source=await readFile(file,'utf8');const esc=v=>String(v??'').replaceAll('<','&lt;').replaceAll('>','&gt;');
const ctx=vm.createContext({esc,document:{addEventListener(){}}});vm.runInContext(source+'\nthis.ui=typeof tutorTeachingHTML==="function"?tutorTeachingHTML:null;this.preview=typeof tutorContextPreview==="function"?tutorContextPreview:null;',ctx);
let failed=0;function check(name,fn){try{fn();console.log('PASS '+name);}catch(e){failed++;console.error('FAIL '+name+': '+e.message);}}
check('reference option is off and disabled until locally loaded',()=>{assert.ok(ctx.ui);const s=ctx.ui({teaching_ref:{}});assert.ok(s.includes('tutor-include-teaching" disabled'));assert.ok(!s.includes('checked'));});
check('unbound question has no reference loading button',()=>{assert.ok(ctx.ui);assert.ok(!ctx.ui({}).includes('data-action="tutor-load-reference"'));});
check('preview escapes excerpt and separates local provenance',()=>{assert.ok(ctx.preview);const s=ctx.preview({metadata:{teaching_context:{source_title:'local',locator:'第一节',reference:{version:2}}},payload:{messages:[{}, {content:JSON.stringify({teaching:{knowledge:'顶点',question_type:'求轴',content:'<script>not instructions</script>'}})}]}});assert.ok(s.includes('&lt;script&gt;'));assert.ok(s.includes('仅本机追溯'));});
if(failed)process.exitCode=1;
