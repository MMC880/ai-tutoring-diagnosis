'use strict';
let learningPracticeFocus=null;
function learningBasisHTML(group){
 const linked=group.basis==='TEACHING_ENTRY';
 return `<div class="notice ${linked?'':'warn'}"><strong>${linked?'按已审核知识条目归组':'标签线索（待核对关联）'}</strong><p>${linked?'同一条目跨资料版本和不同题型一起查看；其他同名条目不自动合并。':'尚未关联教学条目，当前只按相同知识名称与题型整理，不表示同一考点已经核清。'}</p>${group.knowledge_names?.length?`<p>已确认记录曾用名称：${group.knowledge_names.map(esc).join(' ／ ')}</p>`:''}${group.question_types?.length?`<p>涉及题型：${group.question_types.map(esc).join(' ／ ')}</p>`:''}<small>需要统一或修正时，回当前原卷核对知识关联，保存后重新确认；历史记录保留。</small></div>`;
}
function learningEvidenceNoteHTML(event){
 return `<p class="micro">当次知识：${esc(event.knowledge||'未标注')} · 题型：${esc(event.question_type||'未标注')}${event.teaching_ref?` · 资料V${esc(event.teaching_ref.version)}`:' · 无教学条目引用'}</p><small>确认时间：${esc(archiveTime(event.created_at))}；不等于实际作业日期，独立作答条件仍需老师核实。</small>`;
}
function learningGroupsHTML(profile){
 const a=profile.learning_analysis;if(!a)return '';
 const signals={REPEATED_ACROSS_PAPERS:'跨作业重复问题线索',MULTIPLE_IN_PAPER:'同次作业多题待补齐',ONE_ERROR:'一次待补齐记录',NO_CURRENT_ERROR:'当前无错误／部分正确记录'};
 return `<section class="panel learning-groups"><h2>同类问题持续记录</h2><p class="form-hint">已关联的记录按老师审核过的知识条目归组；其余保留为文字标签线索。待补齐包括错误与部分正确，次数不直接认定知识缺失；复测仍单列。</p>${a.duplicate_count||a.reused_photo_paper_count?`<div class="notice warn">${a.duplicate_count}项相同作业文件集合、同题号记录未重复计数；${a.reused_photo_paper_count||0}份重复文件来源按同一次作业汇总，按最后确认结果计入。全部原始历史仍保留。复用同一份空白原卷配人工答案也可能被保守合并，请提交实际作答文件。</div>`:''}${a.unclassified_count?`<p class="notice">${a.unclassified_count}项确认记录尚未标知识点或题型，请从原卷补充并重新审核，不推测其所属薄弱点。</p>`:''}${a.unmatched_followup_count?`<p class="notice warn">${a.unmatched_followup_count} 组历史补练未归入当前知识组（原题关联已变化或旧来源待核实）；下方完整过程仍保留，不按现在的知识点倒推。</p>`:''}${a.groups.map(g=>`<article class="learning-group" data-group="${g.id}"><div class="panel-head"><div><h3>${esc(g.knowledge||'知识点待标注')}</h3><p>${esc(g.question_type||'题型待标注')}</p></div><span class="tag">${esc(signals[g.signal])}</span></div>${learningBasisHTML(g)}<p>${g.wrong_paper_count}份作业出现待补齐问题 · ${g.wrong_count}项待补齐；错误${g.counts.INCORRECT}，部分正确${g.counts.PARTIAL}，正确${g.counts.CORRECT}，待核对${g.counts.PENDING}，缺材料${g.counts.MISSING}。</p><p class="micro muted">作业份数不等同独立作答次数；复测在下方时间线单独记录，一次答对不会移除原错题。</p>${g.followup?learningFollowupHTML(g):''}<details><summary>查看${g.evidence.length}条当前确认记录</summary>${g.evidence.map(e=>`<div class="issue">${tag(e.result)} <strong>${esc(e.batch_id)} / ${esc(e.question_id)} / R${e.revision}</strong><p class="formula">${esc(e.stem)}</p><p>原作答：${esc(e.answer||'未录入')}</p>${learningEvidenceNoteHTML(e)}<p>${esc(e.cause||'未认定错因')}</p><small>${esc(e.title)} · 当前卷V${e.current_version}${e.source_ready?'':'，有待审修订'}</small><p><button data-action="archive-open" data-student="${esc(profile.student.id)}" data-event="${e.event_id}">回看当次确认</button> <button data-action="learning-open" data-group="${g.id}" data-paper="${e.paper_id}" data-question="${esc(e.question_id)}">核对当前原卷与知识关联</button></p></div>`).join('')}</details><div class="actions">${g.practice_source?`<button class="primary" data-action="learning-practice" data-group="${g.id}">从此问题安排补练</button>`:g.review_source?`<span class="micro muted">来源原卷有待审修订，先复核后安排。</span><button data-action="learning-review" data-group="${g.id}">先复核原卷</button>`:''}</div></article>`).join('')||'<p class="muted">暂无可归组的确认记录；草稿不会进入这里。</p>'}</section>`;
}

async function learningHandle(action,el){
 if(action==='learning-all-practice'){if(!canLeave())return;learningPracticeFocus=null;selectedExercise='';selectedExerciseVersion=null;await render();return;}
 const group=currentProfile?.learning_analysis?.groups.find(g=>g.id===el.dataset.group);
 if(!group)throw Error('这组记录已变化，请刷新个人档案');
 const profile=currentProfile,epoch=renderEpoch,studentId=profile.student.id;
 let source=action==='learning-practice'?group.practice_source:group.review_source;
 if(action==='learning-open')source=group.evidence.find(e=>e.paper_id===el.dataset.paper&&e.question_id===el.dataset.question);
 if(!source)throw Error('没有可用的来源记录，请先核对原卷');
 if(!canLeave())return;
 const p=await api('papers/'+source.paper_id);
 if(view!=='profile'||epoch!==renderEpoch||currentProfile!==profile)throw Error('档案或学生已切换，请在当前页面重新选择。');
 if(p.student_id!==studentId)throw Error('来源学生不一致，停止切换');
 if(action==='learning-practice'){
  const q=p.questions.find(q=>q.id===source.question_id);
  if(p.version!==p.confirmed_version||p.version!==source.revision||!q||!['INCORRECT','PARTIAL'].includes(q.result))throw Error('来源原卷已更新，请先返回整卷复核，再安排补练');
  learningPracticeFocus={paperId:p.id,questionId:source.question_id,revision:source.revision};view='practice';selectedExercise='';selectedExerciseVersion=null;
 }else{learningPracticeFocus=null;view='review';}
 paperId=p.id;selectedDoc=0;await refresh();
}
