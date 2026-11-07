'use strict';
let intakeSnapshot={batches:[]},intakeBatch='',intakeFilter='all';
async function intakePage(){
 const epoch=renderEpoch,result=await api('intake');
 if(epoch!==renderEpoch||view!=='intake')return '';
 intakeSnapshot=result;
 if(!result.batches.length)return '<section class="panel empty" id="intake-empty"><h2>尚未收到作业</h2><p>先收一名学生的一整份数学作业，再按批次查看处理进度。</p><button class="primary" data-action="new">收一份作业</button></section>';
 if(!result.batches.some(b=>b.batch_id===intakeBatch))intakeBatch=result.batches.find(b=>b.batch_id===paper()?.batch_id)?.batch_id||result.batches[0].batch_id;
 const batch=result.batches.find(b=>b.batch_id===intakeBatch);
 const rows=batch.papers.filter(p=>intakeFilter==='all'||intakeFilter==='waiting'&&p.review_state!=='CONFIRMED'||intakeFilter==='issues'&&p.has_issues);
 const stats=[['received',batch.paper_count,'本批已收卷'],['confirmed',batch.confirmed_papers,'本版已确认'],['waiting',batch.waiting_papers,'待审核 / 修订待审'],['issues',batch.issue_papers,'有处理提示的卷']];
 return `<div class="intake-workspace"><section class="panel"><div class="panel-head"><h2>批次收件工作台</h2><button data-action="intake-refresh">刷新本机进度</button></div><div class="two"><label class="field"><span>作业批次</span><select id="intake-batch">${result.batches.map(b=>`<option value="${esc(b.batch_id)}" ${b.batch_id===intakeBatch?'selected':''}>${esc(b.batch_id)} · 已收${b.paper_count}卷</option>`).join('')}</select></label><label class="field"><span>处理筛选</span><select id="intake-filter">${options({all:'全部已收卷',waiting:'待审核',issues:'有处理提示'},intakeFilter)}</select></label></div><p class="micro muted">应收人数未知：这里只列已收到的作业，不能判断哪些学生未交。附件数量不等于页数，整卷是否完整仍需对照原件。</p></section><div class="stats intake-stats">${stats.map(([key,n,label])=>`<div class="card stat"><strong data-intake-count="${key}">${n}</strong><span>${label}</span></div>`).join('')}</div><p class="notice">“本版已确认”与“有处理提示”可以同时存在；已确认卷仍可能留有待核对或缺材料。逐人打开整卷审核，再单独确认该学生结果。</p><div class="intake-list">${rows.map(intakePaperHTML).join('')||'<section class="panel"><p>当前筛选没有符合的作业。</p></section>'}</div></div>`;
}
function intakePaperHTML(p){
 const hints=[];
 if(p.pending_questions)hints.push(`待核对${p.pending_questions}题`);
 if(p.missing_questions)hints.push(`缺材料${p.missing_questions}题`);
 if(p.recognition_questions)hints.push(`识读疑点${p.recognition_questions}题`);
 if(p.grading_questions)hints.push(`批改分歧${p.grading_questions}题`);
 if(p.duplicate_attachments)hints.push(`卷内重复附件${p.duplicate_attachments}份（按内容核对）`);
 if(!p.assignment_attachments)hints.push('未附作业原件，可能已人工录入，请核对');
 return `<article class="panel intake-paper" data-paper="${p.id}"><div class="panel-head"><div><h3>${esc(p.student_name)}</h3><p class="micro muted">${esc(p.student_ref)} · ${esc(p.title)} · V${p.version}</p></div><span class="tag">${{DRAFT:'待审核',REVISED:'修订待审',CONFIRMED:'本版已确认'}[p.review_state]}</span></div><p>作业附件${p.assignment_attachments}份，其中照片${p.photo_count}张；参考附件${p.reference_attachments}份。</p><p class="${hints.length?'bad':'muted'}">${hints.join('；')||'当前未记录识读或批改疑点，仍需老师对照整卷。'}</p>${p.shared_photos.length?`<p class="notice warn intake-shared">照片内容与本批 ${p.shared_photos.map(x=>esc(x.student_ref)).join('、')} 的作业相同，请核对归属；不自动合并或删除。</p>`:''}<button data-action="intake-open" data-paper="${p.id}">打开这名学生整卷</button></article>`;
}
async function intakeSelect(el){
 if(view!=='intake')return;
 if(el.id==='intake-batch')intakeBatch=el.value;
 if(el.id==='intake-filter')intakeFilter=el.value;
 await render();
}
async function intakeHandle(action,el){
 if(view!=='intake')throw Error('请回到批次收件页重新选择');
 if(action==='intake-refresh'){await render();return;}
 if(action!=='intake-open')return;
 if(!canLeave())return;
 const epoch=renderEpoch,batch=intakeBatch;
 const source=intakeSnapshot.batches.find(b=>b.batch_id===batch)?.papers.find(p=>p.id===el.dataset.paper);
 if(!source)throw Error('本批作业已变化，请刷新后重新选择');
 const current=()=>epoch===renderEpoch&&view==='intake'&&intakeBatch===batch;
 const fresh=await api('papers/'+source.id);if(!current())return;
 const matches=p=>p?.id===source.id&&p.student_id===source.student_id&&p.batch_id===batch&&p.version===source.version&&p.confirmed_version===source.confirmed_version;
 if(!matches(fresh))throw Error('该卷已更新，请刷新本批进度再打开');
 const boot=await api('bootstrap');if(!current())return;
 if(!matches(boot.papers.find(p=>p.id===source.id)))throw Error('该卷在读取期间发生变化，请刷新本批进度');
 data=boot;token=boot.csrf_token;paperId=source.id;selectedDoc=0;selectedExercise='';selectedExerciseVersion=null;
 view='review';history.replaceState(null,'','#review');await render();
}
