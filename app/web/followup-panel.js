'use strict';
const followupLabels={WAITING_APPROVAL:'练习待老师审批',WAITING_RETEST:'已批准题面，等待复测',RETEST_UNRESOLVED:'本次材料或判定待核实',CONDITION_UNCONFIRMED:'完成条件待核实',NEEDS_REVIEW:'本次仍需讲解与补齐',NEEDS_INDEPENDENT_RETEST:'本次有提示，仍需独立复测',INDEPENDENT_CORRECT_OBSERVE:'本次独立答对，仍需后续观察'};
function learningFollowupHTML(group){
 const f=group.followup;if(!f)return '';
 if(!f.exercise_count)return '<div class="knowledge-followup"><h4>这个知识点补练得怎样</h4><p class="micro muted">尚无关联补练；原卷问题保留，不推测已完成或已掌握。</p></div>';
 return `<div class="knowledge-followup"><h4>这个知识点补练得怎样</h4><p>${f.exercise_count} 组补练 · ${f.retest_count} 次复测记录</p><p>${Object.entries(f.observations).map(([key,count])=>`${count}组：${esc(followupLabels[key]||'待核实')}`).join('；')}</p><p class="micro muted">各组按最后录入的一次复测分别观察，不相互抵消。累计记录不等于独立作答次数，一次答对不认定掌握，也不删除原错题；记录时间不是考试日期。</p><details><summary>查看各组练习的最近进展</summary>${f.items.map(item=>`<div class="followup-item"><strong>${esc(item.level)} · 当前练习V${item.current_version}</strong><p>${esc(followupLabels[item.observation]||'待核实')}</p><p class="micro">固定来源原题R${item.source_revision}${item.source_has_later_confirmation?'，原题已有后续确认，保留当时来源':''} · ${item.approved_version_count}个已批准题面版本 · ${item.retest_count}次复测</p>${item.current_draft?'<p class="notice warn">当前有待审题面；原审批和复测只对应当时版本。</p>':''}${item.last_retest?`<p>最后录入：${tag(item.last_retest.result)} · ${esc(item.last_retest.condition)} · 复测题面V${item.last_retest.version}<br><small>${esc(archiveTime(item.last_retest.created_at))}</small></p>`:'<p class="micro">尚无复测，已批准也不代表学生已完成。</p>'}<button data-action="followup-locate" data-group="${esc(group.id)}" data-followup-exercise="${esc(item.exercise_id)}">定位完整补习复测过程</button></div>`).join('')}</details></div>`;
}
function followupHandle(action,element){
 if(action!=='followup-locate')return;
 const profile=currentProfile;
 const group=profile?.learning_analysis?.groups.find(g=>g.id===element.dataset.group);
 const item=group?.followup?.items.find(i=>i.exercise_id===element.dataset.followupExercise);
 const journey=profile?.learning_journeys?.find(j=>j.exercise.id===item?.exercise_id&&j.source?.id===item.source_event_id);
 if(view!=='profile'||!profile?.student||profile.student.id!==paper()?.student_id||!item||!journey)throw Error('这组补练或当前学生已变化，请重新读取档案');
 const target=$$('.learning-journey').find(e=>e.dataset.exercise===item.exercise_id);
 if(!target)throw Error('完整过程已变化，请重新读取档案后定位');
 $$('.learning-journey.journey-focus').forEach(e=>e.classList.remove('journey-focus'));
 target.classList.add('journey-focus');target.tabIndex=-1;target.scrollIntoView({block:'start'});target.focus({preventScroll:true});
}
