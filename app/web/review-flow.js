'use strict';
let reviewFlowEdits=0,reviewFlowRead=0;
function reviewFlowNext(batch,currentId){
 if(!batch||!Array.isArray(batch.papers))return null;
 const index=batch.papers.findIndex(p=>p.id===currentId&&p.batch_id===batch.batch_id);
 if(index<0)return null;
 for(let step=1;step<batch.papers.length;step++){
  const p=batch.papers[(index+step)%batch.papers.length];
  if(p.batch_id===batch.batch_id&&p.version!==p.confirmed_version)return p;
 }
 return null;
}
function reviewFlowSame(a,b){
 return !!a&&!!b&&a.id===b.id&&a.student_id===b.student_id&&a.batch_id===b.batch_id&&a.version===b.version&&a.confirmed_version===b.confirmed_version;
}
function reviewFlowError(host,message){
 host.reviewFlowCandidate=null;
 host.innerHTML=`<div class="panel-head"><h3>本批连续审核</h3><button data-action="review-flow-refresh">刷新本批状态</button></div><p class="bad">${esc(message)}</p><div class="row"><button data-action="review-flow-reload">重新读取当前整卷</button><button data-action="review-flow-next" disabled>下一份同批待审</button></div>`;
}
function reviewFlowShow(host,snapshot,p){
 const batch=snapshot.batches.find(b=>b.batch_id===p.batch_id),source=batch?.papers.find(row=>row.id===p.id);
 if(!source){reviewFlowError(host,'清单中没有当前卷，请重新读取当前整卷；不会猜测其他学生。');return;}
 if(!reviewFlowSame(source,p)){reviewFlowError(host,'当前卷已更新，请重新读取当前整卷后继续。');return;}
 const next=reviewFlowNext(batch,p.id),waiting=p.version!==p.confirmed_version;
 host.reviewFlowCandidate=next?{...next}:null;
 host.innerHTML=`<div class="panel-head"><div><h3>本批连续审核 · ${esc(batch.batch_id)}</h3><p class="micro muted">应收人数未知；已收卷数不代表收齐，确认也不代表材料齐全或已经掌握。</p></div><button data-action="review-flow-refresh">刷新本批状态</button></div><div class="review-flow-counts">${[['received',batch.paper_count,'已收卷'],['confirmed',batch.confirmed_papers,'本版已确认'],['waiting',batch.waiting_papers,'待审'],['issues',batch.issue_papers,'有处理提示']].map(([key,n,label])=>`<span><strong data-review-flow="${key}">${n}</strong> ${label}</span>`).join('')}</div><p>${waiting?'当前卷仍待审；切换不会确认或保存此卷。':'当前版本已确认；新修改仍需保存并重新确认。'} 切换前请保留未保存文字。</p><div class="row"><button class="primary" data-action="review-flow-next" ${next?'':'disabled'}>${next?'下一份同批待审：'+esc(next.student_ref)+' · '+esc(next.student_name):'暂无其他同批待审卷'}</button><button data-view="intake">返回批次收件</button></div>${next?'':'<p class="micro muted">没有其他候选时留在当前卷；仍需核对材料、缺页与待核对题。</p>'}`;
}
async function reviewFlowRender(p){
 const host=$('#review-flow');if(!host)return;
 const epoch=renderEpoch,read=++reviewFlowRead;
 const current=()=>host.isConnected&&view==='review'&&paperId===p.id&&paper()?.version===p.version&&renderEpoch===epoch&&read===reviewFlowRead&&!materialsReloadNeeded;
 host.reviewFlowCandidate=null;
 host.innerHTML='<h3>本批连续审核</h3><p class="micro muted">正在读取本机进度…</p><button data-action="review-flow-next" disabled>下一份同批待审</button>';
 try{const snapshot=await api('intake');if(current())reviewFlowShow(host,snapshot,p);}
 catch(error){if(current())reviewFlowError(host,error.message);}
}
async function reviewFlowHandle(action){
 const source=paper(),host=$('#review-flow');if(!source||view!=='review'||!host)throw Error('请先打开学生整卷');
 if(action==='review-flow-refresh'){await reviewFlowRender(source);return;}
 if(!canLeave())return;
 const epoch=renderEpoch,edits=reviewFlowEdits,displayed=host.reviewFlowCandidate;
 const sameSource=()=>host.isConnected&&view==='review'&&paperId===source.id&&renderEpoch===epoch&&reviewFlowSame(paper(),source)&&!materialsReloadNeeded;
 const current=()=>sameSource()&&reviewFlowEdits===edits&&!$('#modal').open;
 const nextButton=$('[data-action=review-flow-next]',host);if(nextButton)nextButton.disabled=true;
 try{
  let target;
  if(action==='review-flow-next'){
   const snapshot=await api('intake');if(!current())return;
   const batch=snapshot.batches.find(b=>b.batch_id===source.batch_id),freshSource=batch?.papers.find(p=>p.id===source.id);
   if(!reviewFlowSame(freshSource,source))throw Error('当前卷已更新，请重新读取当前整卷');
   if(!displayed){reviewFlowShow(host,snapshot,source);return;}
   target=batch.papers.find(p=>p.id===displayed.id);
   if(!reviewFlowSame(target,displayed)||target.version===target.confirmed_version)throw Error('原先显示的目标卷已更新，请刷新本批状态；未改跳其他学生');
   const actualSource=await api('papers/'+source.id);if(!current())return;
   if(!reviewFlowSame(actualSource,source))throw Error('当前卷在读取期间已更新，请重新读取');
  }else if(action==='review-flow-reload'){
   target=await api('papers/'+source.id);if(!current())return;
   if(target.id!==source.id||target.student_id!==source.student_id||target.batch_id!==source.batch_id)throw Error('当前卷归属已变化，已停止读取');
  }else return;
  const fresh=await api('papers/'+target.id);if(!current())return;
  if(!reviewFlowSame(fresh,target))throw Error('目标卷已更新，请刷新本批状态；未改跳其他学生');
  const boot=await api('bootstrap');if(!current())return;
  if(!reviewFlowSame(boot.papers.find(p=>p.id===target.id),target))throw Error('目标卷在读取期间已更新，请刷新');
  if(action==='review-flow-next'&&!reviewFlowSame(boot.papers.find(p=>p.id===source.id),source))throw Error('当前卷在读取期间已更新，请重新读取');
  data=boot;token=boot.csrf_token;paperId=target.id;selectedDoc=0;selectedExercise='';selectedExerciseVersion=null;
  history.replaceState(null,'','#review');await render();
 }catch(error){if(current())reviewFlowError(host,error.message);}
 finally{
  if(sameSource()&&(reviewFlowEdits!==edits||$('#modal').open)){
   await reviewFlowRender(source);
   if(sameSource())host.insertAdjacentHTML('beforeend','<p class="notice">本次切换已取消：当前有新编辑或打开了窗口。内容保留，请核对后重新选择。</p>');
  }
 }
}
