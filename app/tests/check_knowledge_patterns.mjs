import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const src=await readFile(new URL('../web/learning-panel.js',import.meta.url),'utf8');
const esc=v=>String(v??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
const ctx=vm.createContext({esc,tag:String,archiveTime:String});
vm.runInContext(src+'\nthis.html=learningGroupsHTML;',ctx);
const group={id:'safe-id',basis:'TEACHING_ENTRY',knowledge:'新知识名',question_type:'求顶点',knowledge_names:['新知识名','旧知识名'],question_types:['求顶点','求对称轴'],wrong_count:1,wrong_paper_count:1,paper_count:1,signal:'ONE_ERROR',counts:{INCORRECT:1,PARTIAL:0,CORRECT:0,PENDING:0,MISSING:0},evidence:[{paper_id:'a',question_id:'Q01',revision:1,event_id:1,batch_id:'SYN-B',result:'INCORRECT',stem:'题目',answer:'原答',cause:'待核实',title:'合成卷',knowledge:'旧知识名',question_type:'求顶点',teaching_ref:{material_id:'a',entry_id:'b',version:2},created_at:'2026-11-01T00:00:00Z',current_version:1,source_ready:true}]};
const html=g=>ctx.html({student:{id:'synthetic'},learning_analysis:{groups:[g]}});
async function staleAction(change){
 let release;const wait=new Promise(resolve=>release=resolve);
 const profile={student:{id:'synthetic'},learning_analysis:{groups:[{...group,practice_source:{paper_id:'paper-A',question_id:'Q01',revision:1}}]}};
 const state=vm.createContext({currentProfile:profile,renderEpoch:1,view:'profile',paperId:'paper-A',selectedExercise:'',selectedExerciseVersion:null,selectedDoc:0,canLeave:()=>true,api:()=>wait,refresh:async()=>{}});
 vm.runInContext(src+'\nthis.handle=learningHandle;',state);
 const pending=state.handle('learning-practice',{dataset:{group:'safe-id'}});
 change(state);release({id:'paper-A',student_id:'synthetic',version:1,confirmed_version:1,questions:[{id:'Q01',result:'INCORRECT'}]});
 await assert.rejects(pending,/变化|切换/);assert.notEqual(state.view,'practice');
}
let failed=0;
for(const [name,test] of [
 ['linked knowledge shows grouping basis, names and question types',()=>{const s=html(group);assert.ok(s.includes('按已审核知识条目归组'));assert.ok(s.includes('旧知识名'));assert.ok(s.includes('求对称轴'));}],
 ['unbound legacy grouping remains an explicit unverified label clue',()=>{assert.ok(html({...group,basis:'LABEL_ONLY'}).includes('标签线索（待核对关联）'));}],
 ['evidence names fixed revision and confirmation time without inventing work date',()=>{const s=html(group);assert.ok(s.includes('资料V2'));assert.ok(s.includes('确认时间'));assert.ok(s.includes('不等于实际作业日期'));}],
 ['names and question types are escaped',()=>{const s=html({...group,knowledge_names:['<script>bad</script>'],question_types:['<img src=x onerror=bad>']});assert.ok(!s.includes('<script>'));assert.ok(!s.includes('<img src=x'));assert.ok(s.includes('&lt;script&gt;'));}],
 ['leaving profile invalidates pending practice navigation',()=>staleAction(state=>state.view='review')],
 ['leaving and returning to same student invalidates old action',()=>staleAction(state=>state.renderEpoch++)],
]){try{await test();console.log('PASS '+name);}catch(e){failed++;console.error('FAIL '+name+': '+e.message);}}
if(failed)process.exitCode=1;
