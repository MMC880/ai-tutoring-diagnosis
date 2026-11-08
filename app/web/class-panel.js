'use strict';
let classRequestEpoch=0;
function classKnowledgeHTML(summary){
 const analysis=summary.class_analysis;
 if(!analysis)return '<section id="class-knowledge" class="panel"><h2>知识问题暂未读取</h2><p>请刷新本批摘要；不会从题号猜知识点。</p></section>';
 return `<section id="class-knowledge" class="panel"><h2>本批知识共性 · ${esc(summary.batch_id)}</h2><p class="form-hint">按已确认原卷整理，不直接认定知识缺失或掌握。同一学生多道错题只算一名涉及学生；错误与部分正确计入待补齐，缺材料与待核对单列。复测不混入原卷。</p>${analysis.unclassified_count?`<p class="notice warn">${analysis.unclassified_count} 项确认记录尚未标注知识或题型，请回原卷补充并重新确认。</p>`:''}${analysis.duplicate_count?`<p class="notice">${analysis.duplicate_count} 项同学生重复来源未重复计数；历史保留。</p>`:''}${analysis.groups.map(g=>`<article class="class-knowledge-group" data-group="${esc(g.id)}"><div class="panel-head"><div><h3>${esc(g.knowledge||'知识点待标注')}</h3><p>${g.basis==='TEACHING_ENTRY'?'老师已关联的知识条目':'标签线索（待核对关联）'}</p></div><span class="tag">${g.affected_student_count} 名学生有待补齐记录</span></div><p>${g.wrong_count} 项待补齐 · 错误${g.counts.INCORRECT} · 部分正确${g.counts.PARTIAL} · 正确${g.counts.CORRECT} · 待核对${g.counts.PENDING} · 缺材料${g.counts.MISSING}</p><p class="micro">曾用名称：${g.knowledge_names.map(esc).join(' ／ ')||'未标注'}<br>涉及题型：${g.question_types.map(esc).join(' ／ ')||'未标注'}</p><p>需核对学生：${g.affected_students.map(s=>esc(s.student_ref)+' · '+esc(s.student_name)).join('；')||'暂无错误或部分正确的学生'}</p><p class="micro muted">${g.affected_student_count>=2?'可考虑集中核对这些原题，再决定讲解内容；':'当前不足两名涉及学生，保留个别核对线索；'}不是长期薄弱结论。同名不同条目不合并，标签不混入已关联条目。</p><details><summary>查看 ${g.evidence.length} 条逐生原题证据</summary>${g.evidence.map(e=>`<div class="issue"><strong>${esc(e.student_ref)} · ${esc(e.student_name)}</strong> ${tag(e.result)}<p>${esc(e.title)} · ${esc(e.question_id)} · R${e.revision}${e.source_ready?'':' · 有待审修订'}</p><p class="formula">${esc(e.stem)}</p><p>原作答：${esc(e.answer||'未录入')}</p><p class="micro">${esc(e.cause||'未认定错因')}<br>确认时间：${esc(archiveTime(e.created_at))}，不等于实际作业日期或独立作答次数。</p><div class="row"><button data-action="class-evidence" data-event="${e.event_id}">回看当次原题与教师记录</button><button data-action="class-profile" data-event="${e.event_id}">查看该学生档案</button></div></div>`).join('')}</details></article>`).join('')||'<p class="muted">暂无可归组的确认记录；草稿与其他批次不进入本区。</p>'}</section>`;
}
function classEvidenceHTML(source){
 const e=source.event,q=e.question;
 return `<section class="class-knowledge-evidence"><h2>${esc(source.student.ref)} · ${esc(source.student.name)} · ${esc(e.question_id)} · R${e.revision}</h2><p>${esc(source.paper.batch_id)} · ${esc(source.paper.title)}</p><p>${source.is_latest?'本题在此卷的最近确认':'历史确认，已有后续确认'}${source.has_pending_revision?'；当前原卷有待审修订':''}</p><p>当次判定：${tag(e.result)}</p><h3>当次原题与学生原答</h3><pre class="formula">${esc(q.stem)}</pre><pre class="formula">${esc(q.answer||'未录入')}</pre><h3>当次教师记录</h3><p>老师原判：${esc(labels[q.teacher_result]||'未录入／不清楚')}</p><pre>${esc(q.teacher_mark||'无原批注记录')}</pre><p>${esc(q.grading_note||'无分歧核对说明')}</p><p>知识：${esc(q.knowledge||'待标注')} · 题型：${esc(q.question_type||'待标注')}</p><p>错因：${esc(q.cause||'未认定')}</p>${source.teaching_reference?teachingReferenceHTML(source.teaching_reference):''}<h3>当次原卷附件</h3><p class="micro muted">未自动定位本题所在页，请对照题号。</p>${source.documents.map(d=>`<p><a href="/api/files/${esc(d.id)}" target="_blank" rel="noopener">${esc(d.role||'作业')} · ${esc(d.filename)}</a></p>`).join('')||'<p>未附原件，保留当次文字记录。</p>'}<div class="notice">只读回看，不改判、不发布、不安排练习。</div><button data-action="close">关闭</button></section>`;
}
async function classHandle(action,element){
 const snapshot=currentSummary,sourceId=paperId,epoch=renderEpoch,request=++classRequestEpoch,edits=reviewFlowEdits;
 const evidence=snapshot?.class_analysis?.groups.flatMap(g=>g.evidence).find(e=>String(e.event_id)===element.dataset.event);
 if(view!=='class'||!evidence||snapshot.batch_id!==paper()?.batch_id)throw Error('本批记录已变化，请刷新后重新选择');
 const current=()=>view==='class'&&renderEpoch===epoch&&request===classRequestEpoch&&currentSummary===snapshot&&paperId===sourceId&&paper()?.batch_id===snapshot.batch_id&&reviewFlowEdits===edits&&!$('#modal').open;
 if(!current()||!canLeave())return;
 if(action==='class-evidence'){
  const source=await api('profiles/'+evidence.student_id+'/evidence/'+evidence.event_id);
  if(!current())return;
  if(source.student.id!==evidence.student_id||source.event.id!==evidence.event_id||source.event.paper_id!==evidence.paper_id||source.event.question_id!==evidence.question_id||source.event.revision!==evidence.revision||source.paper.batch_id!==snapshot.batch_id)throw Error('原题证据归属不一致，已停止显示');
  modal(classEvidenceHTML(source));return;
 }
 if(action==='class-profile'){
  const p=await api('papers/'+evidence.paper_id);if(!current())return;
  if(p.id!==evidence.paper_id||p.student_id!==evidence.student_id||p.batch_id!==snapshot.batch_id)throw Error('原卷归属已变化，停止切换学生');
  const boot=await api('bootstrap');if(!current())return;
  if(!reviewFlowSame(p,boot.papers.find(row=>row.id===p.id)))throw Error('原卷版本已变化，请刷新本批摘要再选择');
  data=boot;token=boot.csrf_token;paperId=p.id;profileStudentId=p.student_id;view='profile';selectedDoc=0;selectedExercise='';selectedExerciseVersion=null;learningPracticeFocus=null;
  history.replaceState(null,'','#profile');await render();
 }
}
