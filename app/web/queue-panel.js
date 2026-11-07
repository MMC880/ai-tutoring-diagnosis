'use strict';
const queueLabels={SOURCE_UNVERIFIED:'来源待核实',REVIEW_DRAFT:'题面待审',WAITING_RETEST:'等待复测',RETEST_UNRESOLVED:'复测材料待核',CONDITION_UNCONFIRMED:'完成条件待核',NEEDS_REVIEW:'仍需辅导与补齐',NEEDS_INDEPENDENT_RETEST:'需独立复测',OBSERVE:'后续观察'};
let queueSnapshot=null,queueBatch='',queueFilter='';
function queueSame(a,b){
 return !!a&&!!b&&['id','student_id','paper_id','batch_id','version','status','paper_version','confirmed_version','source_event_id','source_revision','latest_retest_id','current_retest_id','action'].every(key=>a[key]===b[key])&&JSON.stringify(a.approved_versions)===JSON.stringify(b.approved_versions);
}
function queuePaperMatches(row,p){return !!p&&p.id===row.paper_id&&p.student_id===row.student_id&&p.batch_id===row.batch_id&&p.version===row.paper_version&&p.confirmed_version===row.confirmed_version;}
async function queuePage(){
 const epoch=renderEpoch;queueSnapshot=null;
 try{
  const result=await api('practice-queue');if(epoch!==renderEpoch||view!=='queue')return '';
  queueSnapshot=result;
  if(queueBatch&&!result.batches.includes(queueBatch))queueBatch='';
  const batchRows=result.items.filter(row=>!queueBatch||row.batch_id===queueBatch),rows=batchRows.filter(row=>!queueFilter||row.action===queueFilter);
  const count=key=>batchRows.filter(row=>row.action===key).length;
  const needs=batchRows.filter(row=>!['REVIEW_DRAFT','WAITING_RETEST','OBSERVE'].includes(row.action)).length;
  return `<div class="queue-workspace"><section class="panel"><div class="panel-head"><h2>补练复测待办</h2><button data-action="queue-refresh">刷新待办</button></div><p>按已有练习记录整理下一步处理线索，不判断到期、是否发放或学生已经完成。每组练习只列一次，原卷与复测分开，一次答对不认定掌握。</p><div class="two"><label class="field"><span>来源作业批次</span><select id="queue-batch"><option value="">全部批次</option>${result.batches.map(batch=>`<option value="${esc(batch)}" ${batch===queueBatch?'selected':''}>${esc(batch)}</option>`).join('')}</select></label><label class="field"><span>处理类别</span><select id="queue-filter">${options({'':'全部类别',...queueLabels},queueFilter)}</select></label></div></section><div class="stats">${[['total',batchRows.length,'当前范围练习组'],['draft',count('REVIEW_DRAFT'),'题面待审'],['waiting',count('WAITING_RETEST'),'等待复测'],['needs',needs,'需继续核对或辅导']].map(([key,n,title])=>`<div class="card stat"><strong data-queue-count="${key}">${n}</strong><span>${title}</span></div>`).join('')}</div><div class="queue-list">${rows.map(queueRowHTML).join('')||'<section class="panel"><p>当前范围暂无练习记录。没有补练不等于学生未交或已经掌握。</p></section>'}</div></div>`;
 }catch(error){if(epoch!==renderEpoch||view!=='queue')return '';return `<section class="panel queue-workspace queue-error"><h2>待办暂时无法读取</h2><p>${esc(error.message)}</p><button data-action="queue-refresh">重新读取待办</button></section>`;}
}
function queueRowHTML(row){
 return `<article class="panel queue-item" data-queue-id="${esc(row.id)}"><div class="panel-head"><div><h3>${esc(row.student_ref)} · ${esc(row.student_name)}</h3><p>${esc(row.knowledge||'知识来源待核实')} · ${esc(row.level)}</p></div><span class="tag">${esc(queueLabels[row.action])}</span></div><p>${esc(row.batch_id)} / ${esc(row.title)} / ${esc(row.question_id)}<br><small>当前原卷V${row.paper_version}${row.paper_version!==row.confirmed_version?'，有待审修订':''} · 固定来源${row.source_revision?'R'+row.source_revision:'待核实'}${row.source_has_later_confirmation?'，原题已有后续确认':''}</small></p><p>当前练习V${row.version} · ${row.status==='APPROVED'?'已批准':'待审题面'}；已批题面${row.approved_versions.length?'V'+row.approved_versions.join('、V'):'无'}。</p><p>当前版观察：${esc(followupLabels[row.current_observation]||'待核实')} · 当前V${row.version}复测${row.current_retest_count}次</p><p class="micro">这组练习历史累计${row.retest_count}次复测，各题面版本分别保留。</p>${row.current_last_retest?`<p>当前版最后录入：${tag(row.current_last_retest.result)} · ${esc(row.current_last_retest.condition)} · 复测题面V${row.current_last_retest.version}<br><small>${esc(archiveTime(row.current_last_retest.created_at))}，不是实际考试日期。</small></p>`:'<p class="micro muted">当前版暂无复测，不推测学生已经完成。</p>'}${row.last_retest&&row.last_retest.id!==row.current_retest_id?`<p class="notice warn">其他版本最近记录：${esc(followupLabels[row.observation]||'待核实')}<br>${tag(row.last_retest.result)} · ${esc(row.last_retest.condition)} · 复测题面V${row.last_retest.version}<br>旧版记录不代替当前题面结果。</p>`:''}${row.action==='SOURCE_UNVERIFIED'?'<p class="notice warn">旧练习缺少固定原题确认，先核对来源，不按现在原题倒推。</p>':''}<button data-action="queue-open" data-queue-exercise="${esc(row.id)}">打开这组补练 · 当前V${row.version}</button><p class="micro muted">只打开本机已有练习；审题、选择旧版本、导出和录入复测仍由老师分别操作。</p></article>`;
}
async function queueSelect(element){
 if(view!=='queue')return;
 if(element.id==='queue-batch')queueBatch=element.value;
 if(element.id==='queue-filter')queueFilter=element.value;
 await render();
}
async function queueHandle(action,element){
 if(view!=='queue')throw Error('请回补练复测待办重新选择');
 if(action==='queue-refresh'){await render();return;}
 if(action!=='queue-open'||!canLeave())return;
 const snapshot=queueSnapshot,source=snapshot?.items.find(row=>row.id===element.dataset.queueExercise);
 if(!source||queueBatch&&source.batch_id!==queueBatch||queueFilter&&source.action!==queueFilter)throw Error('待办已变化，请刷新后重新选择');
 const epoch=renderEpoch,batch=queueBatch,filter=queueFilter,edits=reviewFlowEdits,sourcePaperId=paperId;
 const current=()=>view==='queue'&&epoch===renderEpoch&&queueSnapshot===snapshot&&queueBatch===batch&&queueFilter===filter&&paperId===sourcePaperId&&reviewFlowEdits===edits&&!$('#modal').open;
 const fresh=await api('practice-queue');if(!current())return;
 if(!queueSame(source,fresh.items.find(row=>row.id===source.id)))throw Error('这组练习或复测已更新，请刷新待办；未改跳其他学生');
 const boot=await api('bootstrap');if(!current())return;
 const p=boot.papers.find(row=>row.id===source.paper_id),exercise=boot.exercises.find(row=>row.id===source.id);
 if(!queuePaperMatches(source,p)||!exercise||exercise.paper_id!==source.paper_id||exercise.student_id!==source.student_id||exercise.version!==source.version||exercise.status!==source.status||exercise.source_event_id!==source.source_event_id&&!(exercise.source_event_id===undefined&&source.source_event_id===null))throw Error('原卷或练习已更新，请刷新待办');
 const final=await api('practice-queue');if(!current())return;
 if(!queueSame(source,final.items.find(row=>row.id===source.id)))throw Error('读取期间练习或复测已更新，请刷新待办');
 data=boot;token=boot.csrf_token;paperId=p.id;view='practice';selectedExercise=source.id;selectedExerciseVersion=null;selectedDoc=0;learningPracticeFocus=null;
 history.replaceState(null,'','#practice');await render();
}
