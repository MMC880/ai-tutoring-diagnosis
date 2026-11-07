'use strict';
function photoProgressShell(p){
 if(!p.documents.some(d=>(d.role||'作业')==='作业'&&['image/png','image/jpeg'].includes(d.mime)))return '';
 return `<section id="photo-progress" data-paper="${p.id}" class="photo-progress"><h3>整卷照片处理清单</h3><p class="micro muted">正在读取本机处理记录…</p></section>`;
}
async function renderPhotoProgress(p){
 const host=$('#photo-progress');if(!host||host.dataset.paper!==p.id)return;
 const current=()=>host.isConnected&&host.dataset.paper===p.id&&view==='review'&&paperId===p.id;
 try{
  const progress=await api('papers/'+p.id+'/photo-progress');if(!current())return;
  host.innerHTML=`<div class="panel-head"><h3>整卷照片处理清单</h3><button data-action="photo-refresh" data-paper="${p.id}">刷新清单</button></div><p class="micro">${progress.total_images}张作业照片 · ${progress.images_with_saved_record}张有待审保存记录 · ${progress.images_without_saved_record}张尚无保存记录</p><p class="micro muted">只显示照片处理历史。有保存记录不代表当前内容完整、识别正确或老师已确认；PDF／Word仍在原件区核对。</p><div class="photo-list">${progress.images.map(row=>`<article class="photo-card" data-document="${row.document_id}"><strong>第${row.position}张 · ${esc(row.filename)}</strong><p>最近任务：${row.latest?esc(aiLabels[row.latest.status]||row.latest.status)+' · 来源V'+esc(row.latest.paper_version):'尚无任务'}</p>${row.saved?`<p class="photo-saved">曾保存至 V${row.saved.applied_version} 待审 · ${row.saved.source_method==='MANUAL_FALLBACK'?'本机人工整理，原调用状态保留':'老师核对AI转写'}<br><small>历史记录，不保证当前草稿仍保留本图全部内容。</small></p>`:'<p class="muted">尚无转写保存记录</p>'}<div class="row"><button data-action="photo-open" data-paper="${p.id}" data-document="${row.document_id}">裁切这张</button>${row.latest?`<button data-action="photo-job" data-paper="${p.id}" data-document="${row.document_id}" data-job="${row.latest.id}">查看最近任务</button>`:''}${row.saved&&row.saved.id!==row.latest?.id?`<button data-action="photo-job" data-paper="${p.id}" data-document="${row.document_id}" data-job="${row.saved.id}">查看曾保存记录</button>`:''}</div></article>`).join('')}</div>${progress.unlinked_jobs?`<p class="micro muted">${progress.unlinked_jobs}条旧图片任务无法关联本卷作业照片，未猜测归属。</p>`:''}`;
 }catch(e){if(current())host.innerHTML=`<h3>整卷照片处理清单</h3><p class="bad micro">${esc(e.message)}</p><button data-action="photo-refresh" data-paper="${p.id}">重新读取本机清单</button>`;}
}
async function photoHandle(action,el){
 const p=paper();if(!p||p.id!==el.dataset.paper)throw Error('当前整卷已切换，请在本卷重新选择');
 const sourceView=view;
 const requireCurrent=()=>{if(paperId!==p.id||view!==sourceView||paper()?.version!==p.version||dirty)throw Error('整卷来源或修改已变化，请在当前卷重新选择');};
 if(action==='photo-refresh'){await renderPhotoProgress(p);return;}
 if(dirty)throw Error('请先保存当前整卷修改，再打开照片或任务');
 const doc=p.documents.find(d=>d.id===el.dataset.document&&(d.role||'作业')==='作业'&&['image/png','image/jpeg'].includes(d.mime));
 if(!doc)throw Error('此照片不属于本卷作业，不能改用其他图片');
 if(action==='photo-open'){if($('#modal').open)close();await visionOpen('',doc.id);return;}
 if(action==='photo-job'){
  const job=await api('ai/jobs/'+el.dataset.job);
  requireCurrent();
  if(job.paper_id!==p.id||job.mode!=='vision_transcribe'||job.metadata.document_id!==doc.id)throw Error('任务与本卷这张照片不一致，请刷新清单');
  const settings=await api('ai/settings');requireCurrent();
  if($('#modal').open)close();aiSettings=settings;aiShowJob(job);
 }
}
