// Real text rules; no DOM mock used to decide which questions match.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const c=vm.createContext({document:{addEventListener(){}}});
vm.runInContext(readFileSync('app/web/grading-panel.js','utf8'),c);
try{vm.runInContext(readFileSync('app/web/question-navigation.js','utf8'),c);}catch(e){console.error('FAIL 整卷题目筛选尚未实现:',e.code||e.message);process.exit(1);}
const match=(q,filter='all',text='')=>c.questionNavigationMatches(q,filter,text);
let passed=0,total=0;
function test(name,fn){total++;try{fn();passed++;console.log('PASS '+name);}catch(e){console.error('FAIL '+name,e.message);process.exitCode=1;}}
const q={id:'Q01',stem:'化简分式',knowledge:'取值限制',question_type:'条件识别',answer:'ＡＢＣ x+1',result:'INCORRECT'};
test('空查询显示任何题而不修改原答',()=>{const before=JSON.stringify(q);assert.equal(match(q),true);assert.equal(JSON.stringify(q),before);});
test('错题包含部分正确但不含待核与缺材料',()=>{for(const r of ['INCORRECT','PARTIAL'])assert.equal(match({...q,result:r},'wrong'),true);for(const r of ['CORRECT','PENDING','MISSING'])assert.equal(match({...q,result:r},'wrong'),false);});
test('待核对和缺材料分开',()=>{assert.equal(match({...q,result:'PENDING'},'pending'),true);assert.equal(match({...q,result:'MISSING'},'missing'),true);assert.equal(match({...q,result:'MISSING'},'pending'),false);});
test('识读提示必须未核清',()=>{assert.equal(match({...q,recognition_notes:'负号疑点'},'issues'),true);assert.equal(match({...q,recognition_notes:'负号疑点',recognition_resolved:true},'issues'),false);assert.equal(match({...q,recognition_resolved:false},'issues'),true);});
test('复用原批改分歧与核清规则',()=>{const conflict={...q,teacher_result:'CORRECT'};assert.equal(match(conflict,'issues'),true);assert.equal(match({...conflict,grading_note:'合成核清',grading_resolved:true},'issues'),false);assert.equal(match({...conflict,result:'PENDING'},'issues'),false);});
test('多词AND跨字段和全半角大小写',()=>{assert.equal(match(q,'wrong','Q01 分式 ABC'),true);assert.equal(match(q,'wrong','分式 不存在'),false);assert.equal(match(q,'all','条件识别 x+1'),true);});
test('各类计数不把提示当错误或已审核',()=>{const r=c.questionNavigationCounts([q,{...q,result:'PARTIAL'},{...q,result:'PENDING'},{...q,result:'MISSING'},{...q,result:'CORRECT',recognition_resolved:false}]);assert.equal(r.all,5);assert.equal(r.wrong,2);assert.equal(r.pending,1);assert.equal(r.missing,1);assert.equal(r.issues,1);});
test('搜索不作语义扩展且未知分类不匹配',()=>{assert.equal(match(q,'all','二次函数'),false);assert.equal(match(q,'unsupported'),false);});
console.log(JSON.stringify({passed,total,scope:'local review text filtering, no grading or learning inference'}));
