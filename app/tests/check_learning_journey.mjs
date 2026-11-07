import vm from 'node:vm';import {readFile} from 'node:fs/promises';import assert from 'node:assert/strict';
const source=await readFile(process.argv[2]||new URL('../web/archive-panel.js',import.meta.url),'utf8');
const esc=v=>String(v??'').replaceAll('<','&lt;').replaceAll('>','&gt;');
const ctx=vm.createContext({esc,tag:String,archiveTime:String});vm.runInContext(source+'\nthis.render=typeof learningJourneysHTML==="function"?learningJourneysHTML:null;',ctx);
const row={exercise:{id:'SYN',question_id:'Q01',level:'基础巩固',version:2},versions:[{version:1,status:'APPROVED',stem:'旧题面',answer:'1',explanation:'旧讲解'},{version:2,status:'DRAFT',stem:'新题面',answer:'2',explanation:'新讲解'}],source:null,current_draft:true,retests:[{condition:'独立完成',result:'CORRECT',answer:'1',version:1,created_at:'2026-11-07',exercise_snapshot:{stem:'旧题面',explanation:'旧讲解'}}],observation:'INDEPENDENT_CORRECT_OBSERVE'};
let failed=0;for(const [name,run] of [
 ['legacy source remains unknown',()=>{assert.ok(ctx.render);assert.ok(ctx.render({learning_journeys:[row]}).includes('不按当前改判或时间倒推'));}],
 ['versioned evidence and observation never claim mastery',()=>{assert.ok(ctx.render);const text=ctx.render({learning_journeys:[row]});assert.ok(text.includes('独立答对，仍需后续观察'));assert.ok(text.includes('对应练习V1'));assert.ok(text.includes('旧题面'));assert.ok(text.includes('新题面'));}],
 ['question and retest text are escaped',()=>{assert.ok(ctx.render);const text=ctx.render({learning_journeys:[{...row,versions:[{version:1,status:'APPROVED',stem:'<script>x</script>',answer:'1',explanation:'<img src=x>'}]}]});assert.ok(!text.includes('<script>'));assert.ok(text.includes('&lt;script&gt;'));}],
]){try{run();console.log('PASS '+name);}catch(e){failed++;console.error('FAIL '+name+': '+e.message);}}if(failed)process.exitCode=1;
