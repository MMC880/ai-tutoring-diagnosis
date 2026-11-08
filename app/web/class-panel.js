'use strict';
let classRequestEpoch=0;
function classSummaryPage(p){
 const s=currentSummary,d=s.binary_denominator;
 return `<section class="notice class-scope" aria-label="统计范围"><h2>本次作业：${esc(p.title)}</h2><p>同次作业编号：${esc(p.batch_id)}。只统计这次作业的最新已确认原卷；复测另列，草稿不进入统计。</p></section>
 <div class="stats class-statistics">
  <div class="card stat"><span>已确认的学生</span><strong>${s.confirmed_students}人</strong><small>已收${s.submitted_students}名学生</small></div>
  <div class="card stat"><span>已确认错误</span><strong>${s.counts.INCORRECT}项</strong><small>${d?`可判定${d}次作答中有${s.counts.INCORRECT}次错误 · ${(s.counts.INCORRECT/d*100).toFixed(1)}%`:'暂无可判定作答，不计算错误率'}</small></div>
  <div class="card stat"><span>其他已登记状态</span><strong>待核对${s.counts.PENDING}项</strong><small>部分正确${s.counts.PARTIAL}项，单独记录</small></div>
  <div class="card stat"><span>材料缺失</span><strong>缺材料${s.counts.MISSING}项</strong><small>不记为不会，不计入错误率</small></div>
 </div>${classKnowledgeHTML(s)}<section class="panel"><div class="section-head"><h2>同卷共性问题</h2><small>按原题号汇总；同次作业应使用同一张试卷</small></div><div class="table-scroll"><table><thead><tr><th>原题与知识点</th><th>正确</th><th>错误</th><th>部分正确</th><th>待核对</th><th>缺材料</th><th>错误／可判定作答</th><th>需要关注的学生</th></tr></thead><tbody>${s.rows.map(r=>`<tr><td><strong>${esc(r.id)} · ${esc(r.knowledge||'待标注')}</strong><p>${esc(r.stem)}</p></td>${Object.keys(labels).map(k=>`<td>${r.counts[k]}</td>`).join('')}<td>${r.binary_denominator?r.counts.INCORRECT+'/'+r.binary_denominator+'（'+(100*r.counts.INCORRECT/r.binary_denominator).toFixed(0)+'%）':'暂无可判定作答'}</td><td>${esc(r.incorrect_students.join('、')||'—')}</td></tr>`).join('')||'<tr><td colspan="8">还没有教师确认的原卷，不生成班级薄弱结论。</td></tr>'}</tbody></table></div><p class="muted micro" style="margin-top:16px">错误占比只计算已确认正确与错误的作答；部分正确、待核对和缺材料单列。高频错误值得集中讲解，错因仍须老师核实；不同试卷请用不同的同次作业编号，不能只凭题号合并。</p></section>`;
}
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
