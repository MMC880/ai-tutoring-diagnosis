'use strict';
let visionEditor=null;
const visionImageURL=job=>job.payload.messages[1].content.find(p=>p.type==='image_url').image_url.url;
async function visionOpen(targetQuestionId='',documentId=''){
 if(dirty)throw Error('请先保存当前整卷草稿，再裁切图片');
 const p=paper(),sourceView=view;if(!p)throw Error('请先收一份学生作业');
 const docs=p.documents.filter(d=>d.mime.startsWith('image/')&&(d.role||'作业')==='作业');
 if(!docs.length)throw Error('本卷没有PNG/JPEG作业图片；参考答案不作为学生作答转写');
 if(targetQuestionId&&!p.questions.some(q=>q.id===targetQuestionId))throw Error('单题目标已不在当前卷，请先核对题号');
 const settings=await api('ai/settings');
 if(paperId!==p.id||view!==sourceView||paper()?.version!==p.version||dirty)throw Error('整卷来源或修改已变化，请在当前卷重新选择照片');
 aiSettings=settings;
 const previous=visionEditor;
 visionEditor={paperId:p.id,version:p.version,targetQuestionId,documentId:docs.some(d=>d.id===documentId)?documentId:previous?.paperId===p.id&&docs.some(d=>d.id===previous.documentId)?previous.documentId:docs[0].id,crop:null,masks:[],mode:'crop',image:null,start:null};
 if(previous?.paperId===p.id&&previous.documentId===visionEditor.documentId&&previous.version===p.version&&previous.targetQuestionId===targetQuestionId){visionEditor.crop=previous.crop;visionEditor.masks=previous.masks;}
 modal(`<h2>裁切与遮挡 · 只选择这次需要转写的区域</h2><div class="notice warn">请先去掉姓名、学校等身份信息，保留必要题目和学生笔迹。原图留本地；只有下一步预览的PNG会发送。遮挡需要老师检查，系统不会自动认出所有身份文字。</div><label class="field"><span>本卷作业图片（坐标按本机标准化图片计算）</span><select id="vision-document">${docs.map(d=>`<option value="${d.id}" ${d.id===visionEditor.documentId?'selected':''}>${esc(d.filename)}</option>`).join('')}</select></label><div class="row vision-tools"><button data-action="vision-crop-mode">① 框选题目区域</button><button data-action="vision-mask-mode">② 涂白身份区域</button><button data-action="vision-whole">选择整张图</button><button data-action="vision-undo-mask">撤销遮挡</button><button data-action="vision-reset">重新选择</button></div><p id="vision-selection" class="micro muted">请在图上拖动框选；默认不选择整张图。</p><div class="vision-canvas-wrap"><canvas id="vision-canvas" aria-label="拖动选择题目或遮挡区域"></canvas></div><div class="notice" style="margin-top:12px">原件不变。本机预览最长2400像素，发送区域最长1800像素，最终PNG会重新生成并去除元数据。请检查小字和数学符号仍清晰。</div><div class="actions">${aiSettings.vision_status!=='VERIFIED_THIS_SESSION'?'<button data-action="vision-probe">先验证图片能力（合成数字）</button>':''}<button data-action="close">取消</button><button class="primary" id="vision-prepare" data-action="vision-prepare" disabled>生成实际发送区域预览</button></div>`,true);
 $('#vision-document').closest('label').insertAdjacentHTML('afterend',`<label class="field vision-target-field"><span>这次处理哪道题</span><select id="vision-target"><option value="">自由区域（首次转写或多题）</option>${p.questions.map(q=>`<option value="${esc(q.id)}" ${q.id===targetQuestionId?'selected':''}>${esc(q.id)} · ${esc(q.stem.slice(0,45))}</option>`).join('')}</select><small class="muted">单题模式只更新所选题；请框入这一题的题干与学生步骤。</small></label>`);
 visionEditor.expectedQuestionIds=previous?.paperId===p.id&&previous.documentId===visionEditor.documentId&&previous.version===p.version&&previous.targetQuestionId===targetQuestionId?(previous.expectedQuestionIds||[]):[];
 $('#vision-target').closest('label').insertAdjacentHTML('afterend',`<label class="field vision-target-field"><span>本次图片应有题号（可选，以逗号分隔）</span><input id="vision-expected" value="${esc(visionEditor.expectedQuestionIds.join(', '))}" placeholder="例如：Q01, Q02, Q03, Q04" ${targetQuestionId?'disabled':''}><small>只填本次区域应包含的题号；漏识别项保存为待核对。未填写时不宣称题数齐全。</small></label>`);
 await visionLoadImage();
}
async function visionLoadImage(){
 const state=visionEditor, documentId=state.documentId, generation=(state.loadSequence||0)+1, image=new Image();
 state.loadSequence=generation;state.image=null;
 const waitingCanvas=$('#vision-canvas');if(waitingCanvas){waitingCanvas.width=0;waitingCanvas.height=0;}if($('#vision-prepare'))$('#vision-prepare').disabled=true;
 await new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=()=>reject(Error('本地图片预览无法读取'));image.src=`/api/papers/${state.paperId}/image/${documentId}`;});
 if(visionEditor!==state||state.documentId!==documentId||state.loadSequence!==generation||!$('#vision-canvas'))return;
 state.image=image;const c=$('#vision-canvas');c.width=image.naturalWidth;c.height=image.naturalHeight;visionDraw();
}
function visionDraw(temp){const state=visionEditor,c=$('#vision-canvas');if(!state?.image||!c)return;const ctx=c.getContext('2d');ctx.clearRect(0,0,c.width,c.height);ctx.drawImage(state.image,0,0);
 for(const r of state.masks){ctx.fillStyle='#fff';ctx.fillRect(r[0],r[1],r[2]-r[0],r[3]-r[1]);ctx.strokeStyle='#b64a56';ctx.lineWidth=Math.max(2,c.width/450);ctx.strokeRect(r[0],r[1],r[2]-r[0],r[3]-r[1]);}
 const r=temp||state.crop;if(r){ctx.strokeStyle=state.mode==='mask'&&temp?'#b64a56':'#14665f';ctx.lineWidth=Math.max(3,c.width/350);ctx.strokeRect(r[0],r[1],r[2]-r[0],r[3]-r[1]);}
 $('#vision-selection').textContent=`当前操作：${state.mode==='mask'?'涂白遮挡':'框选题目'}；${state.crop?'已选 '+(state.crop[2]-state.crop[0])+'×'+(state.crop[3]-state.crop[1])+' 像素':'尚未选区'}；遮挡 ${state.masks.length} 处。`;
 $('#vision-prepare').disabled=!state.crop||aiSettings.vision_status!=='VERIFIED_THIS_SESSION';
}
function visionPoint(ev){const c=$('#vision-canvas'),r=c.getBoundingClientRect();return [Math.max(0,Math.min(c.width,Math.round((ev.clientX-r.left)*c.width/r.width))),Math.max(0,Math.min(c.height,Math.round((ev.clientY-r.top)*c.height/r.height)))];}
function visionRect(a,b){return [Math.min(a[0],b[0]),Math.min(a[1],b[1]),Math.max(a[0],b[0]),Math.max(a[1],b[1])];}
document.addEventListener('pointerdown',ev=>{if(ev.target.id!=='vision-canvas'||!visionEditor?.image)return;ev.preventDefault();visionEditor.start=visionPoint(ev);ev.target.setPointerCapture(ev.pointerId);});
document.addEventListener('pointermove',ev=>{if(ev.target.id==='vision-canvas'&&visionEditor?.start)visionDraw(visionRect(visionEditor.start,visionPoint(ev)));});
document.addEventListener('pointerup',ev=>{if(ev.target.id!=='vision-canvas'||!visionEditor?.start)return;const r=visionRect(visionEditor.start,visionPoint(ev));visionEditor.start=null;if(r[2]-r[0]<2||r[3]-r[1]<2)return;if(visionEditor.mode==='mask'){if(visionEditor.masks.length>=20){toast('最多20个遮挡区域');return;}visionEditor.masks.push(r);}else visionEditor.crop=r;visionDraw();});
document.addEventListener('change',async ev=>{try{if(ev.target.id==='vision-target'){visionEditor.targetQuestionId=ev.target.value;visionEditor.crop=null;visionEditor.expectedQuestionIds=[];$('#vision-expected').value='';$('#vision-expected').disabled=!!ev.target.value;visionDraw();return;}if(ev.target.id==='vision-expected'){visionEditor.expectedQuestionIds=ev.target.value.split(/[,，\s、;；]+/).filter(Boolean);return;}if(ev.target.id!=='vision-document')return;visionEditor.documentId=ev.target.value;visionEditor.crop=null;visionEditor.masks=[];visionEditor.expectedQuestionIds=[];$('#vision-expected').value='';await visionLoadImage();}catch(e){toast(e.message);}});
function visionShowJob(job){
 const diagnostic=job.metadata.diagnostic;
 const manual=job.status==='MANUAL_DRAFT', savedManual=job.transcription_source_method==='MANUAL_FALLBACK';
 const image=visionImageURL(job);
 if(job.status==='PREPARED'){
  const probe=job.mode==='vision_probe';
  modal(`<h2>${probe?'合成数字图片能力验证':'核对实际发送的题目区域'}</h2><p class="path">目的地址：${esc(job.destination)}</p><p>模型：${esc(job.payload.model)} · 最多输出${job.payload.max_tokens} Token</p><div class="notice warn" style="margin-top:12px">${probe?'只发送这张本机生成的六位数字图，不包含学生资料；读对才开放本次会话的作业图片通道。':'下面就是服务器重新生成的PNG。请检查区域、遮挡和公式清晰度；原图、文件名和身份映射不发送。本步只转写，不判对错。'}可能产生服务用量。</div><img class="vision-outbound-image" src="${image}" alt="实际发送PNG预览"><p class="micro muted">${job.metadata.output_size?.join('×')||''}像素${job.metadata.outbound_sha256?' · SHA-256 '+esc(job.metadata.outbound_sha256.slice(0,20))+'…':''}</p><label><input id="ai-send-consent" type="checkbox"> 我已检查图片及目的地址，确认材料范围已获授权、图中没有身份信息，允许仅本次发送</label>${!aiSettings.key_loaded?'<p class="bad">当前没有本机会话密钥，请先到AI服务设置。</p>':''}<div class="actions"><button data-action="close">取消</button><button id="ai-send" class="primary" data-action="ai-send" data-job="${job.id}" disabled>授权发送这一次</button></div>`,true);visionContext(job);return;
 }
 if(job.mode==='vision_probe'){
  modal(`<h2>${esc(aiLabels[job.status]||job.status)}</h2>${job.status==='SUCCEEDED'?'<div class="notice">随机六位数字全部读对，本次模型与密钥会话可继续做作业图片验证。这不代表学生手写识别准确率达标。</div>':`<div class="notice warn">${esc(job.error||'图片验证未完成；不开放作业图片发送，不自动更换模型。')}</div>`}<p class="micro muted">服务报告用量：${job.usage?esc(JSON.stringify(job.usage)):'未知'}</p><div class="actions"><button data-action="close">关闭</button>${job.status==='SUCCEEDED'&&paper()?.documents.some(d=>d.mime.startsWith('image/'))?'<button class="primary" data-action="vision-open">继续裁切本卷图片</button>':''}</div>`);return;
 }
 const result=savedManual?{questions:job.teacher_transcription,page_notes:['以下为本机人工整理。原调用的失败或待核查状态没有改变。']}:job.result, rows=result?.questions||[];
 const editable=(job.status==='SUCCEEDED'||manual)&&rows.length>0;
 modal(`<h2>图片转写核对 · ${esc(aiLabels[job.status]||job.status)}</h2>${job.error?`<div class="notice warn">${esc(job.error)}</div>`:''}${result?.page_notes?.length?`<div class="notice warn">${esc(result.page_notes.join('；'))}</div>`:''}<div class="vision-review-grid"><section><img class="vision-outbound-image" src="${image}" alt="本次发送的题目区域"><p class="micro muted">只对照这次区域，不把标准答案补成学生作答。图片外未见的内容不能据此判错。</p></section><section>${rows.map(q=>`<article class="ocr-question question" data-q="${esc(q.id)}"><h3>${esc(q.id)} · 仅转写，未判题</h3><label class="field"><span>${manual||savedManual?'题号（人工整理）':'题号（可核对修正，原AI题号另留记录）'}</span><input data-ocr="id" value="${esc(q.id)}" ${editable?'':'readonly'}></label><label class="field"><span>原题（可人工纠正识别）</span><textarea class="formula" data-ocr="stem" ${editable?'':'readonly'}>${esc(q.stem)}</textarea></label><label class="field"><span>学生原作答（保留学生真实错误）</span><textarea class="formula" data-ocr="answer" ${editable?'':'readonly'}>${esc(q.answer)}</textarea></label><label class="field"><span>识别疑点／补拍提示（不是学生错因）</span><textarea data-ocr="recognition_notes" ${editable?'':'readonly'}>${esc(q.recognition_notes||'')}</textarea></label><label><input type="checkbox" data-ocr="recognition_resolved" ${q.recognition_resolved?'checked':''} ${editable?'':'disabled'}> 已对照原图核清这道题的识别疑点</label></article>`).join('')||'<p class="notice warn">没有可写入的转写内容，请补拍或人工录入。</p>'}</section></div>${editable?`<div class="notice">只更新本次转写题号，其余原题保留；同题号会替换当前转写；续录请先用行内合并预览保留已录步骤。未核清的题保持待核对，不送入文字批改。</div><label><input id="vision-transcription-consent" type="checkbox"> 我已逐题对照原图核对／修正，允许将此表放入本卷新待审版本；未解决疑点继续保留</label><div class="actions"><button data-action="close">稍后核对</button><button class="primary" id="vision-apply" data-action="${manual?'vision-manual-apply':'vision-apply'}" data-job="${job.id}" disabled>保存转写为待审草稿</button></div>`:`${job.teacher_transcription?(savedManual?'<div class="notice">本机人工整理表已独立保存；原AI失败或待核查状态保留，没有把人工内容记成AI成功。</div>':'<div class="notice">老师修正表已独立保存；上方保留AI当时的原转写，整卷草稿中可查看老师修正后的内容。</div>'):''}<div class="actions"><button data-action="close">关闭</button></div>`}`,true);
 if(manual){
  $('#modal h2').insertAdjacentHTML('afterend','<div class="notice warn">本机人工整理，不发送模型请求。请直接对照左侧图片填写，原失败或待核查记录保留，保存后仍需整卷审核。</div>');
  if(!job.metadata.target_question_id){for(const row of $$('.ocr-question'))row.insertAdjacentHTML('beforeend','<button data-action="vision-manual-remove">移除此空白题行</button>');
  $('#vision-transcription-consent').insertAdjacentHTML('beforebegin','<div class="row"><button data-action="vision-manual-add">＋ 人工增加一道题</button></div>');}
 }
 if(!manual&&!job.teacher_transcription&&['INVALID_RESULT','UNKNOWN','FAILED'].includes(job.status))$('#modal h2').insertAdjacentHTML('afterend',`<button data-action="vision-manual-open" data-job="${job.id}">在本机人工整理这张图（不调用AI）</button>`);
 if(diagnostic)$('#modal h2').insertAdjacentHTML('afterend',`<details class="notice warn"><summary>查看本机保存的格式诊断（未应用）</summary><p>${esc(diagnostic.kind)}：${esc(diagnostic.message)}</p><pre class="payload-preview">${esc(diagnostic.final_text)}</pre><p class="micro">仅供人工核对，未通过校验的原文不会自动归档。会话密钥已脱敏。</p></details>`);
 installContinuation(job,editable);
 visionContext(job);
}

function visionContext(job){
 const target=job.metadata.target_question_id, outcome=job.metadata.outcome;
 const owner=data.papers.find(p=>p.id===job.paper_id);
 if(owner)$('#modal h2').insertAdjacentHTML('afterend',`<p class="notice">归属：${esc(owner.student_name)} · ${esc(owner.title)} · 本次来源V${job.paper_version}</p>`);
 $('#modal h2').insertAdjacentHTML('afterend',`<p class="micro muted">接收方式：${job.payload.stream?'图片分段接收，完整结束后才核对':'完整JSON返回'}；不自动重试。</p>`);
 const expected=job.metadata.expected_question_ids||[], coverage=job.result?.coverage;
 if(expected.length)$('#modal h2').insertAdjacentHTML('afterend',`<p class="notice">本次应有题号：${esc(expected.join('、'))}（只留本地）</p>`);
 if(job.mode==='vision_transcribe'&&job.status!=='PREPARED'){
  let text='未提供应有题号清单，尚未核验题数完整性；请对照原图检查是否漏题。';
  if(coverage?.checked)text=`应有${coverage.expected.length}题，识别${coverage.recognized.length}题。${coverage.missing.length?'漏识别：'+coverage.missing.join('、')+'；保存后保留待核对。':'本次清单无缺号，仍需核对笔迹。'}${coverage.unexpected.length?' 清单外读号：'+coverage.unexpected.join('、')+'，请核对修正。':''}`;
  else if(expected.length)text='原调用未提供完整的题号核对结果；人工整理仍按本地清单检查，缺项保留待核对。';
  if(job.teacher_transcription&&expected.length){const ids=job.teacher_transcription.map(q=>q.id),missing=expected.filter(id=>!ids.includes(id));text+=' 核对表'+(missing.length?'仍缺：'+missing.join('、')+'，待审卷已保留缺口。':'已覆盖所列题号，仍须整卷审核。');}
  $('#modal h2').insertAdjacentHTML('afterend',`<div id="vision-coverage" class="notice warn">${esc(text)}</div>`);
 }
 if(target)$('#modal h2').insertAdjacentHTML('afterend',`<p class="notice"><strong>本次目标：${esc(target)}</strong> · 单题模式。请对照图片核对题号；保存只更新这一题。</p>`);
 if(outcome)$('#modal h2').insertAdjacentHTML('afterend',`<div class="notice ${job.status==='SUCCEEDED'||job.status==='APPLIED'?'':'warn'}"><strong>${esc(outcome.summary)}</strong><p>${esc(outcome.next_step)}</p><small>本次调用耗时 ${(outcome.elapsed_ms/1000).toFixed(1)} 秒；用量以返回记录或上游账单为准。</small></div>`);
 else if(['UNKNOWN','INVALID_RESULT','FAILED'].includes(job.status))$('#modal h2').insertAdjacentHTML('afterend','<div class="notice warn">此旧任务未保存简短原因摘要。请查看已有诊断及上游记录；不能仅凭状态判断是否超时。</div>');
 if(['UNKNOWN','INVALID_RESULT','FAILED'].includes(job.status)||job.result?.image_status==='UNREADABLE')$('#modal h2').insertAdjacentHTML('afterend',`<button data-action="vision-recover" data-job="${job.id}">改为分题框选（不自动发送）</button>`);
}
document.addEventListener('change',ev=>{if(ev.target.id==='vision-transcription-consent')$('#vision-apply').disabled=!ev.target.checked;});
function visionRecheck(ev){if(ev.target.matches('[data-ocr]')&&$('#vision-transcription-consent')){$('#vision-transcription-consent').checked=false;$('#vision-apply').disabled=true;}}
document.addEventListener('input',visionRecheck);document.addEventListener('change',visionRecheck);
async function visionHandle(action,el){
 if(action==='vision-question'){if($('#modal').open)close();await visionOpen(el.dataset.question);return;}
 if(action==='vision-recover'){
  if(dirty)throw Error('请先保存当前修改，再回到失败任务的原卷');
  const source=await api('ai/jobs/'+el.dataset.job);paperId=source.paper_id;view='review';close();await refresh();visionEditor=null;
  await visionOpen(source.metadata.target_question_id||'',source.metadata.document_id||'');return;
 }
 if(action==='vision-open'){if($('#modal').open)close();await visionOpen();return;}
 if(action==='vision-probe'){const job=await api('ai/prepare',{mode:'vision_probe'});if($('#modal').open)close();aiSettings=await api('ai/settings');visionShowJob(job);return;}
 if(['vision-crop-mode','vision-mask-mode','vision-whole','vision-undo-mask','vision-reset','vision-prepare'].includes(action)&&!visionEditor?.image)throw Error('本地图片尚未加载，请稍候再选区');
 if(action==='vision-crop-mode'||action==='vision-mask-mode'){visionEditor.mode=action==='vision-mask-mode'?'mask':'crop';visionDraw();return;}
 if(action==='vision-whole'){const c=$('#vision-canvas');visionEditor.crop=[0,0,c.width,c.height];visionDraw();return;}
 if(action==='vision-undo-mask'){visionEditor.masks.pop();visionDraw();return;}
 if(action==='vision-reset'){visionEditor.crop=null;visionEditor.masks=[];visionDraw();return;}
 if(action==='vision-prepare'){const s=visionEditor;if(!s.crop)throw Error('请先选取题目区域');s.expectedQuestionIds=$('#vision-expected').value.split(/[,，\s、;；]+/).filter(Boolean);const job=await api('ai/prepare',{mode:'vision_transcribe',paper_id:s.paperId,version:s.version,document_id:s.documentId,crop:s.crop,masks:s.masks,target_question_id:s.targetQuestionId,expected_question_ids:s.expectedQuestionIds});close();visionShowJob(job);return;}
 if(action==='vision-manual-open'){
  const original=await api('ai/jobs/'+el.dataset.job);close();
  const blank={id:original.metadata.target_question_id||original.metadata.expected_question_ids?.[0]||'Q01',stem:'',answer:'',recognition_notes:'',recognition_resolved:false,result:'PENDING'};
  visionShowJob({...original,status:'MANUAL_DRAFT',result:{image_status:'PARTIAL',questions:[blank],page_notes:[]}});return;
 }
 if(action==='vision-manual-add'){
  const rows=$$('.ocr-question'),last=rows.at(-1),clone=last.cloneNode(true);let i=rows.length+1;
  const ids=rows.map(r=>$('[data-ocr=id]',r).value);while(ids.includes('Q'+String(i).padStart(2,'0')))i++;
  resetContinuationRow(clone);
  const id='Q'+String(i).padStart(2,'0');clone.dataset.q=id;$('h3',clone).textContent=id+' · 人工转写，未判题';
  for(const field of $$('[data-ocr]',clone)){if(field.type==='checkbox')field.checked=false;else field.value=field.dataset.ocr==='id'?id:'';}
  last.parentElement.append(clone);visionRecheck({target:$('[data-ocr=stem]',clone)});$('[data-ocr=stem]',clone).focus();return;
 }
 if(action==='vision-manual-remove'){
  if($$('.ocr-question').length<=1){toast('至少保留一行，或取消本次整理');return;}
  el.closest('.ocr-question').remove();$('#vision-transcription-consent').checked=false;$('#vision-apply').disabled=true;return;
 }
 if(action==='vision-manual-apply'){
  requireNoContinuationPreview();
  const questions=$$('.ocr-question').map(row=>{const q={};for(const field of $$('[data-ocr]',row))q[field.dataset.ocr]=field.type==='checkbox'?field.checked:field.value;return q;});
  const job=await api('ai/jobs/'+el.dataset.job+'/manual-transcription',{questions,consent:true,transcription_ack:$('#vision-transcription-consent').checked});
  paperId=job.paper_id;view='review';close();await refresh('本机人工转写已保存为待审；原AI失败/待核查状态保留，没有新增模型调用。');return;
 }
 if(action==='vision-apply'){requireNoContinuationPreview();const questions=$$('.ocr-question').map(e=>{const q={id:e.dataset.q,source_id:e.dataset.q,result:'PENDING'};$$('[data-ocr]',e).forEach(f=>q[f.dataset.ocr]=f.type==='checkbox'?f.checked:f.value);return q;});const job=await api('ai/jobs/'+el.dataset.job+'/apply',{consent:true,transcription_ack:$('#vision-transcription-consent').checked,questions});paperId=job.paper_id;view='review';close();await refresh('转写与老师修正已保存到新待审版本；尚未批改、归档或发布。');return;}
}
