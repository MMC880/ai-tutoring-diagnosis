'use strict';
function questionNavigationIssue(q){
 const reading=q.recognition_resolved===false||q.recognition_resolved!==true&&!!(q.recognition_notes?.trim()||q.recognition_notice?.trim());
 const grading=['CORRECT','INCORRECT','PARTIAL'].includes(q.result)&&gradingConflict(q)&&!(q.grading_resolved===true&&q.grading_note?.trim());
 return reading||grading;
}
function questionNavigationMatches(q,filter='all',query=''){
 const kind=filter==='all'||filter==='wrong'&&['INCORRECT','PARTIAL'].includes(q.result)||filter==='pending'&&q.result==='PENDING'||filter==='missing'&&q.result==='MISSING'||filter==='issues'&&questionNavigationIssue(q);
 if(!kind)return false;
 const normalize=value=>String(value??'').normalize('NFKC').toLowerCase();
 const terms=normalize(query).trim().split(/\s+/).filter(Boolean);
 const text=normalize(['id','stem','knowledge','question_type','answer'].map(k=>q[k]||'').join(' '));
 return terms.every(term=>text.includes(term));
}
function questionNavigationCounts(questions){return Object.fromEntries(['all','wrong','pending','missing','issues'].map(filter=>[filter,questions.filter(q=>questionNavigationMatches(q,filter)).length]));}
const questionNavigationLabels={all:'全部题目',wrong:'错误／部分正确',pending:'待核对',missing:'缺材料',issues:'有核对提示'};
let questionNavigationState=null;
function questionNavigationHTML(){
 return `<section id="question-navigation" class="question-navigation"><h3>本卷题目查找</h3><label class="field"><span>显示哪些题</span><select id="question-nav-filter">${options(questionNavigationLabels,'all')}</select></label><label class="field"><span>按题号、题干、知识点、题型或已录作答查找</span><input id="question-nav-query" maxlength="200" placeholder="多个词用空格隔开"></label><p id="question-nav-counts" class="micro muted"></p><p id="question-nav-status" role="status"></p><p id="question-nav-stale" class="micro bad"></p><div class="row"><button data-action="questions-refresh">刷新筛选</button><button data-action="questions-all">显示全卷</button></div><div class="question-nav-jump"><label class="field"><span>定位本卷任意题（会先显示全卷）</span><select id="question-nav-target"><option value="">请选择题号</option></select></label><button data-action="questions-locate" disabled>定位题目</button></div><p class="micro muted">筛选只改变显示，保存和确认仍针对整卷，隐藏题目的原答与批注仍保留；可见不等于已审核。</p><p id="question-nav-empty" class="notice" hidden>没有匹配题目，请换条件或显示全卷；题目没有被删除。</p></section>`;
}
function questionNavigationCurrent(s){return !!s&&questionNavigationState===s&&s.host.isConnected&&$('#question-navigation')===s.host&&view==='review'&&renderEpoch===s.epoch&&paperId===s.paperId&&paper()?.student_id===s.studentId&&paper()?.version===s.version;}
function questionNavigationInit(p){
 const host=$('#question-navigation');questionNavigationState=null;if(!host)return;
 const s={host,paperId:p.id,studentId:p.student_id,version:p.version,epoch:renderEpoch};questionNavigationState=s;questionNavigationApply(s);
}
function questionNavigationUpdate(s){
 if(!questionNavigationCurrent(s))return;
 const questions=collectQuestions(),rows=$$('#questions .question'),counts=questionNavigationCounts(questions);
 $('#question-nav-counts').textContent=Object.entries(questionNavigationLabels).map(([key,label])=>`${label}：${counts[key]}`).join(' · ');
 $('#question-nav-status').textContent=`显示${rows.filter(row=>!row.hidden).length} / 全卷${rows.length}题；保存和确认仍包含隐藏题目。`;
 const target=$('#question-nav-target'),selected=target.value;
 target.innerHTML='<option value="">请选择题号</option>'+questions.map(q=>`<option value="${esc(q.id)}">${esc(q.id)} · ${esc(labels[q.result]||q.result)}</option>`).join('');
 target.value=questions.some(q=>q.id===selected)?selected:'';
 $('[data-action=questions-locate]').disabled=!target.value;
 $('#question-nav-empty').hidden=rows.some(row=>!row.hidden);
}
function questionNavigationApply(s){
 if(!questionNavigationCurrent(s))return;
 const questions=collectQuestions(),filter=$('#question-nav-filter').value,query=$('#question-nav-query').value;
 $$('#questions .question').forEach((row,index)=>{row.hidden=!questionNavigationMatches(questions[index],filter,query);});
 $('#question-nav-stale').textContent='';questionNavigationUpdate(s);
}
function questionNavigationChanged(){
 const s=questionNavigationState;if(!questionNavigationCurrent(s))return;
 questionNavigationUpdate(s);
 if($('#question-nav-filter').value!=='all'||$('#question-nav-query').value.trim())$('#question-nav-stale').textContent='题目已修改，当前编辑行暂不隐藏；请点“刷新筛选”重新整理。';
}
function questionNavigationHandle(action,element){
 const s=questionNavigationState;
 if(!questionNavigationCurrent(s)||element?.closest('#question-navigation')!==s.host)throw Error('整卷或题目工具条已变化，请重新读取当前卷');
 if(action==='questions-all'){$('#question-nav-filter').value='all';$('#question-nav-query').value='';questionNavigationApply(s);return;}
 if(action==='questions-refresh'){questionNavigationApply(s);return;}
 if(action==='questions-locate'){
  const id=$('#question-nav-target').value,row=$$('#questions .question').find(el=>el.dataset.q===id);
  if(!row)throw Error('本卷没有所选题号，请重新选择');
  $('#question-nav-filter').value='all';$('#question-nav-query').value='';questionNavigationApply(s);
  $$('#questions .question-nav-focus').forEach(el=>el.classList.remove('question-nav-focus'));
  row.classList.add('question-nav-focus');row.tabIndex=-1;row.scrollIntoView({block:'start'});row.focus({preventScroll:true});
 }
}
document.addEventListener('input',event=>{if(event.target.id==='question-nav-query')questionNavigationApply(questionNavigationState);});
document.addEventListener('change',event=>{
 if(event.target.id==='question-nav-filter')questionNavigationApply(questionNavigationState);
 if(event.target.id==='question-nav-target'&&questionNavigationCurrent(questionNavigationState))$('[data-action=questions-locate]').disabled=!event.target.value;
});
