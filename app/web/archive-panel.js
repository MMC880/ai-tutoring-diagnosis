'use strict';
let archiveRequestEpoch=0;
function archiveTime(value){const date=new Date(value);return Number.isNaN(date.getTime())?String(value||'未记时间'):date.toLocaleString('zh-CN',{hour12:false});}
function archiveButton(event,studentId,label='回看当次确认'){
 return `<button data-action="archive-open" data-student="${esc(studentId)}" data-event="${esc(event.id)}">${esc(label)}</button>`;
}
function archiveSummaryHTML(profile){
 const summary=profile.archive_summary;
 return `<section class="panel archive-summary"><div class="panel-head"><h2>学生独立学习档案</h2><label class="field"><span>选择学生</span><select id="profile-student-select">${data.students.map(s=>`<option value="${esc(s.id)}" ${s.id===profile.student.id?'selected':''}>${esc(s.name)} · ${esc(s.ref)}</option>`).join('')}</select></label></div><p>当前学生：<strong>${esc(profile.student.name)}</strong> · ${esc(profile.student.ref)}</p><p class="micro muted">${summary.current_records}项去重后的当前确认记录 · ${summary.history_events}条完整确认历史 · ${summary.duplicate_count}项同原件同题记录未重复计数。</p><p class="micro muted">${summary.confirmed_papers}份有确认历史的卷（可能含重复来源） · ${summary.pending_papers}份有待审内容的卷。历史快照只读，当前草稿不替换已确认记录。</p><button data-action="report-preview">预览个人学情报告</button></section>`;
}
function archiveTimelineHTML(profile){
 return `<h2>原卷确认历史</h2><p class="micro muted">按写入顺序保留，可回看当次原答和教师记录；同卷改判与重复来源均不删除。</p><div class="timeline">${profile.events.map(e=>`<div class="timeline-item"><strong>${esc(e.question_id)} · R${e.revision}</strong> ${tag(e.result)}<small>${esc(archiveTime(e.created_at))} · ${esc(e.question.knowledge||'知识点待标注')}</small><p class="formula">${esc(e.question.stem)}</p><p>原作答：${esc(e.question.answer||'未录入')}</p>${e.question.teacher_mark?`<p>原批注：${esc(e.question.teacher_mark)}</p>`:''}${archiveButton(e,profile.student.id)}</div>`).join('')}</div><h3>补练复测（单独记录）</h3>${profile.retests.map(r=>`<div class="timeline-item"><strong>${esc(r.condition)}</strong> ${tag(r.result)}<small>${esc(archiveTime(r.created_at))}</small><p>作答：${esc(r.answer)}。增加本次证据，原错题仍保留。</p></div>`).join('')||'<p class="muted">暂无复测记录；不推测掌握情况。</p>'}`;
}
function learningJourneysHTML(profile){
 const observations={WAITING_APPROVAL:'练习待老师审批',WAITING_RETEST:'已批准题面，等待复测',RETEST_UNRESOLVED:'本次材料或判定待核实',CONDITION_UNCONFIRMED:'完成条件待核实',NEEDS_REVIEW:'本次仍需讲解与补齐',NEEDS_INDEPENDENT_RETEST:'本次有提示，仍需独立复测',INDEPENDENT_CORRECT_OBSERVE:'本次独立答对，仍需后续观察'};
 return `<section class="panel learning-journeys"><h2>补习与复测过程</h2><p class="micro muted">原题确认、练习版本与复测逐项保留；不自动判掌握或删除错题。记录时间不是实际考试日期，已批准不等于已经发放或完成。</p>${(profile.learning_journeys||[]).map(j=>`<article class="issue learning-journey" data-exercise="${esc(j.exercise.id)}"><h3>${esc(j.exercise.question_id)} · ${esc(j.exercise.level)}</h3><span class="tag">${esc(observations[j.observation]||'待核实')}</span>${j.current_draft?'<p class="notice warn">当前练习有待审题面；旧版审批和复测只对应旧题面。</p>':''}${j.source?`<h4>原来卡在哪里</h4><p>${tag(j.source.result)} · 原卷R${j.source.revision} · ${esc(j.source.question.knowledge||'知识点待核对')}</p><pre>${esc(j.source.question.stem)}</pre><p>当次原答：${esc(j.source.question.answer||'未录入')}</p>${j.source_has_later_confirmation?'<p class="micro">原题已有后续确认，这里保留建立补练时的原版本。</p>':''}${archiveButton(j.source,profile.student.id,'回看建立补练时的确认')}`:'<p class="notice warn">旧练习未记录原题确认版本，来源待核实；不按当前改判或时间倒推。</p>'}<h4>补过什么</h4>${j.versions.map(v=>`<details><summary>练习V${v.version} · ${v.status==='APPROVED'?'已批准':'待审'}${v.version===j.exercise.version?' · 当前题面':''}</summary><pre>${esc(v.stem)}</pre><p>仅教师答案：${esc(v.answer)}</p><pre>${esc(v.explanation||'未录讲解')}</pre></details>`).join('')}<h4>复测表现</h4>${j.retests.map(r=>`<div class="timeline-item"><strong>${esc(r.condition)}</strong> ${tag(r.result)}<p>本次作答：${esc(r.answer||'未录入／待核实')}</p><small>记录时间：${esc(archiveTime(r.created_at))} · 对应练习V${r.version}</small><details><summary>查看本次实际使用的已批准题面与讲解</summary><pre>${esc(r.exercise_snapshot.stem)}</pre><pre>${esc(r.exercise_snapshot.explanation||'未录讲解')}</pre></details></div>`).join('')||'<p class="muted">尚无复测记录；不能推定学生已完成。</p>'}</article>`).join('')||'<p class="muted">暂无补练过程。请先从老师确认的错题安排补练，不自动创建。</p>'}</section>`;
}
function archiveProfilePage(p){
 const f=currentProfile;
 if(!f?.student||f.student.id!==p.student_id)throw Error('档案学生来源不一致，请重新选择');
 const current=f.current_evidence||f.latest,wrong=current.filter(e=>['INCORRECT','PARTIAL'].includes(e.result)),right=current.filter(e=>e.result==='CORRECT');
 return `<div class="notice">每名学生独立积累数学作答与查漏补缺。统计按当前确认记录去重；完整历史保留，一次答对不自动认定掌握。</div>${archiveSummaryHTML(f)}<div class="stats"><div class="card stat"><span>当前原题待补齐（错误＋部分正确）</span><strong data-archive-wrong>${wrong.length}</strong></div><div class="card stat"><span>当前原题答对</span><strong>${right.length}</strong></div><div class="card stat"><span>待核对／缺材料</span><strong>${f.archive_summary.counts.PENDING} / ${f.archive_summary.counts.MISSING}</strong></div><div class="card stat"><span>补练复测（单独统计）</span><strong>${f.retests.length}</strong></div></div>${learningGroupsHTML(f)}${learningJourneysHTML(f)}${!f.events.length?'<div class="panel empty"><h2>尚无该学生的确认记录</h2><p>先核对原卷再归档，草稿不用于认定薄弱点。</p><button data-view="review">返回整卷审核</button></div>':`<div class="profile-grid"><section class="panel"><h2>当前需要观察与补齐</h2>${wrong.map(e=>`<div class="issue">${tag(e.result)} <strong>${esc(e.question.knowledge||'知识点待标注')}</strong><p class="formula">${esc(e.question.stem)}</p><p>原作答：${esc(e.question.answer||'未录入')}</p><small>${esc(e.batch_id)} / ${esc(e.question_id)} / R${e.revision} · ${esc(e.question.cause||'待核实')}</small><p>${archiveButton(e,f.student.id,'查看原题与当次确认')}</p></div>`).join('')||'<p class="muted">当前没有已确认错误或部分正确记录，仍需持续观察。</p>'}<h3>当前答对的内容</h3>${right.map(e=>`<div class="issue"><p>${esc(e.question.knowledge||e.question_id)} ${tag('CORRECT')}</p>${archiveButton(e,f.student.id)}</div>`).join('')||'<p class="muted">暂无已确认答对记录。</p>'}</section><section class="panel">${archiveTimelineHTML(f)}</section></div>`}`;
}
async function archiveSelect(select){
 const next=data.papers.find(p=>p.student_id===select.value);
 if(!next)throw Error('该学生尚无作业，请先收件');
 if(!canLeave()){select.value=paper()?.student_id||'';return;}
 archiveRequestEpoch++;
 if($('#modal').open)close();
 paperId=next.id;selectedDoc=0;selectedExercise='';currentProfile=null;learningPracticeFocus=null;
 await render();
}
function archiveEvidenceHTML(source){
 const e=source.event,q=e.question;
 return `<section class="archive-evidence" data-event="${e.id}"><h2>${esc(source.student.name)} · ${esc(e.question_id)} · R${e.revision}</h2><p class="tag">${source.is_latest?'本题在此卷的最近确认':'历史确认（已有后续确认）'}</p><p>${esc(source.paper.title)} · ${esc(source.paper.batch_id)}<br><small>${esc(archiveTime(e.created_at))}</small></p>${source.has_pending_revision?'<div class="notice warn">当前原卷还有待审修订；本窗口保留当次确认内容，不使用未确认改动。</div>':''}<p>当次最终判定：${tag(e.result)}</p><h3>当次原题</h3><pre class="formula">${esc(q.stem)}</pre><h3>当次学生原答</h3><pre class="formula">${esc(q.answer||'未录入')}</pre><h3>当次教师记录</h3><p>老师原判：${esc(labels[q.teacher_result]||'未录入／不清楚')}</p><pre>${esc(q.teacher_mark||'无原批注记录')}</pre><p>AI候选：${esc(labels[q.ai_result]||'未提供')} · 分歧核清：${q.grading_resolved?'已勾选':'未勾选'}</p><pre>${esc(q.grading_note||'无分歧核对说明')}</pre><p>知识点：${esc(q.knowledge||'待标注')}<br>题型：${esc(q.question_type||'待标注')}</p><pre>错因记录：${esc(q.cause||'未认定')}<br>核对参考：${esc(q.correct_answer||'无参考')}</pre>${q.recognition_notes||q.recognition_notice?`<p>识读状态：${q.recognition_resolved?'已核清':'待核清'}</p><pre>${esc(q.recognition_notes||'')}<br>${esc(q.recognition_notice||'')}</pre>`:''}${source.teaching_reference?teachingReferenceHTML(source.teaching_reference):''}<h3>本卷原件</h3><p class="micro muted">以下是本卷附件，尚未自动标定本题所在页；请核对页码和题号。</p>${source.documents.map(d=>`<p><a href="/api/files/${esc(d.id)}" target="_blank" rel="noopener">${esc(d.role||'作业')} · ${esc(d.filename)}</a></p>`).join('')||'<p class="muted">本卷未附原件；保留当次文字记录。</p>'}<div class="notice">这里只读查看，不改判、不发布、不自动安排补练。</div><div class="actions">${!source.is_latest?`<button data-action="archive-latest" data-student="${esc(source.student.id)}" data-event="${source.latest_event_id}">查看同题最近确认</button>`:''}<button data-action="archive-current" data-student="${esc(source.student.id)}" data-paper="${esc(source.paper.id)}">查看当前原卷</button><button data-action="close">关闭</button></div></section>`;
}
async function archiveHandle(action,element){
 const sid=element.dataset.student;
 const sourceRenderEpoch=renderEpoch,requestEpoch=++archiveRequestEpoch;
 const current=()=>sourceRenderEpoch===renderEpoch&&requestEpoch===archiveRequestEpoch&&view==='profile'&&paper()?.student_id===sid&&currentProfile?.student.id===sid;
 if(!current())throw Error('档案学生已切换，请在当前学生重新选择');
 if(action==='archive-open'||action==='archive-latest'){
  const source=await api('profiles/'+sid+'/evidence/'+encodeURIComponent(element.dataset.event));
  if(!current())throw Error('学生已切换，已取消上一学生的证据查看');
  if(source.student.id!==sid)throw Error('确认记录学生不匹配');
  if($('#modal').open)close();modal(archiveEvidenceHTML(source));return;
 }
 if(action==='archive-current'){
  if(!canLeave())return;
  const p=await api('papers/'+element.dataset.paper);
  if(!current())throw Error('学生已切换，请重新选择');
  if(p.student_id!==sid)throw Error('来源原卷不属于当前学生');
  close();paperId=p.id;selectedDoc=0;view='review';learningPracticeFocus=null;await refresh();
 }
}
