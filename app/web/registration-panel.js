'use strict';
function newPaperFormHTML(){
 const student=view==='registration'?data.students.find(s=>s.id===profileStudentId):null;
 return `<section class="new-paper-form"><div class="new-paper-head"><h2>登记一份学生作业</h2><p class="form-hint">以老师的批改结果为准，创建后先保留待审。</p></div><div class="new-paper-body"><div class="two"><label class="field"><span>学生编号</span><input id="new-ref" name="student-ref" autocomplete="off" placeholder="例如 S001" maxlength="60" value="${esc(student?.ref||'')}"></label><label class="field"><span>学生称呼</span><input id="new-name" name="student-name" autocomplete="off" placeholder="例如 学生01" maxlength="100" value="${esc(student?.name||'')}"></label></div><label class="field"><span>作业标题</span><input id="new-title" name="assignment-title" autocomplete="off" placeholder="例如 二次函数周测" maxlength="160"></label><label class="field"><span>同次作业编号</span><input id="new-batch" name="assignment-batch" autocomplete="off" placeholder="例如 数学周测-1108" maxlength="100"><small>同一次作业的学生用同一编号；不同作业请区分。</small></label><label class="field"><span>学生作业原件（可多选，每个不超过15MB）</span><input id="new-files" type="file" multiple accept=".png,.jpg,.jpeg,.pdf,.docx"></label><details class="new-paper-options"><summary>日期与参考答案（选填）</summary>${dateFieldHTML()}<label class="field"><span>老师提供的原题／参考答案（选填）</span><input id="new-references" type="file" multiple accept=".png,.jpg,.jpeg,.pdf,.docx"></label></details><p class="micro muted">也可先不附原件，创建手工录入草稿。附件保存到本机，不自动识别或归档。</p></div><div class="actions new-paper-actions"><button data-action="close">取消</button><button class="primary" data-action="create-paper" id="create-paper">创建待录入草稿</button></div></section>`;
}
function registrationReviewMatchesStudent(){return !!paper()&&paper().student_id===profileStudentId;}
function registrationNavigationAllowed(target){
 if(view==='registration'&&target==='review'&&!registrationReviewMatchesStudent()){
  toast('请先选择当前学生的一份作业，不会打开上一名学生的卷子。');return false;
 }
 return true;
}
function registrationPage(){
 const student=data.students.find(s=>s.id===profileStudentId),papers=student?data.papers.filter(p=>p.student_id===student.id):[];
 const content=!data.students.length?'<section class="panel empty"><h2>暂无学生</h2><p>先收一份作业，在本机建立学生和作业记录。</p><button class="primary" data-action="new">收一份作业</button></section>':!student?'<section class="panel empty"><h2>先选学生，再选一份作业</h2><p>按姓名或编号找人。不会自动打开第一份卷子。</p></section>':`<section class="panel"><div class="panel-head"><div><h2>${esc(student.name)} 的作业</h2><p class="micro muted">学生编号：${esc(student.ref)} · ${papers.length}份已有作业</p></div><button data-action="new">收这名学生的新作业</button></div><p class="form-hint">请选择要核对的那一份；保存只形成待审稿，明确确认后才进入档案。</p><div class="registration-papers">${papers.map(p=>`<article class="registration-paper" data-paper="${esc(p.id)}"><h3>${esc(p.title)}</h3><p>${esc(p.batch_id)} · 作业日期：${esc(p.assignment_date||'未提供')}<br>V${p.version} · ${status(p)} · ${p.questions.length}项登记题目</p><button class="primary" data-action="registration-open" data-paper="${esc(p.id)}" data-student="${esc(student.id)}">打开这份作业</button></article>`).join('')||'<p class="muted">暂无作业，请先收件；不推测学生未交或已掌握。</p>'}</div></section>`;
 return `<div id="registration-page"><p class="notice">选学生和作业 → 核对问题 → 保存待审 → 明确确认归档</p><div class="registration-actions"><button data-action="registration-refresh">刷新本机作业列表</button></div><div class="student-archive-layout">${archiveRosterHTML('registration-select')}<section id="registration-content" data-student="${esc(student?.id||'')}">${content}</section></div></div>`;
}
async function registrationHandle(action,element){
 if(action==='registration-refresh'){
  if(view!=='registration'||!canLeave())return;
  const epoch=renderEpoch,sid=profileStudentId,edits=reviewFlowEdits,boot=await api('bootstrap');
  if(view!=='registration'||renderEpoch!==epoch||profileStudentId!==sid||reviewFlowEdits!==edits||$('#modal').open)return;
  data=boot;token=boot.csrf_token;await render();return;
 }
 if(action==='registration-choose'||action==='registration-profile'){
  const p=paper();
  if(view!=='review'||!p||element.dataset.paper!==p.id||element.dataset.student!==p.student_id)throw Error('当前作业已变化，请重新选择');
  if(!canLeave())return;
  profileStudentId=p.student_id;currentProfile=null;
  view=action==='registration-profile'?'profile':'registration';history.replaceState(null,'','#'+view);await render();return;
 }
 if(action!=='registration-open')return;
 if(view!=='registration'||!canLeave())return;
 const source=data.papers.find(p=>p.id===element.dataset.paper),sid=profileStudentId,epoch=renderEpoch,edits=reviewFlowEdits;
 if(!source||source.student_id!==sid||element.dataset.student!==sid)throw Error('作业归属已变化，请重新选择学生');
 const current=()=>view==='registration'&&profileStudentId===sid&&renderEpoch===epoch&&reviewFlowEdits===edits&&!$('#modal').open;
 const fresh=await api('papers/'+source.id);if(!current())return;
 if(!reviewFlowSame(fresh,source))throw Error('这份作业已更新，请重新读取作业列表后选择');
 const boot=await api('bootstrap');if(!current())return;
 if(!reviewFlowSame(boot.papers.find(p=>p.id===source.id),fresh))throw Error('作业在读取期间已变化，请重新读取列表');
 data=boot;token=boot.csrf_token;paperId=source.id;selectedDoc=0;selectedExercise='';selectedExerciseVersion=null;learningPracticeFocus=null;
 view='review';history.replaceState(null,'','#review');await render();
}
function registrationReviewContext(p){
 return `<section class="panel registration-context" id="registration-context"><div class="panel-head"><div><h2>${esc(p.student_name)} · ${esc(p.student_ref)}</h2><p>作业批次：${esc(p.batch_id)} · V${p.version} · ${status(p)}</p></div><button data-action="registration-choose" data-paper="${esc(p.id)}" data-student="${esc(p.student_id)}">更换学生或作业</button></div><div class="registration-controls"><label class="workspace-paper-picker"><span>当前学生的作业</span>${workspacePaperSelectHTML(p)}</label>${dateSummaryHTML(p)}</div><p class="notice warn registration-coverage">登记范围未标明，不代表整卷全部结果。保存和确认针对已登记的全部题目；未录题目不计为正确。</p></section>`;
}
function registrationQuestionPreview(q){
 return `<p class="registration-preview-stem">${esc(q.stem)}</p><p>原答摘要：${esc(q.answer||'未录入')}<br>原卷老师判定：${esc(labels[q.teacher_result]||'未录入／不清楚')}</p>`;
}
function registrationQuestionHTML(q,fullHTML){
 // Move existing controls, preserving every field exactly once for the established save collector.
 const template=document.createElement('template');template.innerHTML=fullHTML;
 const row=template.content.firstElementChild,title=row.querySelector('.qtitle'),knowledge=row.querySelector('[data-field=knowledge]').closest('label');
 title.remove();knowledge.remove();
 title.querySelector('select').insertAdjacentHTML('beforebegin','<span class="micro muted">本次判定</span>');
 const details=document.createElement('details');details.className='question-details';details.innerHTML='<summary>展开原题、学生作答、老师批注与核对详情</summary>';
 details.append(...Array.from(row.childNodes));
 const preview=document.createElement('div');preview.className='registration-preview';preview.innerHTML=registrationQuestionPreview(q);
 const alert=document.createElement('p');alert.className='registration-alert notice warn';alert.hidden=true;
 row.append(title,preview,knowledge,alert,details);
 return template.innerHTML;
}
function registrationRefreshRows(){
 const questions=collectQuestions();
 $$('#questions .question').forEach((row,index)=>{
  const q=questions[index],alert=$('.registration-alert',row);if(!alert)return;
  $('.registration-preview',row).innerHTML=registrationQuestionPreview(q);
  const issue=questionNavigationIssue(q);alert.hidden=!issue;
  alert.textContent=issue?'本题有识读疑点或批改分歧，请展开详情核对；未核清时保留待核对或缺材料。':'';
  if(issue)$('.question-details',row).open=true;
 });
}
async function registrationWrite(kind){
 const source=paper();if(view!=='review'||!source)throw Error('请先选择要核对的作业');
 if(kind==='confirm'&&dirty)throw Error('先保存草稿，再重新确认本版本');
 const epoch=renderEpoch,edits=reviewFlowEdits;
 const current=()=>view==='review'&&renderEpoch===epoch&&paperId===source.id&&reviewFlowSame(paper(),source)&&reviewFlowEdits===edits&&!$('#modal').open;
 const payload=kind==='save'?{version:source.version,questions:collectQuestions()}:{version:source.version,consent:$('#confirm-consent').checked};
 const reply=await api('papers/'+source.id+(kind==='save'?'/draft':'/confirm'),payload);
 const moved=()=>toast((kind==='save'?'保存':'确认')+'请求已返回；页面已有新编辑或已切换，未覆盖当前内容。请回原作业核对本机状态。');
 if(!current()){moved();return;}
 const saved=kind==='save'?reply:reply.paper,boot=await api('bootstrap');
 if(!current()){moved();return;}
 if(!reviewFlowSame(saved,boot.papers.find(p=>p.id===source.id)))throw Error('本机作业又有变化，未覆盖当前输入；请保留文字并重新读取当前整卷');
 data=boot;token=boot.csrf_token;await render();
 toast(kind==='save'?'草稿已保存到本机；请核对后确认当前版本。':reply.added?'整卷确认已写入本机档案；历史将保留。':'此版本已确认，无重复写入。');
}
