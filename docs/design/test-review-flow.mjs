// Pure selection contract; synthetic metadata only.
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const project=String.raw`E:\GPT\AI-Tutoring-Diagnosis`;
const context=vm.createContext({document:{addEventListener(){}}});
vm.runInContext(await readFile(project+'/app/web/review-flow.js','utf8'),context);
let passed=0;
function test(name,papers,current,expected){context.batch={batch_id:'SYN-B',papers};context.current=current;const result=vm.runInContext('reviewFlowNext(batch,current)',context);assert.equal(result?.id??null,expected,name);passed++;}
const p=(id,confirmed=false,batch_id='SYN-B')=>({id,batch_id,version:1,confirmed_version:confirmed?1:0});
test('空批次不选人',[],'A',null);
test('只有当前待审不选自己',[p('A')],'A',null);
test('跳过已经确认的卷',[p('A'),p('B',true),p('C')],'A','C');
test('末尾回到本批第一份待审',[p('A'),p('B',true),p('C')],'C','A');
test('其他都确认时留当前',[p('A',true),p('B')],'B',null);
test('来源不在清单时不猜第一人',[p('A'),p('B')],'X',null);
test('不选择别的批次',[p('A'),p('X',false,'SYN-OTHER'),p('C',true)],'A',null);
console.log(JSON.stringify({passed,total:7}));
