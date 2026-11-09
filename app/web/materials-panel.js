'use strict';
let materialsEditor=null,materialsReloadNeeded=false;
function materialsOpen(){
 const p=paper();if(!p)throw Error('请先打开学生整卷');
 if(dirty)throw Error('请先保存题目草稿，再整理附件，避免混入未保存的修改');
 materialsEditor={paperId:p.id,studentId:p.student_id,batch:p.batch_id,version:p.version,epoch:renderEpoch,revision:0,
  rows:p.documents.map(d=>({document:d,role:d.role||'作业',existing:true})),saving:false};
 modal(`<h2>补交与整理附件</h2><p id="materials-context">${esc(p.student_ref)} · ${esc(p.student_name)}<br>${esc(p.batch_id)} / ${esc(p.title)} / 来源V${p.version}</p><p class="notice">确认材料属于这名学生，再调整原件显示顺序。新增或排序后整卷重新待审，旧确认和缺材料状态保留；附件数量不等于页码或收齐。</p><fieldset id="materials-editor"><div id="materials-rows"></div><label class="field"><span>选择补交材料（每个15MB以内，总附件最多20个）</span><input id="materials-files" type="file" multiple accept=".png,.jpg,.jpeg,.webp,.pdf,.docx"></label><button data-action="materials-add">加入待保存清单</button><p class="micro muted">已有原件在此不可删除或改用途；新增文件可选择作业或参考答案。上传只保存到本机，不调用AI。点击保存后再关闭窗口，不能撤销已经提交的材料更新。</p><label><input id="materials-consent" type="checkbox"> 我已核对学生、批次和附件顺序，确认材料属于本卷并保存为待审</label><p class="bad" id="materials-error" role="status"></p><button class="primary" data-action="materials-save" id="materials-save" disabled>保存附件为本卷待审版本</button></fieldset><div class="actions"><button data-action="close">取消／关闭</button></div>`,true);
 $('#modal').classList.add('materials-modal');materialsRenderRows();
}
function materialsRenderRows(){
 const editor=materialsEditor;if(!editor||!$('#materials-rows'))return;
 $('#materials-rows').innerHTML=editor.rows.map((r,i)=>`<article class="material-row"><div><strong>${i+1}. ${esc(r.document?.filename||r.file.name)}</strong><p class="micro">${r.existing?'已有原件':r.uploaded?'已暂存本机，尚需保存到本卷':'新增待上传'}</p>${r.existing?`<span class="tag">${esc(r.role)}</span> <a href="/api/files/${r.document.id}" target="_blank" rel="noopener">查看原件</a>`:`<select data-material-role="${i}" aria-label="新增附件用途">${options({'作业':'学生作业','参考答案':'老师参考答案'},r.role)}</select>`}</div><div class="row"><button data-action="materials-up" data-index="${i}" ${i===0?'disabled':''}>上移</button><button data-action="materials-down" data-index="${i}" ${i===editor.rows.length-1?'disabled':''}>下移</button>${r.existing?'':`<button data-action="materials-remove" data-index="${i}">撤下新文件</button>`}</div></article>`).join('')||'<p class="muted">当前没有附件，可选择补交原件；仍可保留人工录入题目。</p>';
}
function materialsRevoke(){
 materialsEditor.revision++;$('#materials-consent').checked=false;$('#materials-save').disabled=true;$('#materials-error').textContent='';
}
function materialsChanged(el){
 if(!materialsEditor||!$('#modal').open||!$('#materials-editor'))return;
 if(el.id==='materials-consent'){$('#materials-save').disabled=!el.checked;return;}
 if(el.id==='materials-files'){materialsRevoke();return;}
 if(el.matches('[data-material-role]')){const r=materialsEditor.rows[Number(el.dataset.materialRole)];if(!r||r.existing)throw Error('已有原件用途不能在这里更改');r.role=el.value;materialsRevoke();}
}
async function materialsHandle(action,el){
 if(action==='materials-open'){materialsOpen();return;}
 const editor=materialsEditor,form=$('#materials-editor');
 const sourceCurrent=()=>materialsEditor===editor&&form?.isConnected&&$('#modal').open&&view==='review'&&renderEpoch===editor?.epoch&&paperId===editor?.paperId&&paper()?.student_id===editor?.studentId&&paper()?.batch_id===editor?.batch&&paper()?.version===editor?.version&&!dirty;
 if(!sourceCurrent())throw Error('材料来源已变化，请在正确学生当前整卷重新打开');
 if(editor.saving)return;
 const i=Number(el.dataset.index);
 if(action==='materials-add'){
  const files=[...$('#materials-files').files];if(!files.length)throw Error('请先选择要补交的文件');
  if(editor.rows.length+files.length>20)throw Error('本卷总附件不能超过20个');
  for(const file of files)if(!file.size||file.size>15*1024*1024||! /\.(png|jpe?g|pdf|docx)$/i.test(file.name))throw Error('仅支持15MB以内的PNG/JPG/PDF/DOCX');
  editor.rows.push(...files.map(file=>({file,role:'作业',existing:false})));$('#materials-files').value='';materialsRevoke();materialsRenderRows();return;
 }
 if(['materials-up','materials-down','materials-remove'].includes(action)){
  if(!Number.isInteger(i)||!editor.rows[i])throw Error('附件清单已变化');
  if(action==='materials-remove'){if(editor.rows[i].existing)throw Error('此入口不删除已有原件');editor.rows.splice(i,1);}
  else {const j=i+(action==='materials-up'?-1:1);if(!editor.rows[j])return;[editor.rows[i],editor.rows[j]]=[editor.rows[j],editor.rows[i]];}
  materialsRevoke();materialsRenderRows();return;
 }
 if(action!=='materials-save')return;
 if(!$('#materials-consent').checked)throw Error('请先核对本卷目标与附件清单');
 if($('#materials-files').files.length)throw Error('还有未加入清单的文件，请先加入或清空选择');
 const revision=editor.revision,current=()=>sourceCurrent()&&revision===editor.revision;let committed=false;
 editor.saving=true;form.disabled=true;$('#materials-error').textContent='正在保存本机材料…';
 try{
  const documents=[];
  for(const row of editor.rows){
   if(!current())return;
   if(!row.existing&&!row.uploaded){const uploaded=await upload(row.file,row.role);if(!current())return;row.uploaded=uploaded;}
   documents.push({id:(row.document||row.uploaded).id,role:row.role});
  }
  if(!current()||!$('#materials-consent').checked)return;
  const result=await api('papers/'+editor.paperId+'/documents',{version:editor.version,student_id:editor.studentId,documents,consent:true});
  committed=true;materialsReloadNeeded=true;
  if(!current()){
   if(view==='review'&&paperId===editor.paperId&&!dirty&&!$('#modal').open)await render();
   return;
  }
  const boot=await api('bootstrap');if(!current())return;
  data=boot;token=boot.csrf_token;materialsReloadNeeded=false;selectedDoc=0;close();materialsEditor=null;await render();
  toast(result.version===editor.version?'材料清单未变化，原版本保留。':'材料已保存到本卷新待审版本；请重新审核，缺材料题仍需核对。');
 }catch(error){if(current()){$('#materials-error').textContent=committed?'材料已保存，但页面读取失败。请关闭窗口后切换页面重新读取，不要重复保存。':error.message+'；未自动重试。已暂存文件留在本机，本窗口重试可复用。';materialsRenderRows();}}
 finally{editor.saving=false;if(form.isConnected)form.disabled=committed;}
}
