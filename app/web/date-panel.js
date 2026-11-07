'use strict';
let dateSession=null;
function dateFieldHTML(){return '<label class="field"><span>作业／考试日期（选填，按老师提供）</span><input id="new-assignment-date" type="date"><small>未提供请留空，不按上传时间或标题猜测。</small></label>';}
function dateSummaryHTML(p){return `<section id="assignment-date-summary" class="panel"><div class="panel-head"><h2>本卷作业日期：${esc(p.assignment_date||'未提供')}</h2><button data-action="date-open">填写／修改作业日期</button></div><p class="micro muted">日期由老师提供，和系统写入时间分开；修改后本卷重新待审，旧确认保留当时日期。</p></section>`;}
function dateCurrent(s){return dateSession===s&&view==='review'&&paperId===s.paperId&&paper()?.student_id===s.studentId&&paper()?.version===s.version&&renderEpoch===s.epoch&&reviewFlowEdits===s.edits&&$('#modal').open&&$('#assignment-date-editor')===s.root;}
function dateChoices(){const s=dateSession;if(!s||!dateCurrent(s))return;$('#assignment-date-save').disabled=s.saving||s.invalid||!$('#assignment-date-value').validity.valid||$('#assignment-date-value').value===s.original;}
function dateOpen(){
 const p=paper();if(view!=='review'||!p)throw Error('请从当前整卷修改日期');
 if(dirty)throw Error('请先保存当前原卷修改，再填写作业日期');
 modal(`<section id="assignment-date-editor"><h2>填写本卷作业／考试日期</h2><p>${esc(p.student_name)} · ${esc(p.title)} · V${p.version}</p><label class="field"><span>老师提供的作业日期（选填）</span><input id="assignment-date-value" type="date" value="${esc(p.assignment_date||'')}"></label><p>未提供可留空或清空。保存会生成新的待审原卷版本；原题、原答和历史确认不改写，之后仍需老师重新核对本卷。</p><p class="micro muted">保存前取消不会写入。提交保存后即使关闭窗口，本地保存仍可能完成，请刷新原卷核对；关闭只取消窗口与后续页面刷新。</p><div class="actions"><button data-action="close">取消／关闭</button><button id="assignment-date-save" class="primary" data-action="date-save" disabled>保存为新待审版本</button></div></section>`);
 dateSession={paperId:p.id,studentId:p.student_id,version:p.version,original:p.assignment_date||'',epoch:renderEpoch,edits:reviewFlowEdits,root:$('#assignment-date-editor'),saving:false,invalid:false};
}
function dateClose(){const pending=dateSession?.saving;close();dateSession=null;if(pending)toast('窗口已关闭；已提交的本地保存可能完成，请刷新原卷核对。');}
async function dateSave(){
 const s=dateSession;if(!s||!dateCurrent(s)||dirty||s.saving||s.invalid)throw Error('原卷或窗口已变化，请重新核对日期');
 const input=$('#assignment-date-value');if(!input.checkValidity()){input.reportValidity();throw Error('请填写完整有效的日期，或明确清空');}
 const value=input.value;if(value===s.original)return;
 s.saving=true;$('#assignment-date-value').disabled=true;dateChoices();
 try{
  const saved=await api('papers/'+s.paperId+'/assignment-date',{version:s.version,assignment_date:value});
  if(!dateCurrent(s))return;
  if(saved.id!==s.paperId||saved.student_id!==s.studentId||saved.assignment_date!==value)throw Error('日期保存回执归属不一致，请刷新核对');
  const boot=await api('bootstrap');if(!dateCurrent(s))return;
  const current=boot.papers.find(p=>p.id===s.paperId);
  if(!current||current.student_id!==s.studentId||current.version!==saved.version||current.assignment_date!==value){s.invalid=true;throw Error('日期保存后原卷又有更新，请关闭并刷新核对');}
  data=boot;token=boot.csrf_token;close();dateSession=null;await render();toast('作业日期已保存为新待审版本；旧确认仍保留当时日期。');
 }catch(error){if(dateCurrent(s))throw error;}
 finally{if(dateCurrent(s)){s.saving=false;$('#assignment-date-value').disabled=false;dateChoices();}}
}
function dateHandle(action){if(action==='date-open')return dateOpen();if(action==='date-save')return dateSave();}
document.addEventListener('input',event=>{if(event.target.id==='assignment-date-value')dateChoices();});
document.addEventListener('change',event=>{if(event.target.id==='assignment-date-value')dateChoices();});
