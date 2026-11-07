'use strict';
function catalogText(value){return String(value??'').normalize('NFKC').toLowerCase();}
function filterTeachingCatalog(entries,query='',materialId='',page=1){
 const terms=catalogText(query).trim().split(/\s+/).filter(Boolean);
 const matches=entries.map((entry,index)=>({entry,index})).filter(({entry})=>{
  if(materialId&&entry.reference.material_id!==materialId)return false;
  const text=catalogText(['knowledge','question_type','content','source_title','scope','edition','locator'].map(k=>entry[k]||'').join(' '));
  return terms.every(term=>text.includes(term));
 });
 const pages=Math.max(1,Math.ceil(matches.length/20));
 page=Math.min(pages,Math.max(1,Number.isInteger(page)?page:1));
 return {total:matches.length,pages,page,rows:matches.slice((page-1)*20,page*20)};
}
function teachingCatalogCurrent(s){
 return teachingPicker===s&&view==='review'&&renderEpoch===s.epoch&&paperId===s.paperId&&paper()?.version===s.version&&!dirty&&reviewFlowEdits===s.edits&&$('#modal').open&&$('#teaching-catalog')===s.root;
}
function teachingCatalogOpen(entries,context){
 const sources=new Map(entries.map(e=>[e.reference.material_id,e.source_title]));
 modal(`<section id="teaching-catalog"><h2>${esc(context.questionId)} · 查找已审核教学知识</h2><p>先查找并核对出处与正文，再关联到本题待审草稿；不保存或确认学生成绩。</p><label class="field"><span>关键词（知识点、题型、正文或出处；多词用空格隔开）</span><input id="teaching-catalog-query" maxlength="200" placeholder="如：分式 取值限制"></label><label class="field"><span>按原资料筛选（同名资料分别保留）</span><select id="teaching-catalog-material"><option value="">全部已审核资料</option>${[...sources].map(([id,title])=>`<option value="${esc(id)}">${esc(title)} · ${esc(id.slice(0,8))}</option>`).join('')}</select></label><p id="teaching-catalog-count" role="status"></p><label class="field"><span>选择知识条目及固定资料版本</span><select id="teaching-catalog-select"></select></label><div class="row"><button data-action="teaching-catalog-prev">上一页</button><button data-action="teaching-catalog-next">下一页</button></div><div id="teaching-catalog-preview"></div><div class="actions"><button data-action="close">取消</button><button data-action="teaching-bind" class="primary" disabled>关联到本题待审草稿</button></div></section>`);
 $('#modal').classList.add('teaching-catalog-modal');
 teachingPicker={...context,entries,query:'',materialId:'',page:1,choiceEpoch:0,binding:false,edits:reviewFlowEdits,root:$('#teaching-catalog')};
 teachingCatalogRender(teachingPicker);
}
function teachingCatalogRender(s){
 if(!teachingCatalogCurrent(s))return;
 const result=filterTeachingCatalog(s.entries,s.query,s.materialId,s.page);s.page=result.page;s.visible=result.rows.map(r=>r.index);s.selected=null;s.choiceEpoch++;
 $('#teaching-catalog-count').textContent=`匹配${result.total}项 / 已审核目录共${s.entries.length}项 · 第${s.page}/${result.pages}页，每页最多20项。${result.total?'':'没有匹配条目，请换关键词或资料。'}`;
 $('#teaching-catalog-select').innerHTML='<option value="">请选择</option>'+result.rows.map(({entry,index})=>`<option value="${index}">${esc(entry.knowledge)} · ${esc(entry.source_title)} / V${entry.source_version} · ${esc(entry.locator)}${entry.is_current?'':'（历史已审核）'}</option>`).join('');
 $('[data-action=teaching-catalog-prev]').disabled=s.page<=1;
 $('[data-action=teaching-catalog-next]').disabled=s.page>=result.pages;
 $('#teaching-catalog-preview').innerHTML='<p class="muted">尚未选择知识条目。新资料请先在教学资料库审核；关键词查找不判断学生薄弱点。</p>';
 $('[data-action=teaching-bind]').disabled=true;
}
function teachingCatalogChanged(element){
 const s=teachingPicker;if(!s||!teachingCatalogCurrent(s))return;
 if(element.id==='teaching-catalog-query'){s.query=element.value;s.page=1;teachingCatalogRender(s);}
 if(element.id==='teaching-catalog-material'){s.materialId=element.value;s.page=1;teachingCatalogRender(s);}
 if(element.id==='teaching-catalog-select'){
  const value=element.value,index=/^[0-9]+$/.test(value)?Number(value):null;
  s.selected=s.visible.includes(index)?index:null;s.choiceEpoch++;
  const entry=s.selected===null?null:s.entries[s.selected];
  $('#teaching-catalog-preview').innerHTML=entry?`<p>题型：${esc(entry.question_type||'未填写')}</p>`+teachingReferenceHTML(entry):'<p>尚未选择知识条目。</p>';
  $('[data-action=teaching-bind]').disabled=s.selected===null||s.binding;
 }
}
function teachingCatalogHandle(action){
 const s=teachingPicker;if(!s||!teachingCatalogCurrent(s))throw Error('原卷或窗口已变化，请重新选择');
 if(action==='teaching-catalog-prev')s.page--;
 if(action==='teaching-catalog-next')s.page++;
 teachingCatalogRender(s);
}
async function teachingCatalogBind(){
 const s=teachingPicker;
 if(!s||!teachingCatalogCurrent(s)||s.binding||s.selected===null||!s.visible.includes(s.selected))throw Error('原卷或选择已变化，请重新选择引用');
 const choice=s.choiceEpoch,entry=s.entries[s.selected],ref=entry.reference;
 s.binding=true;$('[data-action=teaching-bind]').disabled=true;
 try{
  const source=await api('teaching/materials/'+ref.material_id+'/versions/'+ref.version);
  if(!teachingCatalogCurrent(s)||s.choiceEpoch!==choice)return;
  const actual=source.entries.find(e=>e.id===ref.entry_id);
  if(source.id!==ref.material_id||source.version!==ref.version||source.status!=='APPROVED'||!actual||source.document_sha256!==entry.document_sha256||source.title!==entry.source_title||source.scope!==entry.scope||source.edition!==entry.edition||['knowledge','question_type','content','locator'].some(k=>actual[k]!==entry[k]))throw Error('已选教学依据已变化或无法核实，请取消并重新查找');
  const row=$$('#questions .question').find(el=>el.dataset.q===s.questionId);if(!row)throw Error('目标题号已变化');
  $('[data-field=teaching_ref]',row).value=JSON.stringify(ref);$('[data-field=knowledge]',row).value=entry.knowledge;
  $('.teaching-linked',row).textContent=`${entry.knowledge} · ${entry.source_title} / V${entry.source_version} · ${entry.locator}（本行待保存）`;
  $('[data-action=teaching-show]',row).disabled=false;$('[data-action=teaching-unlink]',row).disabled=false;
  gradingInput($('[data-field=knowledge]',row));changed();close();teachingPicker=null;toast('已关联本题待审草稿；请保存后完成整卷核对。');
 }finally{if(teachingCatalogCurrent(s)){s.binding=false;$('[data-action=teaching-bind]').disabled=s.selected===null;}}
}
document.addEventListener('input',event=>{if(event.target.id==='teaching-catalog-query')teachingCatalogChanged(event.target);});
document.addEventListener('change',event=>{if(['teaching-catalog-material','teaching-catalog-select'].includes(event.target.id))teachingCatalogChanged(event.target);});
