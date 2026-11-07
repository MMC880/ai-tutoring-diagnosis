// Pure catalogue search. Production regressions: hidden last page, fuzzy merges,
// filtered-row offsets replacing original reference identity, or input mutation.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
const source=path.resolve('app/web/teaching-catalog.js');
let passed=0;
const context=vm.createContext({document:{addEventListener(){}}});
try{vm.runInContext(readFileSync(source,'utf8'),context);}catch(error){console.error('FAIL 教学目录搜索尚未实现:',error.code||error.message);process.exit(1);}
const search=(...args)=>context.filterTeachingCatalog(...args);
const entries=Array.from({length:45},(_,i)=>({knowledge:i===44?'分式取值':'一次函数',question_type:'条件识别',content:'分母不能为零 '+i,
 source_title:'同名资料',scope:'山西初中数学',edition:'复习ＡＢＣ',locator:'第'+i+'页',reference:{material_id:i%2?'B':'A',entry_id:'E'+i,version:1}}));
function test(name,fn){try{fn();passed++;console.log('PASS '+name);}catch(e){console.error('FAIL '+name,e.message);process.exitCode=1;}}
test('空目录不造结果',()=>{const r=search([],'','',1);assert.equal(r.total,0);assert.equal(r.pages,1);assert.equal(r.rows.length,0);});
test('45条分页全部可达且保留完整目录索引',()=>{const a=search(entries,'','',1),b=search(entries,'','',2),c=search(entries,'','',3);assert.equal(a.pages,3);assert.equal(a.rows.length,20);assert.equal(b.rows[0].index,20);assert.equal(c.rows.length,5);assert.equal(c.rows[4].entry.reference.entry_id,'E44');});
test('越界页归入可达范围',()=>{assert.equal(search(entries,'','',100).page,3);assert.equal(search(entries,'','',0).page,1);});
test('同名资料按唯一ID筛选',()=>{const r=search(entries,'','B');assert.equal(r.total,22);assert.ok(r.rows.every(row=>row.entry.reference.material_id==='B'));});
test('多个词跨字段AND匹配并返回原索引',()=>{const r=search(entries,'分式 数学 条件识别','A');assert.equal(r.total,1);assert.equal(r.rows[0].index,44);});
test('全半角和英文大小写统一',()=>{assert.equal(search(entries,'abc','').total,45);assert.equal(search(entries,'ＡＢＣ','').total,45);});
test('可查正文和出处但不猜同义词',()=>{assert.equal(search(entries,'不能为零 第44页','').total,1);assert.equal(search(entries,'函数顶点','').total,0);});
test('搜索不修改原目录或引用',()=>{const before=JSON.stringify(entries);search(entries,'分式','A',2);assert.equal(JSON.stringify(entries),before);});
console.log(JSON.stringify({passed,total:8,scope:'pure local search, no semantic diagnosis'}));
