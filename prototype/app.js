'use strict';
// 一次性交互原型。全部状态只保存在页面内存，不调用模型或档案接口。
const QUESTIONS = [
  { id:'Q01', title:'顶点式与对称轴', stem:'求抛物线 <span class="math">y = −(x − 2)<sup>2</sup> + 3</span> 的顶点坐标和对称轴。', answer:'顶点坐标：(−2，3)\n对称轴：x = −2', result:'INCORRECT', correct:'顶点为 (2, 3)，对称轴为 x = 2。', reason:'令括号内 x − 2 = 0，得到 x = 2，此时 y = 3。学生写出的负号需要保留，不能按正确答案修改原作答。', cause:'可能与符号理解或抄写有关。仅凭这道题无法确定原因，建议让学生解释“为什么 x 取这个值”。', tags:['二次函数','顶点式','符号辨识'] },
  { id:'Q02', title:'一元二次方程', stem:'解方程 <span class="math">x<sup>2</sup> − 5x + 6 = 0</span>。', answer:'(x − 2)(x − 3) = 0\nx = 2 或 x = 3', result:'CORRECT', correct:'x = 2 或 x = 3。', reason:'因式分解正确，两组解均已写出，代回原方程成立。本次表现可记录为优势证据，不直接判定长期掌握。', cause:'本题未发现错误。本次答对只增加一份学习证据。', tags:['一元二次方程','因式分解','解集完整性'] },
  { id:'Q03', title:'分式化简与取值限制', stem:'化简 <span class="math">(x<sup>2</sup> − 1) / (x − 1)</span>，并写出 <span class="math">x</span> 的取值限制。', answer:'(x − 1)(x + 1) / (x − 1) = x + 1\n（未写取值限制）', result:'PARTIAL', correct:'化简为 x + 1，原式要求 x ≠ 1。', reason:'约分过程和化简结果正确，但原式分母不能为零。本次合成口径暂记部分正确，不推定机构的步骤分规则。', cause:'缺少取值条件是已观察到的现象。是否理解原式限制，仍需要老师进一步核实。', tags:['分式','因式分解','取值限制'] },
  { id:'Q04', title:'平均数的计算', stem:'求数据 <span class="math">6、8、10、12</span> 的平均数。', answer:'平均数 = (6 + 8 + 10 + 12) / 4\n= 36 / 4 = 8', result:'INCORRECT', correct:'平均数为 9。', reason:'求和 36 正确，36 ÷ 4 应为 9。保留学生写的 8，标记出错的具体运算步骤。', cause:'可确认末步结果不正确；是计算还是抄写问题，需要学生或老师补充证据。', tags:['统计','平均数','运算核对'] }
];
const LABELS = {CORRECT:'正确',INCORRECT:'错误',PARTIAL:'部分正确',PENDING:'待确认',MISSING:'材料缺失'};
const TYPES = {CORRECT:'correct',INCORRECT:'incorrect',PARTIAL:'partial',PENDING:'pending',MISSING:'neutral'};
const EXERCISES = [
  {name:'基础巩固',hint:'聚焦当前一个考点',title:'识别顶点与对称轴',question:'求抛物线 <span class="math">y = (x + 1)<sup>2</sup> − 4</span> 的顶点坐标和对称轴。',answer:'顶点 (−1, −4)，对称轴 x = −1。',method:'令 x + 1 = 0，得到 x = −1，此时 y = −4。',why:'与原题同型，改变括号内的符号，检查能否独立辨识。'},
  {name:'综合运用',hint:'连接顶点与轴交点',title:'从顶点到交点',question:'求 <span class="math">y = (x − 2)<sup>2</sup> − 1</span> 的顶点、对称轴以及与 x 轴的交点。',answer:'顶点 (2, −1)，对称轴 x = 2，交点 (1, 0)、(3, 0)。',method:'令 y = 0，得到 (x − 2)² = 1，所以 x = 1 或 x = 3。',why:'在顶点辨识之外连接方程求解，先确认基础环节再使用。'},
  {name:'迁移挑战',hint:'配方与范围判断',title:'由一般式迁移',question:'求 <span class="math">y = −x<sup>2</sup> + 6x − 5</span> 的最大值，并求 <span class="math">y ≥ 3</span> 时 x 的取值范围。',answer:'x = 3 时最大值为 4；y ≥ 3 时，2 ≤ x ≤ 4。',method:'配方为 y = −(x − 3)² + 4；y ≥ 3 即 (x − 3)² ≤ 1。',why:'需要主动转换表达式，再结合函数与不等式判断，适合后续挑战。'}
];
const VIEWS = {review:'作业审核',profile:'学习档案',class:'班级共性',practice:'补练与复测'};
const initialState = () => ({view:'review',q:0,zoom:1,results:QUESTIONS.map(q=>q.result),texts:QUESTIONS.map(q=>q.answer),archived:false,confirmed:[],classBatch:'image',level:0,generated:false,exerciseApproved:false,retest:null});
let state=initialState();
const requestedView=location.hash.slice(1)||new URLSearchParams(location.search).get('view');
if(VIEWS[requestedView])state.view=requestedView;
const root=document.querySelector('#workspace');
const modal=document.querySelector('#modal');
let toastTimer;
const escapeHtml=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const answerHtml=value=>escapeHtml(value).replace(/\n/g,'<br>');
const badge=value=>`<span class="pill ${TYPES[value]||'neutral'}">${LABELS[value]||escapeHtml(value)}</span>`;
const counts=values=>Object.keys(LABELS).reduce((o,key)=>(o[key]=values.filter(v=>v===key).length,o),{});
function toast(text){const el=document.querySelector('#toast');el.textContent=text;el.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('show'),4200);}
function go(view){state.view=view;history.replaceState(null,'','#'+view);render();window.scrollTo({top:0,behavior:'instant'});}
function heading(title,description,actions=''){return `<div class="page-heading"><div><h1>${title}</h1><p>${description}</p></div><div class="page-actions">${actions}</div></div>`;}
function render(){document.querySelector('#breadcrumb-current').textContent=VIEWS[state.view];document.querySelectorAll('[data-view]').forEach(b=>{b.classList.toggle('active',b.dataset.view===state.view);b.setAttribute('aria-current',b.dataset.view===state.view?'page':'false');});root.innerHTML=({review:reviewView,profile:profileView,class:classView,practice:practiceView}[state.view])();}
function reviewView(){
 const q=QUESTIONS[state.q],c=counts(state.results);
 return heading('先看整卷，再确认问题','每次处理一名学生。识别有疑点时先核对，确认后再进入个人学习记录。',`<span class="pill ${state.archived?'correct':'pending'}" id="paper-status">${state.archived?'本页演示已确认':'1 份等待复核'}</span><button class="button" data-action="export">导出材料</button>`)+
 `<div class="batch-strip"><strong>函数与代数巩固</strong><small>图片样例 · 4 题 · 2026年11月4日</small><div class="strip-end"><span id="review-progress">已确认 ${state.archived?1:0} / 1 人</span><div class="progress-track"><span style="width:${state.archived?100:0}%"></span></div></div></div>
 <div class="review-layout">
  <aside class="student-rail" aria-label="学生列表"><div class="rail-title"><span>本次学生</span><span>1</span></div><button class="student-button" aria-current="true"><span class="avatar">01</span><span><strong>演示学生 01</strong><small>${state.archived?'已确认':'待复核'}</small></span></button><p class="rail-note">这是独立四题样例。<br>按学生整份审核，<br>不与十人模拟卷合并。</p></aside>
  <section class="document-panel" aria-label="学生作答原图"><div class="panel-toolbar"><strong>学生原始作答</strong><div class="toolbar-right"><button class="icon-button" data-action="zoom-out" aria-label="缩小原图">−</button><span class="zoom-value">${Math.round(state.zoom*100)}%</span><button class="icon-button" data-action="zoom-in" aria-label="放大原图">＋</button><button class="text-button" data-action="image">大图</button></div></div><div class="document-stage"><img id="homework-image" class="paper-image" style="width:${state.zoom*100}%;max-width:none;flex-shrink:0" src="assets/synthetic-homework.png" alt="AI合成的四题数学作业照片，含蓝色手写过程；不是真实学生作业"></div><div class="document-caption">合成照片 · 1 / 1 页　　原笔迹保留，识别修改不改变原图</div></section>
  <section class="review-panel" aria-label="逐题复核"><div class="panel-toolbar"><strong>辅助批改 · 教师复核</strong><span class="muted">${state.archived?'已确认版本':'整卷草稿 V01'}</span></div>
   <div class="review-summary"><span><b style="color:var(--brand)">${c.CORRECT}</b>正确</span><span><b style="color:var(--red)">${c.INCORRECT}</b>错误</span><span><b style="color:var(--amber)">${c.PARTIAL}</b>部分正确</span><span class="right">${c.PENDING?c.PENDING+'项待确认':'4题齐全'}</span></div>
   <div class="question-tabs" role="group" aria-label="选择题目">${QUESTIONS.map((item,i)=>`<button class="question-tab ${state.q===i?'active':''}" data-q="${i}" aria-pressed="${state.q===i}">第${i+1}题<span class="q-dot ${TYPES[state.results[i]]}"></span></button>`).join('')}</div>
   <div class="question-body"><div class="question-title"><h2>${q.title}</h2>${badge(state.results[state.q])}</div><div class="stem">${q.stem}</div>
    <div class="field-label"><span>识别的原作答</span><button class="text-button" data-action="correct-text" ${state.archived?'disabled':''}>校正识别</button></div><div class="answer-box"><span class="math">${answerHtml(state.texts[state.q])}</span></div>
    <div class="analysis-section"><div class="field-label">数学核对依据</div><div class="body"><strong>${q.correct}</strong><br>${q.reason}</div></div>
    <div class="knowledge-row">${q.tags.map(t=>`<span class="knowledge-tag">${t}</span>`).join('')}</div>
    <div class="cause-box"><strong>${state.results[state.q]==='CORRECT'?'本次学习证据':'错因待核实'}</strong>${q.cause}</div>
    <div class="review-select-row"><label for="result-select">老师核对后的结果</label><select id="result-select" class="result-select" ${state.archived?'disabled':''}>${Object.keys(LABELS).map(k=>`<option value="${k}" ${state.results[state.q]===k?'selected':''}>${LABELS[k]}</option>`).join('')}</select></div>
   </div><div class="review-bottom"><button class="button primary" data-action="archive">${state.archived?'查看本次确认记录':'确认此学生整卷'}</button><p>${state.archived?'确认仅在本页演示，可前往学习档案查看':'将核对后的结果归入演示档案，保留原作答与疑点'}</p></div>
  </section>
 </div>`;
}
function profileView(){
 let body;
 if(!state.archived){body=`<div class="panel"><div class="empty-state"><h2>让确认过的证据进入档案</h2><p>这份图片作业还在审核中。老师确认后，本次问题、原作答和学习表现才会出现在这里。</p><button class="button primary" data-view="review">去审核这名学生</button></div></div>`;}
 else{
 const c=counts(state.confirmed),issues=QUESTIONS.filter((q,i)=>['INCORRECT','PARTIAL','PENDING'].includes(state.confirmed[i]));
 body=`<div class="content-grid"><div><section class="panel"><div class="student-heading"><div class="large-avatar">01</div><div><h2>演示学生 01</h2><p>当前图片作业 · 初中数学 · 本页演示记录</p></div></div><div class="metric-row"><div class="metric"><small>本次需关注</small><strong>${issues.length}<span>处</span></strong></div><div class="metric"><small>确认过的作答</small><strong>4<span>题</span></strong></div><div class="metric"><small>新题复测</small><strong>${state.retest?1:0}<span>次</span></strong></div></div></section>
 <section class="panel" style="margin-top:20px"><div class="section-heading"><h2>当前学习问题</h2><span class="pill neutral">依据作答，不作能力定论</span></div>${issues.length?issues.map(q=>{const i=QUESTIONS.indexOf(q);return `<div class="issue-row"><div class="issue-top"><h3>${q.title}</h3>${badge(state.confirmed[i])}</div><p>${q.correct}</p><div class="evidence-line">原题第${i+1}题 · 2026年11月4日确认 · ${i===0&&state.retest&&state.retest.result==='CORRECT'?(state.retest.condition==='独立完成，无提示'?'独立新题答对，继续观察':'本次答对但完成条件需区分，继续观察'):'错因或进一步理解仍待核实'}</div></div>`;}).join(''):'<p>没有已确认需要关注的问题。</p>'}<div class="callout">原错题始终保留。一次新题做对，只增加证据，不自动判为掌握。</div></section>
 </div><aside><section class="panel"><div class="section-heading"><h2>学习证据时间线</h2></div><div class="timeline">${state.retest?`<div class="timeline-item"><time>本页新增 · 模拟复测</time><h3>顶点式新题：${LABELS[state.retest.result]}</h3><p>${escapeHtml(state.retest.answer)}<br>完成条件：${escapeHtml(state.retest.condition)}。${state.retest.result==='CORRECT'?'增加一次证据，继续跟踪。':'保留当前表现，后续由老师决定。'}</p></div>`:''}<div class="timeline-item"><time>2026年11月4日 · 原卷确认</time><h3>四题原作答进入演示记录</h3><p>${c.CORRECT}题正确、${c.INCORRECT}题错误、${c.PARTIAL}题部分正确、${c.PENDING}题待确认。原图与教师确认结果分别保留。</p></div></div></section>
 <section class="panel" style="margin-top:20px"><h3>本次做得好的地方</h3><p style="margin-top:12px;font-size:12px">${state.confirmed[1]==='CORRECT'?'一元二次方程因式分解正确，两组解均完整写出。':'依据老师本次核对结果查看具体作答。'}</p><p class="scope-note">这是当前作答的积极证据，仍需跨次观察。</p></section></aside></div>`;
 }
 return heading('每个问题，都有来处','保留原错题，更新当前表现；把一次次作答连接成可追溯的学习记录。',`<button class="button" data-view="review">返回原卷</button><button class="button primary" data-view="practice">安排针对性补练</button>`)+body;
}
function classView(){
 const legacy=state.classBatch==='legacy';
 const rows=legacy?[
 ['分式化简',7,2,1,0,0],['一元二次方程',7,3,0,0,0],['二次函数顶点式',6,4,0,0,0],['等腰三角形底角',6,3,0,0,1],['平均数',7,2,0,0,1],['等可能计数',6,3,0,0,1]
 ]:QUESTIONS.map((q,i)=>{const r=state.archived?state.confirmed[i]:null;return[q.title,r==='CORRECT'?1:0,r==='INCORRECT'?1:0,r==='PARTIAL'?1:0,r==='PENDING'?1:0,r==='MISSING'?1:0];});
 const topics=legacy?[['顶点式中的符号辨识',4,'4名学生出现相同答错现象，具体原因仍待核实。'],['等腰三角形的两底角',3,'关注是否把两底角的和当成了每个底角。'],['等可能基本结果计数',3,'不同颜色不等于两个等可能结果。']]:state.archived?QUESTIONS.filter((q,i)=>['INCORRECT','PARTIAL'].includes(state.confirmed[i])).map(q=>[q.title,1,'只有1份确认样本，先作个人问题，不外推全班。']):[];
 return heading('共性问题，从个人证据汇总','原卷与复测分开统计，缺页与待确认不等于不会。',`<select class="toolbar-select" id="class-batch" aria-label="选择统计批次"><option value="image" ${!legacy?'selected':''}>本次图片练习 · 1份</option><option value="legacy" ${legacy?'selected':''}>十人模拟卷 · 独立6题样例</option></select>`)+
 `<div class="batch-strip"><strong>${legacy?'十人模拟卷（虚构）':'当前四题图片样例'}</strong><small>原卷 A01 · 最新确认状态</small><div class="strip-end"><span>已确认 ${legacy?10:state.archived?1:0} / ${legacy?10:1} 人</span><span>复测单列，不进入原卷错误率</span></div></div>
 <div class="content-grid"><section class="panel"><div class="section-heading"><h2>逐题情况</h2><span class="pill neutral">${legacy?'60项有效状态':state.archived?'4项有效状态':'尚无确认状态'}</span></div><div class="table-scroll"><table><thead><tr><th>知识与题型</th><th class="numeric">正确</th><th class="numeric">错误</th><th class="numeric">部分</th><th class="numeric">待确认</th><th class="numeric">缺页</th></tr></thead><tbody>${rows.map(r=>`<tr><td>${r[0]}</td>${r.slice(1).map((n,i)=>`<td class="numeric" ${i===1&&n?'style="color:var(--red);font-weight:600"':''}>${n}</td>`).join('')}</tr>`).join('')}</tbody></table></div><p class="table-note">${legacy?'本表为独立十人六题合成卷的最新有效状态：39正确 / 17错误 / 1部分正确 / 3缺页。':'只计入当前图片样例的教师确认结果；审核前全为0，未审核人数单列为1。'}<br>需要计算二元错题率时，分母仅含已确认正确＋错误；部分正确、待确认、缺页另列。</p></section>
 <aside class="panel"><div class="section-heading"><h2>下一课可以关注</h2></div>${topics.length?topics.map(([t,n,d])=>`<div class="class-topic"><div class="topic-line"><strong>${t}</strong><b>${n}人</b></div><div class="bar-track"><span style="width:${legacy?n*10:100}%"></span></div><p>${d}</p></div>`).join(''):'<div class="empty-state" style="padding:32px 18px"><h3>先完成个人审核</h3><p style="margin:10px 0">尚未确认的判断不进入班级统计。</p><button class="button" data-view="review">去审核</button></div>'}<p class="scope-note">${legacy?'这是既有合成班级样例，与当前四题图片练习分开呈现。':'一份作答可以发现个人问题，班级共性需要更多确认样本。'}</p></aside></div>`;
}
function practiceView(){
 if(!state.archived||!['INCORRECT','PARTIAL'].includes(state.confirmed[0]))return heading('针对问题练，而不是一味加量','选择合适的一档，让新作答回来检验原来的困难。')+`<section class="panel"><div class="empty-state"><h2>${state.archived?'本例未确认顶点式补练需求':'先确认需要补齐的问题'}</h2><p>${state.archived?'当前交互样例只演示第1题顶点式的补练。老师将它判为正确后，不应继续安排同一项补练。可重置演示查看完整流程。':'先在整卷审核中确认该生的具体问题，再生成可审核的讲解和练习。'}</p><button class="button primary" data-view="review">返回整卷审核</button></div></section>`;
 const ex=EXERCISES[state.level];
 return heading('让下一题，回应这一次困难','演示学生01 · 原问题：顶点式符号辨识。所选练习先由老师审稿，再用于复测。',`<button class="button" data-action="export">导出所选材料</button>`)+
 `<div class="content-grid"><section class="panel"><div class="practice-goal"><span class="goal-mark">f</span><div><h2>顶点式中的符号辨识</h2><p>依据：当前图片第1题已确认错误 · 具体错因仍待核实</p></div></div><div class="field-label">选择本次训练档次，每次按需要选一档</div><div class="levels">${EXERCISES.map((e,i)=>`<button class="level-button ${state.level===i?'active':''}" data-level="${i}" aria-pressed="${state.level===i}"><strong>${e.name}</strong><span>${e.hint}</span></button>`).join('')}</div><p style="font-size:12px">${ex.why}</p><div class="button-row"><button class="button ${state.generated?'':'primary'}" data-action="generate">${state.generated?'重新查看教师审稿':'生成教师审稿（演示）'}</button>${state.generated?`<span class="pill ${state.exerciseApproved?'correct':'pending'}">${state.exerciseApproved?'仅本题已模拟批准':'内容待老师审核'}</span>`:''}</div>
 ${state.generated?`<div class="worksheet"><div class="worksheet-label">学生作答页　｜　自编样例　｜　${ex.name}</div><h3>${ex.title}</h3><div class="stem">${ex.question}</div><div class="writing-line"></div><div class="writing-line"></div><div class="writing-line"></div></div><details class="teacher-answer"><summary>查看教师答案与核验依据</summary><p><strong>${ex.answer}</strong><br>${ex.method}</p><p>这是固定自编样例，不是本次AI实际生成；题目难度与适用性由老师审阅。</p></details><div class="button-row"><button class="button primary" data-action="approve-practice" ${state.exerciseApproved?'disabled':''}>${state.exerciseApproved?'本题已批准（演示）':'审核并批准本题（演示）'}</button><button class="button" data-action="retest" ${!state.exerciseApproved||state.retest?'disabled':''}>${state.retest?EXERCISES[state.retest.level].name+'复测已记录':'录入复测作答'}</button></div>`:''}
 </section><aside><section class="panel"><h2>从原题，到新证据</h2>${[[true,'确认原问题','原卷仍保留，符号错误已确认。'],[state.generated,'选择讲解与练习','按需要选档，不默认三档全发。'],[state.exerciseApproved,'老师审核具体内容','批准仅针对当前题目和版本。'],[!!state.retest&&state.retest.level===state.level,'独立复测，更新表现','新题答对增加证据，旧错题仍在。']].map(([done,t,d],i)=>`<div class="mini-step"><span class="step-no ${done?'done':''}">${done?'✓':i+1}</span><div><h3>${t}</h3><p>${d}</p></div></div>`).join('')}</section>${state.retest?`<section class="panel" style="margin-top:20px"><span class="pill correct">${EXERCISES[state.retest.level].name} · 已增加一条演示证据</span><p style="font-size:12px;margin-top:12px">本次结果：${LABELS[state.retest.result]}。完成条件：${escapeHtml(state.retest.condition)}。原题记录保留，当前表现继续观察。</p><button class="button full" data-view="profile" style="margin-top:15px">查看学习档案变化</button></section>`:''}<p class="scope-note">费曼式自我解释、示例学习或延迟复测可以按需使用。本原型只演示一次教师可核对的反馈循环；切换档次不迁移批准，也不重置已有复测证据。不作掌握概率判断。</p></aside></div>`;
}
function showModal(title,body,footer){document.querySelector('#modal-content').innerHTML=`<div class="modal-header"><h2 id="modal-title">${title}</h2><button class="icon-button" data-action="close" aria-label="关闭对话框">×</button></div><div class="modal-body">${body}</div><div class="modal-footer">${footer||'<button class="button" data-action="close">关闭</button>'}</div>`;if(!modal.open)modal.showModal();}
function closeModal(){modal.close();}
function archiveModal(){
 if(state.archived)return showModal('本次确认记录',`<p>演示学生01 · 图片四题 · 本页已确认</p><ul class="modal-list">${QUESTIONS.map((q,i)=>`<li><span>第${i+1}题 · ${q.title}</span>${badge(state.confirmed[i])}</li>`).join('')}</ul><p>原作答和未核实错因保留。这里是页面内的演示记录，没有写入磁盘档案。</p>`);
 showModal('确认演示学生01的整卷',`<p>本次范围：图片样例四题、当前核对版本。确认题目结果不会把待核实错因变成确定诊断。</p><ul class="modal-list">${QUESTIONS.map((q,i)=>`<li><span>第${i+1}题 · ${q.title}</span>${badge(state.results[i])}</li>`).join('')}</ul><label class="check-label"><input type="checkbox" id="archive-check"><span>我已核对原图与识别，确认以上结果；保留所有疑点和原作答，不批准学生反馈发布。</span></label><p class="scope-note">本操作仅更新当前页面，刷新后恢复，不代表真实本地归档。</p>`,`<button class="button" data-action="close">返回核对</button><button class="button primary" id="archive-confirm" data-action="archive-confirm" disabled>确认并更新演示档案</button>`);
}
function exportModal(){
 const practice=state.view==='practice'&&state.generated;
 showModal('选择导出材料',`<p>${practice?`当前所选：${EXERCISES[state.level].name}单题 · ${state.exerciseApproved?'已模拟批准的学生作答版':'教师审稿版（待审）'}`:`当前所选：演示学生01的${state.archived?'整卷确认记录':'整卷审核草稿（待审）'}`}</p><div class="format-options"><label class="format-option"><input type="radio" name="export-format" value="Word"><span><strong>可编辑 Word</strong><small>便于老师修改与补充</small></span></label><label class="format-option"><input type="radio" name="export-format" value="PDF"><span><strong>打印 PDF</strong><small>便于排版与打印检查</small></span></label></div><p>原型只演示选择与确认，不生成实际文件。教师审稿与学生作答材料分开。</p>`,`<button class="button" data-action="close">取消</button><button class="button primary" id="export-confirm" data-action="export-confirm" disabled>确认所选格式（演示）</button>`);
}
document.addEventListener('click',event=>{
 const nav=event.target.closest('[data-view]');if(nav){go(nav.dataset.view);return;}
 const qt=event.target.closest('[data-q]');if(qt){state.q=Number(qt.dataset.q);render();return;}
 const level=event.target.closest('[data-level]');if(level){const n=Number(level.dataset.level);if(n!==state.level){state.level=n;state.generated=false;state.exerciseApproved=false;render();}return;}
 const btn=event.target.closest('[data-action]');if(!btn||btn.disabled)return;
 switch(btn.dataset.action){
 case 'close':closeModal();break;
 case 'about':showModal('这份原型能演示什么',`<p>可以查看原图、校正识别、调整判断、确认后查看演示档案，再审阅补练并录入一次复测。</p><div class="divider"></div><p>全部为合成样例，操作只存在本页内存。没有实际模型调用、磁盘归档、真实导出或收费。刷新或“重置演示”会恢复初始状态。</p>`);break;
 case 'import':showModal('整理一份新作业',`<div class="modal-field"><label>作业名称</label><input value="函数与代数巩固 · 合成样例" readonly></div><div class="upload-box"><strong>原卷、参考答案、学生作答分别整理</strong><p>正式流程支持的格式需另行验证。本原型使用已有合成照片，不读取真实文件。</p><button class="button" data-action="load-sample">载入四题合成样例</button></div><p class="scope-note">这是材料导入的交互示意，不执行 OCR。当前试点方向为完整初中数学，不因四道样题缩小知识范围。</p>`);break;
 case 'load-sample':closeModal();go('review');toast('已显示四题合成样例，没有处理新文件');break;
 case 'zoom-in':state.zoom=Math.min(1.8,Math.round((state.zoom+.2)*10)/10);render();break;
 case 'zoom-out':state.zoom=Math.max(.8,Math.round((state.zoom-.2)*10)/10);render();break;
 case 'image':showModal('合成作答原图',`<img class="full-image" src="assets/synthetic-homework.png" alt="合成数学作业完整原图">`);break;
 case 'correct-text':showModal('校正识别，保留原笔迹',`<p>第${state.q+1}题。只修改识别文本；原图片不变，修改不代表已确认题目对错。</p><div class="modal-field" style="margin-top:16px"><label for="ocr-text">与原图核对后的文本</label><textarea id="ocr-text">${escapeHtml(state.texts[state.q])}</textarea></div>`,`<button class="button" data-action="close">取消</button><button class="button primary" data-action="save-text">保存识别修正（演示）</button>`);break;
 case 'save-text':{const value=document.querySelector('#ocr-text').value.trim();if(!value)return toast('请填写核对后的原作答');state.texts[state.q]=value;closeModal();render();toast('识别文本已在本页更新，题目结果仍需单独核对');break;}
 case 'archive':archiveModal();break;
 case 'archive-confirm':if(!state.archived&&document.querySelector('#archive-check')?.checked){state.archived=true;state.confirmed=[...state.results];closeModal();render();toast('整卷已在本页确认，演示档案已更新；尚未发布反馈');}break;
 case 'generate':state.generated=true;render();toast('固定自编样例已展开，请老师审阅题目和答案');break;
 case 'approve-practice':showModal('只批准当前选中的一题',`<p>演示学生01 · ${EXERCISES[state.level].name} · 当前单题版本</p><div class="stem" style="margin-top:15px">${EXERCISES[state.level].question}</div><label class="check-label"><input type="checkbox" id="practice-check"><span>已核对题目、答案和适用难度，只批准当前这一题用于合成复测，不扩大到其他档次。</span></label><p class="scope-note">仅模拟审批，不向真实学生发送。</p>`,`<button class="button" data-action="close">返回审稿</button><button class="button primary" id="practice-confirm" data-action="practice-confirm" disabled>批准本题（演示）</button>`);break;
 case 'practice-confirm':if(document.querySelector('#practice-check')?.checked){state.exerciseApproved=true;closeModal();render();toast('仅当前单题已模拟批准，可录入复测结果');}break;
 case 'retest':showModal('录入一次复测作答',`<p>本次新题与原卷分开记录，不改变原卷统计。教师确认后增加一条演示证据。</p><div class="button-row" style="margin-bottom:15px"><button class="button small" data-action="fill-retest">载入虚构复测作答</button></div><div class="modal-field"><label for="retest-answer">学生的新作答</label><textarea id="retest-answer" placeholder="填写本次独立作答，不填原题订正"></textarea></div><div class="modal-field"><label for="retest-condition">完成条件</label><select id="retest-condition"><option>未知</option><option>独立完成，无提示</option><option>带提示完成</option><option>看过答案后订正</option></select></div><div class="modal-field"><label for="retest-result">老师确认的本次结果</label><select id="retest-result">${['PENDING','CORRECT','INCORRECT','PARTIAL'].map(k=>`<option value="${k}">${LABELS[k]}</option>`).join('')}</select></div>`,`<button class="button" data-action="close">取消</button><button class="button primary" data-action="save-retest">确认本次结果（演示）</button>`);break;
 case 'fill-retest':document.querySelector('#retest-answer').value=EXERCISES[state.level].answer;document.querySelector('#retest-condition').value='独立完成，无提示';document.querySelector('#retest-result').value='CORRECT';toast('已载入明确标注的虚构作答，供模拟复核');break;
 case 'save-retest':{const answer=document.querySelector('#retest-answer').value.trim();if(!answer)return toast('请先填写或载入虚构复测作答');if(state.retest)return toast('本页已记录该次复测，不重复新增');state.retest={answer,condition:document.querySelector('#retest-condition').value,result:document.querySelector('#retest-result').value,level:state.level};closeModal();render();toast('复测证据已在本页追加；原错题保留，未自动判定掌握');break;}
 case 'export':exportModal();break;
 case 'export-confirm':{const selected=document.querySelector('[name="export-format"]:checked');if(selected){const format=selected.value;closeModal();toast(`已选择 ${format}（演示），未生成实际文件`);}break;}
 case 'reset':state=initialState();closeModal();go('review');toast('本页演示已重置，未修改任何 WorkBuddy 运行记录');break;
 }
});
document.addEventListener('change',event=>{
 if(event.target.id==='result-select'&&!state.archived){state.results[state.q]=event.target.value;render();}
 if(event.target.id==='class-batch'){state.classBatch=event.target.value;render();}
 if(event.target.id==='archive-check')document.querySelector('#archive-confirm').disabled=!event.target.checked;
 if(event.target.id==='practice-check')document.querySelector('#practice-confirm').disabled=!event.target.checked;
 if(event.target.name==='export-format')document.querySelector('#export-confirm').disabled=false;
});
modal.addEventListener('click',event=>{if(event.target===modal){const r=modal.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)closeModal();}});
render();
