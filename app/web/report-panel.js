'use strict';
let reportEpoch=0,reportSession=null;
function reportCurrent(context,opened=false){
 return context.epoch===reportEpoch&&view==='profile'&&archiveIsCurrent(context.studentId)&&renderEpoch===context.renderEpoch&&reviewFlowEdits===context.edits&&(!opened||($('#modal').open&&$('#profile-report')===context.root));
}
function reportBlocksHTML(blocks){return blocks.map(([kind,text])=>kind==='heading'?`<h3>${esc(text)}</h3>`:`<p class="${kind==='math'?'formula':''}">${esc(text)}</p>`).join('');}
async function reportPreview(){
 if(view!=='profile'||!currentProfile?.student||!archiveIsCurrent(currentProfile.student.id))throw Error('请先重新读取当前学生档案');
 const context={epoch:++reportEpoch,paperId,studentId:currentProfile.student.id,renderEpoch,edits:reviewFlowEdits};
 reportSession=null;
 const report=await api('profiles/'+context.studentId+'/report');
 if(!reportCurrent(context))return;
 if(report.student_id!==context.studentId)throw Error('报告学生来源不一致，请重新读取');
 modal(`<section id="profile-report"><h2>个人学情报告 · 教师核对稿</h2><div class="notice">报告含本机学生记录，仅供教师核对。本次预览和导出不修改档案，不自动发给学生或家长。</div><div class="profile-report-preview">${reportBlocksHTML(report.blocks)}</div><fieldset><legend>选择本次导出格式</legend><label class="field"><span><input type="radio" name="report-format" value="docx"> 可编辑 Word</span></label><label class="field"><span><input type="radio" name="report-format" value="pdf"> 打印页 / 另存 PDF</span></label></fieldset><p class="micro muted">Word使用原生公式文本及简单上标，复杂公式和图形仍需对照原件；打印前核对分页。导出的文件含个人学习资料，请妥善保管。</p><label><input type="checkbox" id="report-consent"> 我已核对以上教师稿，选择本次导出</label><p id="report-state" role="status"></p><div class="actions"><button data-action="close">取消</button><button class="primary" id="report-export" data-action="report-export" disabled>按所选格式导出</button></div></section>`);
 context.edits=reviewFlowEdits;context.root=$('#profile-report');context.report=report;context.invalid=false;context.sending=false;reportSession=context;
}
function reportChoiceChanged(){const s=reportSession;if(!s||!reportCurrent(s,true))return;$('#report-export').disabled=s.invalid||s.sending||!$('#report-consent').checked||!$('input[name=report-format]:checked');}
async function reportExport(){
 const s=reportSession;
 if(!s||!reportCurrent(s,true)||s.invalid||s.sending)throw Error('报告窗口已变化，请重新预览');
 const format=$('input[name=report-format]:checked')?.value;
 if(!['docx','pdf'].includes(format)||!$('#report-consent').checked)throw Error('请选择格式并核对教师稿');
 let printWindow=null;
 const nativeDesktop=!!window.pywebview;
 // Open synchronously while this click still has browser activation. A blank
 // same-origin window lets us detect blocking and sever opener before navigation.
 if(format==='pdf'&&!nativeDesktop){
  printWindow=window.open('about:blank','_blank');
  if(!printWindow)throw Error('浏览器已阻止打印弹窗，请允许本机弹窗后重试');
  try{printWindow.opener=null;printWindow.document.title='正在核对教师报告';printWindow.document.body.textContent='正在核对当前档案，请稍候。';}
  catch(error){printWindow.close();throw error;}
 }
 s.sending=true;reportChoiceChanged();
 try{
  const current=await api('profiles/'+s.studentId+'/report');
  if(!reportCurrent(s,true))return;
  if(current.student_id!==s.studentId||current.fingerprint!==s.report.fingerprint){s.invalid=true;$('#report-state').textContent='档案已更新，请关闭后重新预览核对。';throw Error('学生档案已更新，请重新预览核对后导出');}
  const url=(format==='docx'?'/api/export/profile/':'/print/profile/')+s.studentId+(format==='docx'?'.docx':'')+'?fingerprint='+encodeURIComponent(s.report.fingerprint);
  if(format==='docx'){
   const r=await fetch(url);
   if(!r.ok){const body=await r.json();if(reportCurrent(s,true)){s.invalid=true;throw Error(body.error||'报告导出失败，请重新预览');}return;}
   const blob=await r.blob();if(!reportCurrent(s,true))return;
   const a=document.createElement('a'),objectURL=URL.createObjectURL(blob);a.href=objectURL;a.download='个人学情报告-教师核对稿.docx';a.click();setTimeout(()=>URL.revokeObjectURL(objectURL),5000);
  }else{
   if(!reportCurrent(s,true))return;
   if(nativeDesktop){
    // WebView2 delegates popups to the system browser without a WindowProxy.
    // Open only the verified local print URL, never an intermediate blank page.
    window.open(new URL(url,location.href).href,'_blank','noopener');
   }else{
    if(printWindow.closed)throw Error('打印窗口已关闭，请重新选择导出');
    printWindow.location.replace(url);printWindow=null;
   }
  }
  close();reportSession=null;toast(format==='docx'?'教师报告 Word 已生成，请检查公式与排版。':'教师打印页已打开，请核对分页后另存 PDF。');
 }finally{if(printWindow&&!printWindow.closed)printWindow.close();if(reportCurrent(s,true)){s.sending=false;reportChoiceChanged();}}
}
function reportHandle(action){if(action==='report-preview')return reportPreview();if(action==='report-export')return reportExport();}
