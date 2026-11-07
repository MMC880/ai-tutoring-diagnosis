'use strict';
// Local teacher evidence is independent of model suggestions and final draft result.
function gradingConflict(q){
 const evaluated=['CORRECT','INCORRECT','PARTIAL'];
 return evaluated.includes(q.teacher_result)&&['result','ai_result'].some(k=>evaluated.includes(q[k])&&q[k]!==q.teacher_result);
}
function gradingHTML(q){
 const conflict=gradingConflict(q);
 return `<section class="teacher-grading"><h3>老师原批改</h3><p class="micro muted">请对照原件录入。勾叉或简短批注即可；AI候选另列，未核实原因可以留空。</p><div class="two"><label class="field"><span>原卷老师判定</span><select data-field="teacher_result">${options({'':'未录入／标记不清',...labels},q.teacher_result||'')}</select></label><div class="field"><span>本次核对</span><button type="button" data-action="grading-use-teacher">采用老师原判</button></div></div><label class="field"><span>原卷批注（可选，保留原意）</span><textarea data-field="teacher_mark" maxlength="1500" rows="2">${esc(q.teacher_mark||'')}</textarea></label><input type="hidden" data-field="ai_result" value="${esc(q.ai_result||'')}"><p class="grading-status micro" aria-live="polite"></p><details class="grading-details" ${conflict?'open':''}><summary>批改分歧核对</summary><label class="field"><span>核对说明（有分歧时填写，写明保留或修正的依据）</span><textarea data-field="grading_note" maxlength="1500" rows="2">${esc(q.grading_note||'')}</textarea></label><label><input type="checkbox" data-field="grading_resolved" ${q.grading_resolved?'checked':''}> 我已对照原件核清当前分歧，认可本次最终判定</label><p class="micro muted">有分歧且仍要确认对错时，需要说明并勾选。也可暂留“待核对”，不作为确定错误。保存后仍需整卷确认。</p></details></section>`;
}
function gradingRefresh(row){
 const host=row.querySelector('.teacher-grading');if(!host)return;
 const value=k=>row.querySelector(`[data-field="${k}"]`)?.value||'';
 const q={teacher_result:value('teacher_result'),result:value('result'),ai_result:value('ai_result')};
 const conflict=gradingConflict(q),state=host.querySelector('.grading-status');
 state.classList.toggle('bad',conflict);
 state.textContent=`老师原批改：${labels[q.teacher_result]||'未录入／不清楚'} · AI候选判定：${labels[q.ai_result]||'未提供'} · 本次最终判定：${labels[q.result]||'待核对'}。`+(conflict?'存在批改分歧，请填写说明并核清，或暂留待核对。':'');
 if(conflict)host.querySelector('.grading-details').open=true;
}
function gradingInput(target){
 const row=target.closest('#questions .question');if(!row||!target.dataset.field)return;
 if(target.dataset.field!=='grading_resolved'){
  const ack=row.querySelector('[data-field=grading_resolved]');if(ack)ack.checked=false;
 }
 gradingRefresh(row);
}
function gradingHandle(action,button){
 if(action!=='grading-use-teacher')return;
 const row=button.closest('#questions .question'),original=row?.querySelector('[data-field=teacher_result]')?.value;
 if(!original)throw Error('请先对照原件选择老师原判；标记不清可以保留待核对');
 const final=row.querySelector('[data-field=result]');final.value=original;
 gradingInput(final);changed();toast('老师原判已填入本次待审判定；请保存并完成整卷核对。');
}
