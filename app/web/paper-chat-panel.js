'use strict';
// This state is local UI context. Only a prepared job can authorize one send.
let paperChat={studentId:'',papers:[],images:[],message:'',parent:null,revision:0,model:'',jobs:[],editor:null,savedScope:''};
let paperChatModalSequence=0;
const paperChatImageMime=mime=>['image/png','image/jpeg','image/webp'].includes(mime);
const paperChatSources=()=>paperChat.papers.map(p=>({paper_id:p.id,version:p.version,question_ids:p.questions.map(q=>q.id)}));
const paperChatImages=()=>paperChat.images.map(i=>({document_id:i.document_id,...(i.crop?{crop:i.crop}:{}),masks:i.masks||[]}));
const paperChatScope=()=>JSON.stringify({sources:paperChatSources(),images:paperChatImages()});
function paperChatMatchesJob(job){
 const canonical=sources=>sources.map(s=>({paper_id:s.paper_id,version:s.version,question_ids:[...s.question_ids].sort()})).sort((a,b)=>a.paper_id.localeCompare(b.paper_id));
 if(JSON.stringify(canonical(paperChatSources()))!==JSON.stringify(canonical(job.metadata?.sources||[])))return false;
 const images=job.metadata?.images||[];if(images.length!==paperChat.images.length)return false;
 return paperChat.images.every((image,index)=>{const actual=images[index],crop=image.crop||[0,0,...(actual.normalized_source_size||[])];return image.document_id===actual.document_id&&JSON.stringify(crop)===JSON.stringify(actual.crop)&&JSON.stringify(image.masks||[])===JSON.stringify(actual.masks||[]);});
}
function paperChatChanged(scope=false){paperChat.revision++;if(scope)paperChat.parent=null;paperChatMarkDirty();}
function paperChatLeave(){paperChatModalSequence++;paperChat={studentId:'',papers:[],images:[],message:'',parent:null,revision:paperChat.revision+1,model:'',jobs:[],editor:null,savedScope:''};if($('#modal').open)close();}
function paperChatCurrent(revision,sequence){return view==='paper-chat'&&paperChat.revision===revision&&(sequence===undefined||sequence===paperChatModalSequence);}
function paperChatMarkDirty(){dirty=!!(paperChat.message||paperChat.model&&paperChat.model!==aiSettings.model||(paperChat.papers.length||paperChat.images.length)&&paperChatScope()!==paperChat.savedScope);}
async function paperChatPage(){
 const revision=paperChat.revision,jobs=await api('ai/jobs');
 if(paperChatCurrent(revision))paperChat.jobs=jobs.filter(j=>j.mode==='paper_chat');
 const models=[...new Set([aiSettings.model,...jobs.map(j=>j.payload?.model)].filter(Boolean))];
 const papers=data.papers.filter(p=>p.student_id===paperChat.studentId);
 return `<div id="paper-chat-panel"><div class="notice">围绕老师明确选择的作业提问。只引用下方勾选卷子的全部题干与原作答，最多3卷、3张图；不会自动读取完整档案。回答仅保存在本机对话记录，正式档案仍由老师在既有核对入口审核。</div><div class="profile-grid"><section class="panel"><h2>本次材料与问题</h2><label class="field"><span>先明确选择一名学生</span><select id="paper-chat-student"><option value="">选择学生（不自动选取）</option>${data.students.map(s=>`<option value="${esc(s.id)}" ${s.id===paperChat.studentId?'selected':''}>${esc(s.name)} / ${esc(s.ref)}</option>`).join('')}</select></label><fieldset><legend>勾选本次引用的作业（最多3份，同一学生）</legend>${paperChat.studentId?papers.map(p=>`<label class="field"><span><input type="checkbox" data-chat-paper="${esc(p.id)}" ${paperChat.papers.some(s=>s.id===p.id)?'checked':''}> ${esc(p.title)} · V${p.version}</span></label>`).join('')||'<p class="muted">该学生暂无作业。</p>':'<p class="muted">请先选学生，再勾选作业。</p>'}</fieldset>${paperChat.papers.map(p=>`<details><summary>${esc(p.title)} · V${p.version} · 本次引用${p.questions.length}道题，查看全部文字</summary>${p.questions.map(q=>`<article class="issue"><strong>${esc(q.id)}</strong><p class="formula">${esc(q.stem)}</p><p style="white-space:pre-wrap">学生原作答：${esc(q.answer||'空')}</p><p style="white-space:pre-wrap">核对参考：${esc(q.correct_answer||'无参考')}</p></article>`).join('')}</details>`).join('')}<h3>选择图片（可选，共${paperChat.images.length}/3张）</h3><p class="form-hint">勾选作业不会自动附带照片。现有作业图片可另行裁切和涂白；PDF、Word与参考答案附件不在此图片入口中。</p>${paperChat.papers.flatMap(p=>(p.documents||[]).filter(d=>paperChatImageMime(d.mime)&&(d.role||'作业')==='作业').map(d=>`<button data-action="paper-chat-image" data-paper="${esc(p.id)}" data-document="${esc(d.id)}">预览／裁切 ${esc(d.filename)}</button>`)).join('')}<label class="field"><span>从本机加入照片（仅保存到本机，不自动外发）</span><input id="paper-chat-files" type="file" accept="image/png,image/jpeg,image/webp" multiple ${paperChat.studentId?'':'disabled'}></label><p class="micro muted">新上传照片在本页按整图加入，暂不支持裁切或遮挡。请先在本机去掉姓名、学校等身份信息；下一步必须检查服务器重新生成的实际PNG。选择图片不代表图片能力已通过验证。</p>${paperChat.images.map((i,n)=>`<article class="issue"><strong>${esc(i.filename)}</strong><p class="micro">${i.crop?'裁切 '+i.crop.join(', ')+'；遮挡 '+i.masks.length+'处':'整张图片，未做遮挡'}</p><button data-action="paper-chat-preview-image" data-index="${n}">查看本地原图</button> <button data-action="paper-chat-remove-image" data-index="${n}">移除</button></article>`).join('')}<label class="field"><span>针对所选材料的问题（请勿填写身份信息）</span><textarea id="paper-chat-message" rows="5" maxlength="6000" placeholder="例如：对照这些题的原作答，解释容易混淆的步骤。">${esc(paperChat.message)}</textarea></label><p id="paper-chat-parent" class="micro muted">${paperChat.parent?'本次追问承接任务 '+esc(paperChat.parent.id)+'；范围改变后会开始新对话。':'当前为新对话；只引用明确选择的材料。'}</p><div class="actions"><button data-action="paper-chat-new">新对话（清空问题与上下文）</button><button class="primary" data-action="paper-chat-prepare">生成实际外发预览（不发送）</button></div></section><section class="panel"><h2>当前模型</h2><p>已保存模型：<strong>${esc(aiSettings.model)}</strong></p><p class="micro muted">${aiSettings.connection?.status==='SUCCEEDED'?'当前连接文字测试已通过':'当前设置尚未通过文字连接测试，请先测试。'} · 图片${aiSettings.vision_status==='VERIFIED_THIS_SESSION'?'已完成本次会话数字验证':'尚未验证'}</p><label class="field"><span>可输入服务商原始模型ID，历史使用值供选择</span><input id="paper-chat-model" list="paper-chat-models" value="${esc(paperChat.model||aiSettings.model)}" autocomplete="off"><datalist id="paper-chat-models">${models.map(m=>`<option value="${esc(m)}"></option>`).join('')}</datalist></label><button data-action="paper-chat-model-apply">明确应用模型并前往测试</button> <button data-view="ai">打开AI服务与连接测试</button><p class="micro muted">换模型后需重新测试文字连接和图片能力；不会新增或显示密钥，不自动发起测试。</p><hr class="divider"><h2>本地对话记录</h2><p class="form-hint">最近30次AI任务中的试卷对话。打开记录只读取本机数据；没有自动重发、自动归档。</p>${paperChat.jobs.map(j=>`<button class="list-button" data-action="paper-chat-open-job" data-job="${esc(j.id)}"><strong>${esc(aiLabels[j.status]||j.status)}</strong><small>${esc(j.created_at)} · ${esc(j.payload?.model)}</small><small>${esc(j.metadata?.sources?.length||0)}卷 · ${j.metadata?.previous_job_id?'追问':'新对话'}</small></button>`).join('')||'<p class="muted">暂无本地试卷对话。</p>'}</section></div></div>`;
}
function paperChatPayloadHTML(job){
 return (job.payload?.messages||[]).map((message,index)=>`<section class="issue"><strong>消息 ${index+1} · ${esc(message.role)}</strong>${typeof message.content==='string'?`<pre class="payload-preview" style="white-space:pre-wrap">${esc(message.content)}</pre>`:(message.content||[]).map(part=>part.type==='text'?`<pre class="payload-preview" style="white-space:pre-wrap">${esc(part.text)}</pre>`:part.type==='image_url'&&/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(part.image_url?.url||'')?`<img class="vision-outbound-image" src="${esc(part.image_url.url)}" alt="服务器重新生成的实际外发PNG"><details><summary>按原始像素查看完整实际PNG（可滚动检查）</summary><div style="overflow:auto;max-height:70vh"><img src="${esc(part.image_url.url)}" style="max-width:none;width:auto;height:auto" alt="完整实际外发PNG原始像素"></div></details>`:'<p class="bad">无法预览的消息内容，不能授权发送。</p>').join('')}</section>`).join('');
}
function paperChatShowJob(job){
 const sequence=++paperChatModalSequence,revision=paperChat.revision;
 const follow=job.status==='SUCCEEDED'&&paperChatMatchesJob(job);
 const sources=job.metadata?.sources||[];
 const known=paperChat.jobs.findIndex(j=>j.id===job.id);if(known>=0)paperChat.jobs[known]=job;else paperChat.jobs.unshift(job);
 const title=job.status==='PREPARED'?'检查全部实际外发材料':'试卷对话 · '+(aiLabels[job.status]||job.status);
 modal(`<section id="paper-chat-job" data-job="${esc(job.id)}"><h2>${esc(title)}</h2><p class="path">任务 ${esc(job.id)} · ${esc(job.created_at)}<br>目的地址：${esc(job.destination)}<br>模型：${esc(job.payload?.model)} · 最多输出 ${esc(job.payload?.max_tokens)} Token</p><p class="micro">本地来源：${sources.map(s=>esc(s.paper_id)+' / V'+esc(s.version)+' / '+esc((s.question_ids||[]).join('、'))).join('；')||'仅本次明确选入的图片'}${job.metadata?.previous_job_id?'；承接 '+esc(job.metadata.previous_job_id):''}</p>${job.error?`<div class="notice warn">${esc(job.error)}</div>`:''}${job.status==='PREPARED'?`<div class="notice warn">下方展示本次实际请求的全部文字（包含追问上下文）与实际PNG。请检查姓名、学校、账号及身份信息，裁切／遮挡是否完整；文字也可能夹带身份信息。可能产生服务用量；不自动重试。</div>${paperChatPayloadHTML(job)}<label><input id="paper-chat-send-consent" type="checkbox"> 我已逐项检查文字、图片和目的地址，确认材料范围已获授权、没有身份信息，允许仅本次发送</label>${!aiSettings.key_loaded?'<p class="bad">本机会话没有密钥，请先在AI服务中输入。</p>':''}<div class="actions"><button data-action="close">取消，不发送</button><button class="primary" id="paper-chat-send" data-action="paper-chat-send" data-job="${esc(job.id)}" data-sequence="${sequence}" data-revision="${revision}" disabled>授权发送这一次</button></div>`:`${typeof job.result?.answer==='string'?`<div class="notice">模型回答需老师核实；不会自动改卷或写入正式档案。</div><div id="paper-chat-answer" class="issue" style="white-space:pre-wrap;overflow-wrap:anywhere">${esc(job.result.answer)}</div>`:''}<p class="micro muted">服务返回用量：${job.usage?esc(JSON.stringify(job.usage)):'未知／未返回'}。结果待核查时先查看上游记录，不自动重发。</p><details><summary>查看当时实际发送的文字与图片</summary>${paperChatPayloadHTML(job)}</details><div class="actions"><button data-action="close">关闭</button><button data-action="paper-chat-export" data-job="${esc(job.id)}">导出Markdown</button>${follow?`<button class="primary" data-action="paper-chat-followup" data-job="${esc(job.id)}">按当前相同范围追问</button>`:''}</div>${!follow&&job.status==='SUCCEEDED'?'<p class="micro muted">材料范围与当前选择不一致，或当前未选择这次来源；重新明确选择材料可开始新对话。</p>':''}`}</section>`,true);
}
async function paperChatOpenImage(paperId,documentId){
 if(paperChat.images.length>=3&&!paperChat.images.some(i=>i.document_id===documentId))throw Error('每次最多3张图片');
 const p=paperChat.papers.find(p=>p.id===paperId),doc=p?.documents.find(d=>d.id===documentId);
 if(!p||!doc||!paperChatImageMime(doc.mime)||(doc.role||'作业')!=='作业')throw Error('请在当前勾选作业中重新选择图片');
 const revision=paperChat.revision,sequence=++paperChatModalSequence,old=paperChat.images.find(i=>i.document_id===documentId);
 const editor={document_id:documentId,paper_id:paperId,filename:doc.filename,crop:old?.crop||null,masks:old?.masks.map(r=>[...r])||[],mode:'crop',image:null,start:null};paperChat.editor=editor;
 modal(`<h2>裁切与遮挡这次需要的题目</h2><div class="notice warn">请去掉姓名、学校等身份信息。坐标按本机标准化图片计算，原件不变；只有生成任务后的实际PNG才是外发材料。遮挡不会自动识别人名。</div><div class="row"><button data-action="paper-chat-crop-mode">框选题目</button><button data-action="paper-chat-mask-mode">涂白身份区域</button><button data-action="paper-chat-whole">选择整张图</button><button data-action="paper-chat-undo-mask">撤销遮挡</button></div><p id="paper-chat-selection" class="micro muted">正在读取本机标准化图片…</p><div class="vision-canvas-wrap"><canvas id="paper-chat-canvas" aria-label="拖动框选题目或涂白身份区域"></canvas></div><div class="actions"><button data-action="close">取消</button><button id="paper-chat-use-image" data-action="paper-chat-use-image" disabled>将这个区域加入本次材料（不发送）</button></div>`,true);
 const image=new Image();await new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=()=>reject(Error('本机标准化图片无法读取'));image.src=`/api/papers/${encodeURIComponent(paperId)}/image/${encodeURIComponent(documentId)}`;});
 if(!paperChatCurrent(revision,sequence)||paperChat.editor!==editor||!$('#paper-chat-canvas'))return;
 editor.image=image;const canvas=$('#paper-chat-canvas');canvas.width=image.naturalWidth;canvas.height=image.naturalHeight;paperChatDraw();
}
function paperChatDraw(temp){
 const e=paperChat.editor,c=$('#paper-chat-canvas');if(!c||!e?.image)return;const ctx=c.getContext('2d');ctx.clearRect(0,0,c.width,c.height);ctx.drawImage(e.image,0,0);
 for(const r of e.masks){ctx.fillStyle='#fff';ctx.fillRect(r[0],r[1],r[2]-r[0],r[3]-r[1]);}
 const r=temp||e.crop;if(r){ctx.strokeStyle=e.mode==='mask'&&temp?'#b64a56':'#14665f';ctx.lineWidth=Math.max(3,c.width/350);ctx.strokeRect(r[0],r[1],r[2]-r[0],r[3]-r[1]);}
 $('#paper-chat-selection').textContent=`${e.mode==='mask'?'涂白遮挡':'框选题目'}；${e.crop?'已选 '+e.crop.join(', '):'尚未选区'}；遮挡${e.masks.length}处`;
 $('#paper-chat-use-image').disabled=!e.crop;
}
function paperChatPoint(event){const c=$('#paper-chat-canvas'),r=c.getBoundingClientRect();return [Math.max(0,Math.min(c.width,Math.round((event.clientX-r.left)*c.width/r.width))),Math.max(0,Math.min(c.height,Math.round((event.clientY-r.top)*c.height/r.height)))];}
document.addEventListener('pointerdown',event=>{if(event.target.id!=='paper-chat-canvas'||!paperChat.editor?.image)return;event.preventDefault();paperChat.editor.start=paperChatPoint(event);event.target.setPointerCapture(event.pointerId);});
document.addEventListener('pointermove',event=>{if(event.target.id==='paper-chat-canvas'&&paperChat.editor?.start)paperChatDraw(visionRect(paperChat.editor.start,paperChatPoint(event)));});
document.addEventListener('pointerup',event=>{if(event.target.id!=='paper-chat-canvas'||!paperChat.editor?.start)return;const e=paperChat.editor,r=visionRect(e.start,paperChatPoint(event));e.start=null;if(r[2]-r[0]<20||r[3]-r[1]<20)return;if(e.mode==='mask'){if(e.masks.length>=20){toast('最多20处遮挡');return;}e.masks.push(r);}else e.crop=r;paperChatDraw();});
document.addEventListener('input',event=>{if(view!=='paper-chat')return;if(event.target.id==='paper-chat-message'){paperChat.message=event.target.value;paperChatChanged();}if(event.target.id==='paper-chat-model'){paperChat.model=event.target.value;paperChatChanged();}});
document.addEventListener('cancel',event=>{if(event.target.id==='modal')paperChatModalSequence++;},true);
document.addEventListener('change',async event=>{
 const el=event.target;if(el.id==='paper-chat-send-consent'){const send=$('#paper-chat-send');if(send)send.disabled=!el.checked||!aiSettings.key_loaded;return;}if(view!=='paper-chat')return;
 try{
  if(el.id==='paper-chat-student'){
   if((paperChat.message||paperChat.images.length||paperChat.papers.length)&&!window.confirm('切换学生会清空本次材料、问题和追问上下文，继续吗？')){el.value=paperChat.studentId;return;}
   paperChat.studentId=el.value;paperChat.papers=[];paperChat.images=[];paperChat.message='';paperChatChanged(true);await render();return;
  }
  if(el.dataset.chatPaper){
   const id=el.dataset.chatPaper;if(!el.checked){paperChat.papers=paperChat.papers.filter(p=>p.id!==id);paperChat.images=paperChat.images.filter(i=>i.paper_id!==id);paperChatChanged(true);await render();return;}
   if(paperChat.papers.length>=3){el.checked=false;throw Error('最多勾选3份同一学生的作业');}
   const summary=data.papers.find(p=>p.id===id);if(!summary||summary.student_id!==paperChat.studentId){el.checked=false;throw Error('作业不属于当前明确选择的学生');}
   paperChatChanged(true);const revision=paperChat.revision,p=await api('papers/'+encodeURIComponent(id));
   if(!paperChatCurrent(revision)||!el.isConnected||!el.checked)return;
   if(p.student_id!==paperChat.studentId||paperChat.papers.length>=3)throw Error('材料范围已变化，请重新勾选');
   paperChat.papers.push(p);paperChatChanged(true);await render();return;
  }
  if(el.id==='paper-chat-files'){
   if(!paperChat.studentId)throw Error('请先明确选择学生');const files=[...el.files];if(files.length+paperChat.images.length>3)throw Error('每次最多3张图片');
   for(const file of files){if(!paperChatImageMime(file.type))throw Error('只支持PNG、JPEG、WebP真实图片');if(file.size>15*1024*1024)throw Error('图片超过15MB');}
   paperChatChanged(true);const revision=paperChat.revision;const uploaded=[];
   for(const file of files){const doc=await upload(file,'作业');if(!paperChatCurrent(revision))return;if(!paperChatImageMime(doc.mime))throw Error('本机检查发现文件不是PNG、JPEG、WebP图片');uploaded.push({document_id:doc.id,filename:doc.filename,crop:null,masks:[],paper_id:null});}
   if(!paperChatCurrent(revision))return;paperChat.images.push(...uploaded);paperChatChanged(true);await render();toast('照片仅保存到本机，未发送；请在实际外发预览中检查整张PNG');
  }
 }catch(error){if(el.dataset.chatPaper&&el.isConnected)el.checked=paperChat.papers.some(p=>p.id===el.dataset.chatPaper);if(el.id==='paper-chat-files')el.value='';toast(error.message);}
});
async function paperChatHandle(action,el){
 if(action==='paper-chat-new'){paperChat.message='';paperChat.parent=null;paperChatChanged();await render();toast('新对话已开始；保留当前明确选择的材料，没有继承历史回答');return;}
 if(action==='paper-chat-image')return paperChatOpenImage(el.dataset.paper,el.dataset.document);
 if(action==='paper-chat-preview-image'){const i=paperChat.images[Number(el.dataset.index)];if(!i)throw Error('图片已移除');paperChatModalSequence++;modal(`<h2>本地原图（不是最终外发PNG）</h2><div class="notice warn">这张原图仅在本机查看。实际裁切和遮挡请在下一步外发预览中逐项核对。</div><img class="vision-outbound-image" src="/api/files/${encodeURIComponent(i.document_id)}" alt="本地原图"><div class="actions"><button data-action="close">关闭</button></div>`,true);return;}
 if(action==='paper-chat-remove-image'){paperChat.images.splice(Number(el.dataset.index),1);paperChatChanged(true);await render();return;}
 if(['paper-chat-crop-mode','paper-chat-mask-mode','paper-chat-whole','paper-chat-undo-mask','paper-chat-use-image'].includes(action)){
  const e=paperChat.editor;if(!e?.image||!$('#paper-chat-canvas'))throw Error('图片尚未读完，请稍候');
  if(action==='paper-chat-crop-mode'||action==='paper-chat-mask-mode')e.mode=action==='paper-chat-mask-mode'?'mask':'crop';
  if(action==='paper-chat-whole')e.crop=[0,0,e.image.naturalWidth,e.image.naturalHeight];
  if(action==='paper-chat-undo-mask')e.masks.pop();
  if(action==='paper-chat-use-image'){if(!e.crop)throw Error('请先框选或明确选择整张图片');if(!paperChat.papers.some(p=>p.id===e.paper_id))throw Error('原卷已移除，请重新选择');const image={document_id:e.document_id,paper_id:e.paper_id,filename:e.filename,crop:[...e.crop],masks:e.masks.map(r=>[...r])},index=paperChat.images.findIndex(i=>i.document_id===e.document_id);if(index<0){if(paperChat.images.length>=3)throw Error('每次最多3张图片');paperChat.images.push(image);}else paperChat.images[index]=image;paperChatChanged(true);close();await render();return;}
  paperChatDraw();return;
 }
 if(action==='paper-chat-model-apply'){
  const model=$('#paper-chat-model').value.trim();if(!model)throw Error('请填写服务商模型ID');
  const revision=paperChat.revision,settings=await api('ai/settings',{...aiSettings,model});if(!paperChatCurrent(revision))return;aiSettings=settings;paperChat.parent=null;paperChat.model='';paperChat.revision++;close();view='ai';history.replaceState(null,'','#ai');await render();toast('模型已应用；请明确测试当前连接，图片也需要重新验证');return;
 }
 if(action==='paper-chat-prepare'){
  if(!paperChat.studentId)throw Error('请先明确选择学生');paperChat.message=$('#paper-chat-message').value;if(!paperChat.message.trim())throw Error('请填写针对材料的问题');if(!paperChat.papers.length&&!paperChat.images.length)throw Error('至少明确选入一份作业或一张图片');
  if(paperChat.model&&paperChat.model!==aiSettings.model)throw Error('模型输入尚未应用，请先明确应用并测试，或恢复已保存模型ID');
  const revision=paperChat.revision,sequence=++paperChatModalSequence,scope=paperChatScope(),settings=await api('ai/settings');if(!paperChatCurrent(revision,sequence))return;aiSettings=settings;
  if(settings.connection?.status!=='SUCCEEDED')throw Error('请先到AI服务主动测试当前已保存的文字连接');
  if(paperChat.images.length&&settings.vision_status!=='VERIFIED_THIS_SESSION')throw Error('请先到AI服务完成当前模型与密钥的合成数字图片验证');
  const payload={mode:'paper_chat',message:paperChat.message,sources:paperChatSources(),images:paperChatImages()};if(paperChat.parent?.id&&paperChat.parent.scope===scope)payload.previous_job_id=paperChat.parent.id;
  const job=await api('ai/prepare',payload);if(!paperChatCurrent(revision,sequence))return;
  paperChatShowJob(job);return;
 }
 if(action==='paper-chat-send'){
  const consent=$('#paper-chat-send-consent');if(!consent?.checked)throw Error('请先逐项检查并明确授权本次发送');const revision=Number(el.dataset.revision),sequence=Number(el.dataset.sequence);if(!paperChatCurrent(revision,sequence))throw Error('本次来源已变化，请重新生成预览');
  el.disabled=true;el.textContent='正在请求…请勿重复发送';consent.disabled=true;
  try{const job=await api('ai/jobs/'+encodeURIComponent(el.dataset.job)+'/send',{consent:true});if(!paperChatCurrent(revision,sequence)||!el.isConnected)return;paperChat.message='';if(job.status==='SUCCEEDED'&&paperChatMatchesJob(job))paperChat.savedScope=paperChatScope();paperChat.parent=job.status==='SUCCEEDED'&&paperChatMatchesJob(job)?{id:job.id,scope:paperChatScope(),scopeHash:job.metadata.scope_hash}:null;aiSettings=await api('ai/settings');if(!paperChatCurrent(revision,sequence)||!el.isConnected)return;close();const resultSequence=paperChatModalSequence;await render();if(paperChatCurrent(revision,resultSequence))paperChatShowJob(job);}catch(error){if(paperChatCurrent(revision,sequence)&&el.isConnected)el.textContent='请先从本地记录查看状态';throw error;}return;
 }
 if(action==='paper-chat-open-job'){
  const revision=paperChat.revision,sourceView=view,sequence=++paperChatModalSequence;const job=await api('ai/jobs/'+encodeURIComponent(el.dataset.job));if(view!==sourceView||paperChat.revision!==revision||paperChatModalSequence!==sequence)return;paperChatShowJob(job);return;
 }
 if(action==='paper-chat-followup'){const job=paperChat.jobs.find(j=>j.id===el.dataset.job);if(!job||job.status!=='SUCCEEDED'||!paperChatMatchesJob(job))throw Error('材料或上下文已变化，请重新选择来源');paperChat.parent={id:job.id,scope:paperChatScope(),scopeHash:job.metadata.scope_hash};close();const parent=$('#paper-chat-parent');if(parent)parent.textContent='本次追问承接任务 '+job.id+'；范围改变后会开始新对话。';$('#paper-chat-message')?.focus();toast('请填写追问；仍须重新预览并授权发送一次');return;}
 if(action==='paper-chat-export'){const response=await fetch('/api/ai/jobs/'+encodeURIComponent(el.dataset.job)+'/markdown');if(!response.ok){const error=await response.json();throw Error(error.error||'导出失败');}const blob=await response.blob(),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='paper-chat-'+el.dataset.job+'.md';a.click();setTimeout(()=>URL.revokeObjectURL(url),5000);return;}
}
