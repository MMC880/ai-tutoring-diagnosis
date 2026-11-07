'use strict';
function composeContinuation(previous,incoming){
 const text=v=>{if(v===undefined)return '';if(typeof v!=='string')throw Error('续录内容须为文字');return v.trim();};
 const oldStem=text(previous.stem),oldAnswer=text(previous.answer),newStem=text(incoming.stem),newAnswer=text(incoming.answer);
 if((!oldStem&&!oldAnswer)||(oldStem==='待录入原题'&&!oldAnswer))throw Error('本卷这道题还没有可合并的已录内容，请直接核对本次转写');
 if(!newStem&&!newAnswer)throw Error('请先填写本次题干或学生作答');
 const join=(a,b,label)=>!a?b:!b||a===b?a:a+'\n\n'+label+'\n'+b;
 const notes=[];
 for(const q of [previous,incoming])for(const key of ['recognition_notes','recognition_notice']){
  const value=text(q[key]);if(value&&!notes.includes(value))notes.push(value);
 }
 const resolved=q=>q.recognition_resolved===undefined?!text(q.recognition_notes)&&!text(q.recognition_notice):q.recognition_resolved===true;
 return {stem:join(oldStem,newStem,'【本次补充题干】'),answer:join(oldAnswer,newAnswer,'【本次续录】'),recognition_notes:notes.join('；'),recognition_resolved:resolved(previous)&&resolved(incoming)};
}
function validateContinuation(value){
 const out={};for(const [key,limit] of [['stem',12000],['answer',12000],['recognition_notes',1500]]){
  if(typeof value[key]!=='string'||value[key].length>limit||(key==='stem'&&!value[key].trim()))throw Error('合并后的'+({stem:'题干',answer:'作答',recognition_notes:'识别备注'}[key])+'为空或超过'+limit+'字，请编辑核对，不会截断');
  out[key]=value[key].trim();
 }
 if(typeof value.recognition_resolved!=='boolean')throw Error('请明确是否已经核清两段识别疑点');
 return {...out,recognition_resolved:value.recognition_resolved};
}
let continuationSource=null;
const continuationPreviews=new WeakMap(),continuationFilled=new WeakSet();
function continuationRowValue(row){
 const out={};for(const key of ['id','stem','answer','recognition_notes','recognition_resolved']){
  const field=$('[data-ocr="'+key+'"]',row);if(!field)throw Error('本行不是可编辑转写表');
  out[key]=field.type==='checkbox'?field.checked:field.value;
 }return out;
}
function continuationContext(row){
 const source=continuationSource,p=paper();
 if(!source||!row?.isConnected||!$('#modal').open||!$('#modal').contains(row))throw Error('此转写窗口已变化，请重新打开当前任务');
 if(!p||p.id!==source.paperId||p.version!==source.version||view!==source.view||dirty)throw Error('整卷来源或修改已变化，请在当前卷重新核对续录');
 return source;
}
function resetContinuationRow(row){
 $('.continuation-preview',row)?.remove();continuationPreviews.delete(row);continuationFilled.delete(row);
 const button=$('[data-action=continuation-open]',row);if(button){button.disabled=false;button.textContent='与本卷已录同题合并';}
}
function installContinuation(job,editable){
 continuationSource=null;if(!editable)return;
 const owner=data.papers.find(p=>p.id===job.paper_id);
 continuationSource={paperId:job.paper_id,version:job.paper_version,view,questions:owner?structuredClone(owner.questions):[]};
 for(const row of $$('.ocr-question')){
  if(!$('[data-action=continuation-open]',row))row.insertAdjacentHTML('beforeend','<button data-action="continuation-open">与本卷已录同题合并</button>');
 }
}
function continuationResetConsent(){if($('#vision-transcription-consent')){$('#vision-transcription-consent').checked=false;$('#vision-apply').disabled=true;}}
function requireNoContinuationPreview(){if($('.continuation-preview'))throw Error('请先填入或取消续录预览，再保存转写');}
async function continuationHandle(action,el){
 const row=el.closest('.ocr-question');const source=continuationContext(row);
 if(action==='continuation-cancel'){$('.continuation-preview',row)?.remove();continuationPreviews.delete(row);return;}
 if(action==='continuation-open'){
  if(continuationFilled.has(row))throw Error('本行已填入合并文本，请直接修订文字，不重复追加');
  if($('.continuation-preview',row))throw Error('请先填入或取消当前续录预览');
  const incoming=continuationRowValue(row),qid=incoming.id.trim();
  const previous=source.questions.find(q=>q.id===qid);if(!previous)throw Error('本卷没有这个题号的已录内容，请先核对题号，不会改用其他题');
  const merged=composeContinuation(previous,incoming);
  continuationPreviews.set(row,{source,incoming:JSON.stringify(incoming),qid});
  row.insertAdjacentHTML('beforeend',`<section class="continuation-preview"><h3>同题续录预览 · ${esc(qid)}</h3><div class="notice warn">请对照原件确认两段属于本卷同一道题。只整理文字，不判断解法正确；原转写和本卷已录内容在保存前均不改写。</div><details open><summary>本卷已录内容</summary><pre>${esc(previous.stem)}\n${esc(previous.answer)}\n识别备注：${esc(previous.recognition_notes||'')}\n${esc(previous.recognition_notice||'')}</pre></details><details><summary>本次转写原文</summary><pre>${esc(incoming.stem)}\n${esc(incoming.answer)}\n${esc(incoming.recognition_notes)}</pre></details>${[['stem','最终题干（请检查是否有重复或新增条件）'],['answer','最终学生作答（保留各段实际笔迹）'],['recognition_notes','合并识别备注（不是学生错因）']].map(([key,label])=>`<label class="field"><span>${label}</span><textarea data-merge-field="${key}">${esc(merged[key])}</textarea></label>`).join('')}<label><input type="checkbox" data-merge-field="recognition_resolved" ${merged.recognition_resolved?'checked':''}> 已对照原件核清两段识别疑点</label><p class="micro">有未核清内容可不勾选，继续保留待核对；超长不会自动截断。</p><label><input type="checkbox" data-merge-consent> 两段确属本卷同题，我已核对本次预览，允许仅填入转写核对表</label><div class="actions"><button data-action="continuation-cancel">取消合并预览</button><button data-action="continuation-fill" class="primary" disabled>仅填入本行核对表</button></div></section>`);
  continuationResetConsent();$('.continuation-preview',row).scrollIntoView({block:'start'});return;
 }
 if(action==='continuation-fill'){
  const preview=$('.continuation-preview',row),state=continuationPreviews.get(row);
  if(!preview||!state||state.source!==source||continuationFilled.has(row))throw Error('续录预览已失效，请重新核对');
  if(JSON.stringify(continuationRowValue(row))!==state.incoming)throw Error('原转写或题号已修改，请取消并重新生成续录预览');
  if(!$('[data-merge-consent]',preview).checked)throw Error('请先核对两段同题并勾选本次预览');
  const value={};for(const field of $$('[data-merge-field]',preview))value[field.dataset.mergeField]=field.type==='checkbox'?field.checked:field.value;
  const merged=validateContinuation(value);
  for(const [key,text] of Object.entries(merged)){const field=$('[data-ocr="'+key+'"]',row);if(field.type==='checkbox')field.checked=text;else field.value=text;}
  preview.remove();continuationPreviews.delete(row);continuationFilled.add(row);
  const button=$('[data-action=continuation-open]',row);button.disabled=true;button.textContent='本行已合并，可直接修订文字';
  continuationResetConsent();toast('只填入了本行核对表；请对照原件复核，再另行保存转写为待审版本。');
 }
}
function continuationChanged(ev){
 const row=ev.target.closest('.ocr-question');
 const preview=ev.target.closest('.continuation-preview')||(ev.target.matches('[data-ocr]')&&row&&$('.continuation-preview',row));if(!preview)return;
 const consent=$('[data-merge-consent]',preview),button=$('[data-action=continuation-fill]',preview);
 if(ev.target.matches('[data-merge-field],[data-ocr]'))consent.checked=false;
 button.disabled=!consent.checked;
}
document.addEventListener('input',continuationChanged);document.addEventListener('change',continuationChanged);
