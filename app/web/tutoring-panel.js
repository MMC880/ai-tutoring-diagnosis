'use strict';
const tutorSections={original_explanation:'原题讲解',review:'题目复盘',knowledge_summary:'知识点归纳',solution_model:'通用解题模型',variants:'分类变式',transfer:'举一反三建议'};
function tutorTeachingHTML(q){
 return `<section class="tutor-teaching"><h3>本地教学资料（可选）</h3>${q.teaching_ref?'<button data-action="tutor-load-reference">读取本题固定的已审核条目</button>':'<p>本题尚未关联已审核条目；可先回原卷关联并重新确认，或仅用原题拟候选。</p>'}<p id="tutor-teaching-source" class="micro">默认不附带教学资料，不检索或发送整库。</p><label><input type="checkbox" id="tutor-include-teaching" disabled> 本次附带下方经我核对的节选</label><label class="field"><span>本次资料节选（最多4000字，可删去不必要信息）</span><textarea id="tutor-teaching-excerpt" maxlength="4000" disabled></textarea></label></section>`;
}
function tutorContextPreview(job){
 const context=job.metadata.teaching_context;
 if(!context)return '<p class="micro">本次未附带教学资料。</p>';
 const sent=JSON.parse(job.payload.messages[1].content).teaching;
 return `<section class="issue tutor-context"><h3>本次外发教学节选</h3><p>${esc(sent.knowledge)} · ${esc(sent.question_type)}</p><pre>${esc(sent.content)}</pre><p class="micro">仅本机追溯：${esc(context.source_title)} / V${esc(context.reference.version)} / ${esc(context.locator)}。名称、出处和本地编号不在教学节选请求字段中。</p></section>`;
}
function tutorUnsaved(){if(dirty||($('#ex-stem')&&exerciseDirty()))throw Error('请先保存当前修改，再拟辅导或应用候选');}
function tutorMaterialModal(){
 tutorUnsaved();const {p,q}=currentPracticeSource();
 const material=Object.fromEntries(['id','stem','answer','correct_answer','knowledge','question_type','cause','result'].map(k=>[k,q[k]||'']));
 modal(`<h2>拟原题讲解与三级练习</h2><p>本机来源：${esc(p.student_name)} / ${esc(p.title)} / ${esc(q.id)} / V${p.version}</p><div class="notice warn">只发送本题的必要文字，不附带姓名、班级、原图或完整档案。请检查题目文字内是否夹带身份信息，可在下面删去。错因待核实时不会认定长期薄弱。</div><label class="field"><span>本次材料（保留题号，先核对再预览）</span><textarea id="tutor-material" rows="14" spellcheck="false">${esc(JSON.stringify(material,null,2))}</textarea></label>${tutorTeachingHTML(q)}<p class="micro">返回六步教师教案及三档新题候选，仍须核对数学正确性；不会自动审批或发给学生。</p><div class="actions"><button data-action="close">取消</button><button class="primary" data-action="tutor-prepare" data-paper="${p.id}" data-version="${p.version}" data-question="${esc(q.id)}">生成外发预览（不发送）</button></div>`);
}
function tutorShowJob(job){
 const p=data.papers.find(p=>p.id===job.paper_id),source=JSON.parse(job.payload.messages[1].content).source;
 const heading=`<h2>讲解与补练候选 · ${esc(aiLabels[job.status]||job.status)}</h2><p class="micro">本机来源：${esc(p?.student_name||'学生')} / ${esc(p?.title||'原卷')} / ${esc(job.metadata.source_question_id)} / V${job.paper_version}</p>`;
 if(job.status==='PREPARED'){
  modal(`${heading}<p class="path">目的地址：${esc(job.destination)}</p><p>模型：${esc(job.payload.model)} · 最多输出 ${job.payload.max_tokens} Token</p><div class="notice warn">本次只外发下方单题材料及明确选用的教学节选，可能产生服务用量。六步讲解与三档练习均是待老师核验的候选。</div><div class="issue"><strong>${esc(source.id)}</strong><p class="formula">${esc(source.stem)}</p><p>学生作答：${esc(source.answer)}</p><p>参考：${esc(source.correct_answer||'无参考')}</p><p>知识点：${esc(source.knowledge)}；题型：${esc(source.question_type)}；错因：${esc(source.cause||'待核实')}</p></div>${tutorContextPreview(job)}<details><summary>实际请求体（不含密钥）</summary><pre class="payload-preview">${esc(JSON.stringify(job.payload,null,2))}</pre></details><label><input id="ai-send-consent" type="checkbox"> 我已核对并去除身份信息，材料范围已获授权，允许这一次外发</label>${!aiSettings.key_loaded?'<p class="bad">本次会话没有密钥，请到AI服务页在本机填写。</p>':''}<div class="actions"><button data-action="close">取消</button><button id="ai-send" class="primary" data-action="ai-send" data-job="${job.id}" disabled>授权发送这一次</button></div>`);$('#modal').classList.add('tutor-modal');return;
 }
 const result=job.result,usable=result&&['SUCCEEDED','APPLIED'].includes(job.status);
 modal(`${heading}${job.error?`<div class="notice warn">${esc(job.error)}</div>`:''}<div class="notice warn">教师审稿区：格式合格不等于数学正确。请核对原题、教案、难度与答案。一次只选适合的一档；不要求每名学生做完三档。</div>${tutorContextPreview(job)}${usable?`<section class="tutor-lesson">${Object.entries(tutorSections).map(([key,label])=>`<div class="issue tutor-section"><h3>${label}</h3><p class="formula tutor-text">${esc(result.lesson[key])}</p></div>`).join('')}</section><h3>选择一档放入练习草稿</h3>${result.exercises.map(row=>`<article class="issue tutor-candidate"><label><input type="radio" name="tutor-level" value="${esc(row.level)}"> <strong>${esc(row.level)}</strong>${job.metadata.practice_drafts?.[row.level]?'（已建草稿，重复选择将打开现有版本）':''}</label><p class="formula tutor-text">${esc(row.stem)}</p><details><summary>仅教师：核对答案与本题讲解</summary><p class="formula tutor-text">${esc(row.answer)}</p><p class="tutor-text">${esc(row.explanation)}</p></details></article>`).join('')}<label><input id="tutor-consent" type="checkbox"> 仅建立所选练习草稿，不批准学生版；如已有草稿则打开现有版本</label><div class="actions"><button data-action="close">稍后处理</button><button class="primary" id="tutor-apply" data-action="tutor-apply" data-job="${job.id}" disabled>打开所选档练习草稿</button></div>`:'<div class="actions"><button data-action="close">关闭</button></div>'}<p class="micro muted">服务返回用量：${job.usage?esc(JSON.stringify(job.usage)):'未知／未返回'}。不自动重发；教案与教师答案不进入学生练习版。</p>`);$('#modal').classList.add('tutor-modal');
}
async function tutorHandle(action,el){
 if(action==='tutor-open'){tutorMaterialModal();return;}
 if(action==='tutor-load-reference'){
  tutorUnsaved();const {p,q}=currentPracticeSource(),epoch=renderEpoch,field=$('#tutor-teaching-excerpt');
  const links=await api('papers/'+p.id+'/teaching-links');
  if(epoch!==renderEpoch||paperId!==p.id||paper()?.version!==p.version||!field?.isConnected||!$('#modal').open)throw Error('原题或窗口已切换，请重新打开辅导');
  const entry=links.links[q.id];if(!entry||links.version!==p.version)throw Error('没有本题可用的已审核条目');
  field.value=entry.content;field.disabled=false;
  $('#tutor-teaching-source').textContent=`仅本机出处：${entry.source_title} / V${entry.source_version} / ${entry.locator}。核对并删去不必要内容后再选择附带。`;
  $('#tutor-include-teaching').checked=false;$('#tutor-include-teaching').disabled=false;return;
 }
 if(action==='tutor-prepare'){
  const field=$('#tutor-material'),epoch=renderEpoch,include=$('#tutor-include-teaching')?.checked||false;
  const job=await api('ai/prepare',{mode:'tutoring_generate',paper_id:el.dataset.paper,version:Number(el.dataset.version),question_id:el.dataset.question,material:JSON.parse(field.value),include_teaching:include,...(include?{teaching_excerpt:$('#tutor-teaching-excerpt').value}:{})});
  if(epoch!==renderEpoch||!field.isConnected||!$('#modal').open)return;
  aiSettings=await api('ai/settings');if(epoch!==renderEpoch||!field.isConnected||!$('#modal').open)return;close();tutorShowJob(job);return;
 }
 if(action==='tutor-apply'){
  tutorUnsaved();const level=$('input[name=tutor-level]:checked')?.value;if(!level||!$('#tutor-consent').checked)throw Error('请先选档，并确认仅建草稿');
  const job=await api('ai/jobs/'+el.dataset.job+'/practice',{level,consent:true});
  paperId=job.paper_id;selectedExercise=job.metadata.practice_drafts[level].exercise_id;selectedExerciseVersion=null;
  learningPracticeFocus={paperId,questionId:job.metadata.source_question_id,revision:job.paper_version};view='practice';close();
  await refresh('已打开所选档练习；未自动审批、导出或发布。再次使用候选不会覆盖老师修订。');return;
 }
}
document.addEventListener('change',ev=>{
 const el=ev.target;if(el.name==='tutor-level')$('#tutor-consent').checked=false;
 if(el.name==='tutor-level'||el.id==='tutor-consent')$('#tutor-apply').disabled=!$('input[name=tutor-level]:checked')||!$('#tutor-consent').checked;
});
