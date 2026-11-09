'use strict';
const teachingState={selected:'',editor:null,list:[],epoch:0,editEpoch:0};
function teachingEntryHTML(e={}){
 return `<article class="teaching-entry" data-entry="${esc(e.id||'')}"><div class="two"><label class="field"><span>知识点名称</span><input data-entry-field="knowledge" maxlength="200" value="${esc(e.knowledge||'')}" placeholder="如：分式取值限制"></label><label class="field"><span>出处页码或章节（老师核对）</span><input data-entry-field="locator" maxlength="300" value="${esc(e.locator||'')}" placeholder="如：第3页例2／第二节第1段"></label></div><label class="field"><span>知识内容／讲解摘要</span><textarea data-entry-field="content" maxlength="4000">${esc(e.content||'')}</textarea></label><label class="field"><span>题型（可选）</span><input data-entry-field="question_type" maxlength="200" value="${esc(e.question_type||'')}"></label><button data-action="teaching-remove-entry">移除此草稿条目</button></article>`;
}
async function teachingPage(){
 const epoch=++teachingState.epoch,editEpoch=teachingState.editEpoch,fields=$('#teaching-editor-fields');
 if(fields)fields.disabled=true;
 try{
 const list=await api('teaching/materials');
 if(epoch!==teachingState.epoch||view!=='teaching')return '';
 const selected=list.some(m=>m.id===teachingState.selected)?teachingState.selected:list[0]?.id||'';
 const editor=selected?await api('teaching/materials/'+selected):null;
 if(epoch!==teachingState.epoch||view!=='teaching')return '';
 if(editEpoch!==teachingState.editEpoch)throw Error('资料加载期间有新编辑，已保留原资料修改，请先保存后再切换。');
 Object.assign(teachingState,{list,selected,editor});
 return `<div class="notice">这里保存老师的教学参考资料，与学生错题档案分开。资料先待审，核对正文、公式、适用范围和出处后才能关联；不会自动外发给模型。</div><div class="teaching-grid"><section class="panel"><div class="panel-head"><h2>本地数学教学资料</h2><button data-action="teaching-import">导入资料</button></div><label class="field"><span>选择资料</span><select id="teaching-source-select"><option value="">暂无资料</option>${list.map(m=>`<option value="${m.id}" ${m.id===selected?'selected':''}>${esc(m.title)} · V${m.version} · ${m.status==='APPROVED'?'已审核':'待审核'}</option>`).join('')}</select></label>${list.map(m=>`<div class="teaching-source"><strong>${esc(m.title)}</strong><p>${esc(m.kind)} · ${esc(m.scope||'适用范围待补')}<br><small>${m.entry_count}个知识条目 · V${m.version} · ${m.status==='APPROVED'?'已审核':'待审核'}</small></p></div>`).join('')||'<p class="muted">尚未导入教案、复习资料或考试范围。不会自动填入未经确认的官方目录。</p>'}</section><section class="panel">${editor?teachingEditorHTML(editor):'<div class="empty"><h2>从老师的一份资料开始</h2><p>支持本地PDF、DOCX或照片。文字提取只作辅助，出处与数学公式由老师核对。</p></div>'}</section></div>`;
 }catch(error){
  if(epoch===teachingState.epoch&&view==='teaching'){
   teachingState.selected=teachingState.editor?.id||'';
   const select=$('#teaching-source-select');if(select)select.value=teachingState.selected;
  }
  throw error;
 }finally{if(epoch===teachingState.epoch&&fields?.isConnected)fields.disabled=false;}
}
function teachingEditorHTML(m){
 return `<section id="teaching-editor" data-material="${m.id}" data-version="${m.version}"><fieldset id="teaching-editor-fields"><div class="panel-head"><h2>资料核对 · V${m.version}</h2><span class="tag">${m.status==='APPROVED'?'已审核':'待审核'}</span></div><div class="two"><label class="field"><span>资料名称</span><input id="teaching-title" data-teaching-field maxlength="160" value="${esc(m.title)}"></label><label class="field"><span>资料类型</span><select id="teaching-kind" data-teaching-field>${options({'教案':'教案','复习资料':'复习资料','考试范围':'考试范围'},m.kind)}</select></label></div><label class="field"><span>适用范围（年级／章节／考试范围）</span><input id="teaching-scope" data-teaching-field maxlength="300" value="${esc(m.scope)}"></label><label class="field"><span>资料版本说明（可选，不猜教材版本）</span><input id="teaching-edition" data-teaching-field maxlength="160" value="${esc(m.edition)}"></label><p><a href="/api/files/${m.document.id}" target="_blank" rel="noopener">打开原件：${esc(m.document.filename)}</a></p><details class="teaching-original" open><summary>本地提取文字（辅助核对）</summary><p class="micro muted">${esc(m.document.warnings.join(' '))} 页码或章节需对照原件填写；扫描图片没有自动转写。</p><pre>${esc(m.document.extracted_text||'没有可提取文字，请打开原件人工核对后整理知识条目。')}</pre></details><h3>知识目录与出处</h3><div id="teaching-entries">${m.entries.map(teachingEntryHTML).join('')}</div><button data-action="teaching-add-entry">＋ 加入一个知识条目</button><div class="notice warn">修改已审核资料会生成新待审版本。学生历史引用继续保留原已审核版本，不跟随新草稿改写。</div><label><input type="checkbox" id="teaching-consent" ${m.status==='APPROVED'?'disabled':''}> 我已对照原件核对本版正文、公式、适用范围和条目出处</label><div class="actions"><button data-action="teaching-save">保存资料草稿</button><button class="primary" data-action="teaching-approve" disabled>审核当前版本</button></div></fieldset></section>`;
}
function teachingCollect(){
 return {title:$('#teaching-title').value,kind:$('#teaching-kind').value,scope:$('#teaching-scope').value,edition:$('#teaching-edition').value,
  entries:$$('.teaching-entry').map(el=>{const row={id:el.dataset.entry};$$('[data-entry-field]',el).forEach(input=>row[input.dataset.entryField]=input.value);return row;})};
}
function teachingChanged(){teachingState.editEpoch++;changed();if($('#teaching-consent'))$('#teaching-consent').checked=false;const b=$('[data-action=teaching-approve]');if(b)b.disabled=true;}
function teachingQuestionHTML(q){
 return `<section class="teaching-question"><input type="hidden" data-field="teaching_ref" value="${esc(JSON.stringify(q.teaching_ref||null))}"><h3>教学资料依据（可选）</h3><p class="teaching-linked micro">${q.teaching_ref?'正在读取已选资料版本…':'尚未关联老师已审核的教学资料。'}</p><div class="row"><button data-action="teaching-link">关联知识与出处</button><button data-action="teaching-show" ${q.teaching_ref?'':'disabled'}>查看已选依据</button><button data-action="teaching-unlink" ${q.teaching_ref?'':'disabled'}>解除本次引用</button></div></section>`;
}
function teachingReferenceHTML(entry){
 return `<article class="teaching-reference"><h3>${esc(entry.knowledge)}</h3><p>${esc(entry.source_title)} · V${entry.source_version} · ${entry.is_current?'当前已审核版本':'历史已审核版本'}</p><p>适用范围：${esc(entry.scope)}<br>出处：${esc(entry.locator)}<br>资料版本说明：${esc(entry.edition||'未补充')}</p><pre>${esc(entry.content)}</pre><a href="/api/files/${esc(entry.document_id)}" target="_blank" rel="noopener">打开原件：${esc(entry.document_filename)}</a><p class="micro muted">引用固定在这一资料版本；原件页码与公式仍以老师核对为准。</p></article>`;
}
async function teachingRenderLinks(p){
 const epoch=renderEpoch;
 try{
  const result=await api('papers/'+p.id+'/teaching-links');
  if(epoch!==renderEpoch||view!=='review'||paperId!==p.id||paper()?.version!==p.version||dirty)return;
  if(result.version!==p.version)return;
  for(const q of p.questions){const row=$$('#questions .question').find(el=>el.dataset.q===q.id);if(!row)continue;const entry=result.links[q.id];$('.teaching-linked',row).textContent=entry?`${entry.knowledge} · ${entry.source_title} / V${entry.source_version} · ${entry.locator}${entry.is_current?'':' · 历史已审核版本（当前有后续版本）'}`:'尚未关联老师已审核的教学资料。';}
 }catch(e){if(epoch===renderEpoch&&view==='review')$$('.teaching-linked').forEach(el=>el.textContent='资料引用读取失败，请保存后刷新核对：'+e.message);}
}
let teachingPicker=null;
async function teachingHandle(action,button){
 if(action==='teaching-import'){
  if(!canLeave())return;
  modal(`<h2>导入本地数学教学资料</h2><p>仅导入你选择的原件，不扫描其他文件夹，不调用AI；先作为待审核资料。</p><label class="field"><span>PDF／DOCX／照片（15MB以内）</span><input type="file" id="teaching-import-file" accept=".pdf,.docx,.png,.jpg,.jpeg,.webp"></label><label class="field"><span>资料名称（空白时用文件名）</span><input id="teaching-import-title" maxlength="160"></label><label class="field"><span>适用范围（可在审核前补充）</span><input id="teaching-import-scope" maxlength="300"></label><label class="field"><span>资料类型</span><select id="teaching-import-kind">${options({'教案':'教案','复习资料':'复习资料','考试范围':'考试范围'},'教案')}</select></label><div class="actions"><button data-action="close">取消</button><button data-action="teaching-import-save" class="primary">保存为待审核资料</button></div>`);return;
 }
 if(action==='teaching-import-save'){
  const file=$('#teaching-import-file').files[0];if(!file)throw Error('请选择一份本地教学资料');
  const metadata={title:$('#teaching-import-title').value.trim()||file.name,scope:$('#teaching-import-scope').value,kind:$('#teaching-import-kind').value};
  const sourceView=view,epoch=renderEpoch;
  const doc=await upload(file,'参考答案');
  if(epoch!==renderEpoch||view!==sourceView)throw Error('页面已切换，文件仅本地保存；请在教学资料页重新导入');
  const saved=await api('teaching/materials',{document_id:doc.id,...metadata});
  if(epoch!==renderEpoch||view!==sourceView)return;
  teachingState.selected=saved.id;close();view='teaching';await refresh('资料已在本地保存，仍待老师核对；相同文件会打开已有资料。');return;
 }
 if(action==='teaching-add-entry'){
  if($$('.teaching-entry').length>=100)throw Error('每份资料最多100个条目');
  $('#teaching-entries').insertAdjacentHTML('beforeend',teachingEntryHTML());teachingChanged();return;
 }
 if(action==='teaching-remove-entry'){button.closest('.teaching-entry').remove();teachingChanged();return;}
 if(action==='teaching-save'||action==='teaching-approve'){
  const source=teachingState.editor,epoch=renderEpoch,editEpoch=teachingState.editEpoch,submittedRows=$$('.teaching-entry');
  if(!source||view!=='teaching')throw Error('请先选择教学资料');
  if(action==='teaching-approve'&&dirty)throw Error('请先保存资料修改，再核对审核');
  const payload=action==='teaching-save'?{version:source.version,...teachingCollect()}:{version:source.version,consent:$('#teaching-consent').checked};
  const saved=await api('teaching/materials/'+source.id+(action==='teaching-approve'?'/approve':''),payload);
  if(epoch!==renderEpoch||view!=='teaching'||teachingState.selected!==source.id)return;
  teachingState.editor=saved;
  submittedRows.forEach((row,index)=>{if(row.isConnected&&!row.dataset.entry&&saved.entries[index])row.dataset.entry=saved.entries[index].id;});
  $('#teaching-editor').dataset.version=String(saved.version);
  if(editEpoch!==teachingState.editEpoch){
   // The reply represents the submitted draft, not keystrokes entered afterwards.
   $('#teaching-editor .panel-head h2').textContent=`资料核对 · V${saved.version}（有未保存修改）`;
   $('#teaching-editor .panel-head .tag').textContent=saved.status==='APPROVED'?'服务器本版已审核；新编辑待保存':'新编辑待保存';
   $('#teaching-consent').checked=false;$('[data-action=teaching-approve]').disabled=true;
   toast('提交时的版本已保存；随后输入的内容保留在页面，请继续保存后再审核。');return;
  }
  // Teaching edits do not change bootstrap data. Render immediately so the old
  // editor is locked before the next await, including after the POST reply.
  await render();toast(saved.status==='APPROVED'?'本版资料已审核，可用于关联。':'资料草稿已保存，请核对后审核。');return;
 }
 if(action==='teaching-bind')return teachingCatalogBind();
 if(action.startsWith('teaching-catalog-'))return teachingCatalogHandle(action);
 const row=button.closest('#questions .question');if(!row)throw Error('请从当前原卷选择题目');
 const p=paper(),epoch=renderEpoch,questionId=row.dataset.q;
 const current=()=>epoch===renderEpoch&&view==='review'&&paperId===p.id&&paper()?.version===p.version&&row.isConnected;
 if(action==='teaching-unlink'){
  $('[data-field=teaching_ref]',row).value='null';$('.teaching-linked',row).textContent='本行已解除引用，仍需保存。';
  $('[data-action=teaching-show]',row).disabled=true;$('[data-action=teaching-unlink]',row).disabled=true;gradingInput($('[data-field=teaching_ref]',row));changed();return;
 }
 if(action==='teaching-link'){
  if(dirty)throw Error('请先保存原卷修改，再选择教学引用');
  const edits=reviewFlowEdits;
  const entries=await api('teaching/catalog');if(!current()||dirty||edits!==reviewFlowEdits)return;
  teachingCatalogOpen(entries,{paperId:p.id,version:p.version,questionId,epoch});return;
 }
 if(action==='teaching-show'){
  const refText=$('[data-field=teaching_ref]',row).value,ref=JSON.parse(refText);if(!ref)throw Error('本题尚未关联资料');
  const source=await api('teaching/materials/'+ref.material_id+'/versions/'+ref.version);
  if(!current()||$('[data-field=teaching_ref]',row).value!==refText)throw Error('题目或引用已变化，请重新查看');
  const entry=source.entries.find(e=>e.id===ref.entry_id);if(!entry||source.status!=='APPROVED')throw Error('此条目不属于已审核的资料版本');
  const info={...entry,reference:ref,source_title:source.title,source_version:source.version,current_version:source.current_version,is_current:source.version===source.current_version,scope:source.scope,edition:source.edition,document_id:source.document_id,document_filename:source.document_filename};
  modal(`<h2>本题教学依据（只读）</h2>${teachingReferenceHTML(info)}<button data-action="close">关闭</button>`);
 }
}
document.addEventListener('input',event=>{if(event.target.closest('#teaching-editor')&&event.target.id!=='teaching-consent')teachingChanged();});
document.addEventListener('change',async event=>{
 const input=event.target;
 try{
  if(input.id==='teaching-source-select'){
   if(!canLeave()){input.value=teachingState.selected;return;}
   teachingState.selected=input.value;await render();return;
  }
  if(input.id==='teaching-consent'){$('[data-action=teaching-approve]').disabled=!input.checked||dirty;return;}
  if(input.closest('#teaching-editor'))teachingChanged();
 }catch(error){toast(error.message);}
});
