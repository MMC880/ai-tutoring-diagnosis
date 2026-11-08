/* THROWAWAY UI PROTOTYPE. Three layouts on #profile/#intake/#class, switched by
   ?variant=A/B/C. Only fabricated in-memory fixtures. No API, OCR or storage. */
'use strict';
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const icons={profile:'<rect x="4" y="4" width="16" height="17" rx="2"/><circle cx="12" cy="10" r="2"/><path d="M8 17c0-4 8-4 8 0"/>',intake:'<path d="M8 4H5v17h14V4h-3"/><rect x="8" y="2" width="8" height="5" rx="1"/><path d="m8 13 2 2 5-5M8 18h7"/>',class:'<path d="M4 20h17M7 17v-6m5 6V5m5 12V8"/>',settings:'<circle cx="12" cy="12" r="4"/><path d="M12 2v3m0 14v3M2 12h3m14 0h3M5 5l2 2m10 10 2 2M5 19l2-2M17 7l2-2"/>',arrow:'<path d="m9 5 7 7-7 7"/>'};
const icon = name => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name]||icons.arrow}</svg>`;
const navs=[['profile','学生档案'],['intake','登记作业'],['class','班级学情']];
const variants={A:['先找学生','学生与档案并排'],B:['先办作业','当天任务放在手边'],C:['先看问题','知识与证据展开']};
const students=Array.from({length:10},(_,i)=>({id:`DEMO-${String(i+1).padStart(2,'0')}`,name:`学生${String(i+1).padStart(2,'0')}`}));
const knowledge={
 fraction:{name:'分式的取值限制',stem:'化简 (x² − 1) / (x − 1)，并写出 x 的取值限制。',key:'x + 1，且 x ≠ 1。'},
 linear:{name:'一次函数图象与截距',stem:'画出 y = 2x − 1 的图象，写出它与 y 轴的交点坐标。',key:'过 (0, −1)、(1, 1) 的直线；与 y 轴交点为 (0, −1)。'},
 equation:{name:'方程解集的完整性',stem:'解方程 (x − 1)(x + 2) = 0。',key:'x = 1 或 x = −2。'},
};
const labels={INCORRECT:'错误',PARTIAL:'部分正确',CORRECT:'正确',PENDING:'待核对',MISSING:'缺材料'};
const isIssue=r=>['INCORRECT','PARTIAL'].includes(r.result);
const make=(n,k,date,result,q,answer,extra={})=>({student:students[n-1].id,k,date,result,q,answer,source:`11月${Number(date.slice(-2))}日数学作业`,confirmed:!['PENDING','MISSING'].includes(result),condition:'课堂作业，提示情况未记录',...extra});
// These dates, answers and confirmations are invented fixtures, not real records.
const records=[
 make(1,'fraction','2026-11-05','PARTIAL','Q03','x + 1'),
 make(1,'fraction','2026-11-06','PARTIAL','Q02','x + 1'),
 make(1,'fraction','2026-11-07','CORRECT','复查01','x + 3，x ≠ 3',{source:'分式同型复查',condition:'无提示独立完成（虚构示例）',stem:'化简 (x² − 9)/(x − 3)，并写出取值限制。',key:'x + 3，x ≠ 3。'}),
 make(1,'linear','2026-11-07','INCORRECT','Q07','与 y 轴交点是 (0, 1)'),
 make(1,'equation','2026-11-07','CORRECT','Q11','x = 1 或 x = −2'),
 make(2,'fraction','2026-11-07','PARTIAL','Q02','x + 1'),
 make(2,'linear','2026-11-07','CORRECT','Q07','与 y 轴交点是 (0, −1)'),
 make(3,'equation','2026-11-05','INCORRECT','Q11','x = 1'),
 make(3,'equation','2026-11-07','INCORRECT','Q11','x = 1'),
 make(3,'fraction','2026-11-07','CORRECT','Q02','x + 1，x ≠ 1'),
 make(4,'linear','2026-11-07','MISSING','Q07','未收到对应页'),
 make(5,'fraction','2026-11-06','PARTIAL','Q02','x + 1'),
 make(5,'fraction','2026-11-07','PARTIAL','Q02','x + 1'),
 make(5,'equation','2026-11-07','INCORRECT','Q11','x = 1'),
 make(6,'linear','2026-11-07','INCORRECT','Q07','与 y 轴交点是 (0, 1)'),
 make(6,'equation','2026-11-07','CORRECT','Q11','x = 1 或 x = −2'),
 make(7,'fraction','2026-11-07','PENDING','Q02','限制符号无法区分'),
 make(8,'fraction','2026-11-07','PARTIAL','Q02','x + 1'),
 make(8,'linear','2026-11-07','INCORRECT','Q07','与 y 轴交点是 (0, 1)'),
 make(9,'fraction','2026-11-07','CORRECT','Q02','x + 1，x ≠ 1'),
 make(9,'equation','2026-11-07','CORRECT','Q11','x = 1 或 x = −2'),
];
const defaults={Q02:'PARTIAL',Q07:'INCORRECT',Q11:'CORRECT'};
const requested=new URLSearchParams(location.search).get('variant');
const state={variant:Object.hasOwn(variants,requested)?requested:'A',view:navs.some(([v])=>v===location.hash.slice(1))?location.hash.slice(1):'profile',student:students[0].id,query:'',scope:'latest',topic:'fraction',drafts:{},saved:{},plans:{},level:'A'};
const current=()=>students.find(s=>s.id===state.student);
const rowsFor=id=>records.filter(r=>r.student===id);
const groupsFor=id=>Object.entries(knowledge).map(([k,v])=>{const list=rowsFor(id).filter(r=>r.k===k&&r.confirmed);return {k,...v,list,issues:list.filter(isIssue),latest:list.at(-1)};}).filter(g=>g.issues.length);
const tag=(label,tone='neutral')=>`<span class="badge ${tone}">${esc(label)}</span>`;
const resultTag=r=>tag(labels[r],['INCORRECT','PARTIAL'].includes(r)?'amber':r==='CORRECT'?'green':'neutral');
const btn=(action,label,attrs='',cls='')=>`<button type="button" data-action="${action}" ${attrs} class="${cls}">${label}</button>`;
const brand=()=>`<a class="brand" href="#profile" aria-label="晋学智辅学生档案"><span class="brand-mark">晋</span><span>晋学智辅<small>初中数学 · 教师工作台</small></span></a>`;
const navigation=()=>`<nav aria-label="主导航">${navs.map(([v,label])=>`<a href="#${v}" class="nav-item ${state.view===v?'active':''}" ${state.view===v?'aria-current="page"':''}>${icon(v)}<span>${label}</span></a>`).join('')}</nav>`;
const picker=()=>`<label class="student-picker">当前学生<select id="student-select">${students.map(s=>`<option value="${s.id}" ${s.id===state.student?'selected':''}>${s.name}</option>`).join('')}</select></label>`;

function roster(){
 const visible=students.filter(s=>s.name.includes(state.query)||s.id.toLowerCase().includes(state.query.toLowerCase()));
 return `<aside class="roster"><div class="roster-heading"><h2>中考数学班</h2><span>10人</span></div><label class="search-label"><span class="sr-only">搜索学生</span><input id="student-search" type="search" placeholder="搜索学生" value="${esc(state.query)}" autocomplete="off"></label><div class="student-list">${visible.map(s=>{
  const n=groupsFor(s.id).length,pending=rowsFor(s.id).some(r=>!r.confirmed);
  return btn('student',`<span class="avatar">${s.name.slice(-2)}</span><span><strong>${s.name}</strong><small>${pending?'有材料待核对':n?`${n}项知识问题待跟进`:rowsFor(s.id).length?'已有学习记录':'尚未登记作业'}</small></span>${s.id===state.student?'<span class="selected-dot"></span>':''}`,`data-id="${s.id}" aria-pressed="${s.id===state.student}"`,'student-row '+(s.id===state.student?'selected':''));
 }).join('')||'<p class="empty">未找到学生，试试“学生01”。</p>'}</div><p class="roster-foot">每名学生单独保留历史记录</p></aside>`;
}
function taskList(){return `<section class="today-list"><h2>接下来做什么</h2><p class="subtle">中考数学班 · 示例任务</p>${btn('intake',`<strong>登记已批改的作业</strong><small>按题号登记，或照片辅助找题</small>${icon('arrow')}`,'','task-row')}${btn('profile','<strong>查看学生的重复问题</strong><small>先看历史，再决定复习什么</small>'+icon('arrow'),'','task-row')}${btn('class','<strong>准备一次集中讲解</strong><small>从本次作业的共性问题开始</small>'+icon('arrow'),'','task-row')}</section>`;}
function shellA(){return `<div class="app-shell layout-a"><header class="topbar">${brand()}${navigation()}${btn('settings',icon('settings')+'设置','','quiet settings-button')}</header><div class="a-body">${roster()}<main id="main" tabindex="-1">${content()}</main></div></div>`;}
function shellB(){return `<div class="app-shell layout-b"><header class="desk-header">${brand()}<div class="desk-context">中考数学班 <span>本地教师工作台</span></div>${btn('settings',icon('settings')+'设置','','quiet settings-button')}</header><div class="desk-toolbar">${navigation()}${picker()}</div><div class="b-body"><main id="main" tabindex="-1">${state.view==='profile'?profileB():content()}</main><aside class="desk-aside">${taskList()}<div class="notepad"><strong>本轮关注</strong><p>先登记老师已批改的结果。<br>让每次复查都能找到原来的问题。</p></div></aside></div></div>`;}
function shellC(){return `<div class="app-shell layout-c"><aside class="side-nav">${brand()}<p class="class-name">中考数学班 / 10人</p>${navigation()}${btn('settings',icon('settings')+'设置','','quiet settings-button')}<small class="local-foot">数学学习记录<br>保存在本机</small></aside><div class="c-body"><header class="context-bar"><span>${state.view==='class'?'从共性问题找到需要帮助的学生':'关注问题，追溯每次作答'}</span>${picker()}</header><main id="main" tabindex="-1">${state.view==='profile'?profileC():content()}</main></div></div>`;}
const heading=()=>`<div class="page-heading"><div><p class="crumb">中考数学班 / 学生档案</p><h1>${current().name}<span class="heading-suffix">的数学学习档案</span></h1><p class="subtle">原来的问题留下来，新的表现接着记。</p></div><div class="heading-actions">${btn('intake','登记问题','','primary')}${btn('practice','安排复查')}</div></div>`;
function problemRows(){
 const groups=groupsFor(state.student);
 return groups.length?groups.map(g=>`<article class="problem-row"><div class="problem-main"><h3>${g.name}</h3><p>${g.latest.result==='CORRECT'?'最近一次同型复查答对，继续观察。':`最近一次${labels[g.latest.result]}，建议查看原题后复习。`}</p><div class="row-meta">${tag(g.issues.length>1?`不同作答中出现${g.issues.length}次`:'本次记录到1次问题',g.issues.length>1?'amber':'neutral')}${g.latest.result==='CORRECT'?tag('有改善证据','green'):tag('待复查')}</div></div><div class="row-actions">${btn('evidence','看原题与记录',`data-k="${g.k}"`,'text-button')}${btn('practice','安排复查',`data-k="${g.k}"`,'small-button')}</div></article>`).join(''):`<div class="empty-state"><h3>${rowsFor(state.student).length?'还没有足够的已确认问题记录':'先登记一份作业'}</h3><p>未登记、缺材料和待核对，都不能当成已经掌握。</p>${btn('intake','登记作业','','primary')}</div>`;
}
function historyList(){
 const rows=rowsFor(state.student).slice().reverse(),saved=state.saved[state.student];
 return `<section class="history-section"><div class="section-heading"><h2>历次作业与复查</h2><span class="subtle">历史保留，按发生时间查看</span></div>${saved?`<div class="draft-strip">${tag(saved.confirmed?'本页模拟确认':'待老师确认',saved.confirmed?'green':'amber')}<span>11月8日作业 · ${saved.rows.length}项登记 · 仅本页演示</span>${btn('intake','查看','','text-button')}</div>`:''}${rows.length?`<div class="record-list">${rows.map(r=>`<div class="record-row"><time>${r.date.slice(5).replace('-','月')}日</time><div><strong>${r.source}</strong><small>${r.q} · ${knowledge[r.k].name}${r.result==='MISSING'?' · 缺材料不计为错误':''}</small></div>${resultTag(r.result)}${btn('record','查看',`data-index="${records.indexOf(r)}"`,'text-button')}</div>`).join('')}</div>`:'<p class="empty">这里将保留老师确认的作业、补习和复查记录。</p>'}</section>`;
}
const planStrip=()=>state.plans[state.student]?`<p class="plan-strip">已在本页模拟安排：${esc(state.plans[state.student])}。尚无实际复查结果。</p>`:'';
function profileA(){return `${heading()}<section class="focus-section"><div class="section-heading"><h2>需要关注的知识问题</h2><span class="subtle">以老师确认的记录为依据</span></div>${problemRows()}</section>${planStrip()}${historyList()}`;}
function profileB(){return `${heading()}<div class="desk-summary"><div><span class="desk-index">${current().name.slice(-2)}</span><div><strong>先处理这名学生的作业</strong><p>登记问题，再回来看后续变化。</p></div></div>${btn('intake','登记11月8日作业','','primary')}</div><section class="desk-focus"><div class="section-heading"><h2>跟进中的知识问题</h2><span class="subtle">${groupsFor(state.student).length}项</span></div>${problemRows()}</section>${planStrip()}${historyList()}`;}
function profileC(){
 const groups=groupsFor(state.student),active=groups.find(g=>g.k===state.topic)||groups[0];
 return `${heading()}<div class="knowledge-layout"><section class="knowledge-index"><h2>这名学生的问题</h2>${groups.map(g=>btn('topic',`<strong>${g.name}</strong><small>${g.issues.length>1?'跨次重复线索':'单次问题'} · ${g.issues.length}次</small>`,`data-k="${g.k}"`,'knowledge-choice '+(active?.k===g.k?'selected':''))).join('')||'<p class="empty">暂没有已确认的问题</p>'}</section><section class="knowledge-detail">${active?`<div class="section-heading"><h2>${active.name}</h2>${tag('依据可追溯','green')}</div><p class="finding">${active.latest.result==='CORRECT'?'历史问题仍保留；最近一次同型题答对。':'从具体作答入手，先确认错误发生在哪一步。'}</p><div class="evidence-path">${active.list.map(r=>`<div><time>${r.date.slice(5)}</time>${resultTag(r.result)}<p>${esc(r.answer)}</p><small>${r.source} ${r.q}</small></div>`).join('')}</div><div class="advice"><strong>下一步建议</strong><p>${active.k==='fraction'?'复习“先看原分母，再化简”。用一道新题观察是否主动写出限制。':'对照原题复讲一个关键步骤，再用同型新题观察。'}</p>${btn('evidence','看原题与记录',`data-k="${active.k}"`)} ${btn('practice','安排复查',`data-k="${active.k}"`,'primary')}</div>`:'<div class="empty-state"><h3>从一份作业开始积累</h3><p>没有记录不代表已掌握。</p>'+btn('intake','登记作业','','primary')+'</div>'}</section></div>${planStrip()}<details class="history-disclosure"><summary>查看全部历次作业与复查</summary>${historyList()}</details>`;
}
function intake(){
 const draft=state.drafts[state.student]||defaults,saved=state.saved[state.student];
 return `<div class="page-heading"><div><p class="crumb">登记作业 / ${current().name}</p><h1>把老师批改的结果记下来</h1><p class="subtle">原题同卷共用，每名学生的结果分别记录。</p></div>${btn('profile','回学生档案','','quiet')}</div><section class="intake-sheet"><div class="intake-context"><label>原卷 / 作业<select aria-label="原卷或作业"><option>11月8日数学作业（虚构示例）</option></select></label><div><span class="field-label">登记范围</span>${tag('仅登记问题及选定题目')}<small>未登记题目不自动判对。</small></div>${state.variant==='A'?picker():''}</div><div class="input-method"><div><strong>按题号登记</strong><p>已经批改过，直接选择结果就可以。</p></div>${btn('photo','照片辅助找题','','quiet')}</div><div class="table-wrap"><table><thead><tr><th scope="col">题号与原题</th><th scope="col">老师批改结果</th><th scope="col">主要知识点</th></tr></thead><tbody>${[['Q02','fraction'],['Q07','linear'],['Q11','equation']].map(([q,k])=>`<tr><td><strong>${q}</strong>${btn('original','看原题',`data-k="${k}"`,'text-button')}</td><td><label class="sr-only" for="result-${q}">${q}老师批改结果</label><select id="result-${q}" data-result="${q}">${Object.entries(labels).map(([key,name])=>`<option value="${key}" ${draft[q]===key?'selected':''}>${name}</option>`).join('')}</select></td><td>${knowledge[k].name}<small>示例原题已关联，可核对</small></td></tr>`).join('')}</tbody></table></div><label class="feedback-label">老师补充反馈（选填）<textarea id="teacher-feedback" rows="2" placeholder="例如：学生能口述分母限制，下次观察是否主动写出。">${esc(state.drafts[state.student]?.note||'')}</textarea></label><div class="sheet-footer"><p>${saved?(saved.confirmed?'本页已模拟确认，原有历史仍保留。':'已暂存示例草稿，尚未确认。'):'先暂存，再核对；不自动写成已确认的学情。'}</p><div>${btn('save','暂存示例草稿')}${btn('confirm','核对并模拟确认','','primary')}</div></div></section><p class="boundary-note">照片看不清时保留“待核对”。这里演示登记方式，不进行真实识图、批改或归档。</p>`;
}
function classStats(){
 const source=records.filter(r=>r.confirmed&&(state.scope==='recent'||(r.date==='2026-11-07'&&r.source!=='分式同型复查')));
 return Object.entries(knowledge).map(([k,v])=>{const rows=source.filter(r=>r.k===k),ids=[...new Set(rows.filter(isIssue).map(r=>r.student))];return {k,...v,rows,ids,coverage:new Set(rows.map(r=>r.student)).size};}).sort((a,b)=>b.ids.length-a.ids.length);
}
function classPage(){
 const stats=classStats(),covered=new Set(stats.flatMap(g=>g.rows.map(r=>r.student))).size;
 return `<div class="page-heading"><div><p class="crumb">班级学情 / 中考数学班</p><h1>下一次集中讲什么</h1><p class="subtle">先看共同问题，再找到对应学生和原题。</p></div><label class="scope-picker">观察范围<select id="class-scope"><option value="latest" ${state.scope==='latest'?'selected':''}>11月7日作业</option><option value="recent" ${state.scope==='recent'?'selected':''}>11月5日至7日记录</option></select></label></div><div class="coverage-strip"><strong>班级10人</strong><span>本范围有${covered}人的已确认记录</span><span>待核对、缺材料另列；未记录不算正确</span></div><section class="class-report"><div class="section-heading"><h2>共性知识问题</h2><span class="subtle">按有问题的学生人数排序</span></div>${stats.map((g,i)=>`<article class="class-problem"><span class="problem-order">${i+1}</span><div><h3>${g.name}</h3><p><strong>${g.ids.length}人有问题</strong><span class="subtle"> / ${g.coverage}人有该知识的有效记录</span></p><div class="student-chips">${g.ids.map(id=>btn('class-student',students.find(s=>s.id===id).name,`data-id="${id}" data-k="${g.k}"`,'student-chip')).join('')}</div></div>${btn('class-evidence','看依据',`data-k="${g.k}"`,'text-button')}</article>`).join('')}</section><div class="class-note"><strong>给老师的复习建议</strong><p>可先集中复习分式的原分母限制，再逐人安排同型题复查。建议只来自当前示例记录，是否采用由老师决定。</p>${btn('class-evidence','查看建议的依据','data-k="fraction"','text-button')}</div><p class="boundary-note">这里只比较已登记的知识问题人数，不据此计算全班正确率，也不把一次错误判成长期薄弱。</p>`;
}
function content(){return state.view==='profile'?profileA():state.view==='intake'?intake():classPage();}
function inspector(){return `<details class="prototype-state"><summary>原型状态</summary><div>方案 ${state.variant} · ${navs.find(([v])=>v===state.view)[1]} · ${current().name}<br>范围：${state.scope==='latest'?'11月7日作业':'11月5日至7日记录'} · 知识：${knowledge[state.topic].name}<br>示例草稿 ${Object.keys(state.saved).length}份 · 模拟复查 ${Object.keys(state.plans).length}份 · 全部仅在内存中</div></details>`;}
function render(){
 document.body.dataset.variant=state.variant;
 $('#app').innerHTML=({A:shellA,B:shellB,C:shellC})[state.variant]();
 $('#variant-switcher').innerHTML=`${btn('previous','←','aria-label="上一个方案"','switch-arrow')}<div class="variant-tabs">${Object.entries(variants).map(([key,[name]])=>btn('variant',`${key} ${name}${key==='A'?'<span>推荐</span>':''}`,`data-variant="${key}" aria-pressed="${key===state.variant}"`,key===state.variant?'selected':'')).join('')}</div>${btn('next','→','aria-label="下一个方案"','switch-arrow')}${inspector()}`;
 document.title=`方案${state.variant} · ${variants[state.variant][0]} · 晋学智辅原型`;
}
function notify(s){$('#notice').textContent=s;$('#notice').classList.add('visible');clearTimeout(notify.timer);notify.timer=setTimeout(()=>$('#notice').classList.remove('visible'),4000);}
function navigate(v){if(state.view===v){render();return;}location.hash=v;}
function changeVariant(v){state.variant=v;const url=new URL(location.href);url.searchParams.set('variant',v);history.replaceState(null,'',url);render();}
function cycle(d){const keys=Object.keys(variants);changeVariant(keys[(keys.indexOf(state.variant)+d+keys.length)%keys.length]);}
function openDialog(title,body){$('#dialog').innerHTML=`<div class="dialog-heading"><h2 id="dialog-title">${title}</h2>${btn('close','×','aria-label="关闭"','close-button')}</div>${body}`;$('#dialog').showModal();}
function evidence(k=state.topic){
 const rows=rowsFor(state.student).filter(r=>r.k===k);
 openDialog(`${current().name} · ${knowledge[k].name}`,`<p class="dialog-hint">虚构示例 · 老师确认的结果与待核对材料分别呈现</p><div class="paper-sample"><small>共用原题示例</small><p>${knowledge[k].stem}</p></div>${rows.map(r=>`<div class="evidence-record"><div>${r.date} · ${r.source} ${r.q} ${resultTag(r.result)}</div><p>作答：${esc(r.answer)}</p><small>${esc(r.condition)}</small><small>${r.confirmed?'教师确认：虚构示例，不是真实签名':'尚未确认，不形成错误结论'}</small>${r.key?`<small>本次复查题：${esc(r.stem)}；参考：${esc(r.key)}</small>`:''}</div>`).join('')||'<p class="empty">本学生尚无该知识的作答证据。</p>'}<p class="dialog-hint">错误原因仍需结合学生解释核实。一次做对只增加改善证据。</p>`);
}
function practice(k){
 const g=groupsFor(state.student).find(g=>g.k===k)||groupsFor(state.student)[0];
 if(!g){notify('先登记并核对具体知识问题，再安排复查。');return;}state.topic=g.k;
 if(g.k!=='fraction'){openDialog(`${current().name} · 安排复查`,`<p>当前关注：${g.name}</p><p class="dialog-hint">本轮仅演示分式知识的三档候选。其他知识保留老师自备练习的位置，不自动生成题目。</p>${btn('close','返回')}`);return;}
 const candidates=[['A','基础巩固','化简 (x² − 9)/(x − 3)，并写出取值限制。','x + 3，x ≠ 3。先由 x − 3 ≠ 0 得 x ≠ 3，再分解分子约分。'],['B','综合运用','解方程 (x² − 4)/(x − 2) = 5，并检查解是否符合原式要求。','原式要求 x ≠ 2；约分得 x + 2 = 5，解得 x = 3。3 ≠ 2，故解为 x = 3。'],['C','迁移挑战','化简 (x² − a²)/(x − a)，说明为什么不能把 x = a 代入原分式。','原式要求 x ≠ a。在此条件下化简为 x + a；x = a 使原分母为0，原分式无意义。']];
 openDialog(`${current().name} · 分式知识复查`,`<p class="dialog-hint">预先编写的三档示例，非本轮AI生成。一次选择一档，先由老师审核。</p><p class="source-note">依据：该学生${g.issues.length}次已确认的分式问题记录；${g.latest.result==='CORRECT'?'最近一次同型复查答对，继续观察。':'仍需核对后续表现。'}</p><div class="level-candidates">${candidates.map(([l,name,stem,key])=>`<label class="level-choice"><input type="radio" name="level" value="${l}" ${state.level===l?'checked':''}><span><strong>${l}档 · ${name}</strong><p>${stem}</p><details><summary>教师查看参考解答</summary><p>${key}</p></details></span></label>`).join('')}</div><div class="dialog-footer">${btn('plan','模拟安排一题','','primary')}</div>`);
}
function saveDraft(){state.saved[state.student]={confirmed:false,rows:Object.entries(state.drafts[state.student]||defaults).filter(([q])=>q.startsWith('Q')),note:state.drafts[state.student]?.note||''};}
function markEdited(){
 if(state.saved[state.student])state.saved[state.student].confirmed=false;
 const hint=$('.sheet-footer p');if(hint)hint.textContent='已修改，尚未重新暂存或核对。';
}
document.addEventListener('click',e=>{
 const button=e.target.closest('[data-action]');if(!button)return;const {action,id,k,variant,index}=button.dataset;
 if(action==='student'){state.student=id;render();}
 if(['profile','intake','class'].includes(action))navigate(action);
 if(action==='variant')changeVariant(variant);
 if(action==='previous')cycle(-1);
 if(action==='next')cycle(1);
 if(action==='close')$('#dialog').close();
 if(action==='topic'){state.topic=k;render();}
 if(action==='evidence')evidence(k);
 if(action==='original')openDialog('共用原题 · 虚构示例',`<div class="paper-sample"><p>${knowledge[k].stem}</p></div><details class="answer-key"><summary>教师查看候选参考答案</summary><p>${knowledge[k].key}</p></details><p class="dialog-hint">不同学生引用同一原题，各自作答与历史分别保留。</p>`);
 if(action==='record'){const r=records[Number(index)];state.topic=r.k;evidence(r.k);}
 if(action==='practice')practice(k||state.topic);
 if(action==='class-student'){state.student=id;state.topic=k;navigate('profile');}
 if(action==='class-evidence'){
  const g=classStats().find(g=>g.k===k);
  openDialog(`${g.name} · 班级依据`,`<p class="dialog-hint">范围：${state.scope==='latest'?'11月7日作业':'11月5日至7日记录'}；问题人数按学生去重。</p>${g.rows.filter(isIssue).map(r=>`<div class="evidence-record"><strong>${students.find(s=>s.id===r.student).name}</strong> · ${r.date} ${r.q} ${resultTag(r.result)}<p>${esc(r.answer)}</p></div>`).join('')}<p class="dialog-hint">${g.ids.length}名学生有问题，${g.coverage}名有有效记录；不据此断言其他学生已掌握。</p>`);
 }
 if(action==='save'){saveDraft();render();notify('示例草稿已在本页暂存，尚未确认；刷新后重置。');}
 if(action==='confirm'){
  saveDraft();openDialog('核对这名学生的登记结果',`<p><strong>${current().name}</strong> / 11月8日数学作业</p><p class="dialog-hint">范围：仅登记问题及选定题目。未登记题目不自动判对。</p>${state.saved[state.student].rows.map(([q,r])=>`<div class="confirmation-row"><strong>${q}</strong>${resultTag(r)}</div>`).join('')}<p class="dialog-hint">只模拟老师确认，不写真实档案，不改变预设历史或班级统计。</p><div class="dialog-footer">${btn('close','返回修改')}${btn('approve','确认这些示例结果','','primary')}</div>`);
 }
 if(action==='approve'){state.saved[state.student].confirmed=true;$('#dialog').close();render();notify('本页已模拟确认，真实学生档案未写入。');}
 if(action==='plan'){state.plans[state.student]=`${knowledge[state.topic].name} ${state.level}档一题`;$('#dialog').close();render();notify('已模拟安排一题；没有发送，也没有产生复查结果。');}
 if(action==='settings')openDialog('设置','<div class="settings-list"><div><strong>AI服务</strong><p>正式版在这里配置服务、预览发送范围。</p></div><div><strong>本地资料与备份</strong><p>正式版在这里管理资料位置、备份与恢复。</p></div><div><strong>教学参考资料</strong><p>正式版在这里整理知识和教学材料。</p></div></div><p class="dialog-hint">这里只展示设置的位置。原型不读取配置，不提供密钥输入或真实恢复操作。</p>');
 if(action==='photo')openDialog('照片辅助找题 · 示意',`<div class="paper-sample sample-photo"><small>虚构作业位置示意，非真实照片</small><p>Q02 化简 (x² − 1)/(x − 1)，写出限制。</p><p class="handwriting">x + 1</p><span class="red-annotation">缺少原分母限制？</span></div><p class="dialog-hint">正式版保留原图与题号定位，老师核对后登记。此原型不选取文件、不识图、不外发；看不清的结果可标“待核对”。</p>${btn('close','回到登记')}`);
});
document.addEventListener('input',e=>{
 if(e.target.id==='student-search'){state.query=e.target.value;const start=e.target.selectionStart;render();const input=$('#student-search');input.focus();input.setSelectionRange(start,start);}
 if(e.target.id==='teacher-feedback'){state.drafts[state.student]??={...defaults};state.drafts[state.student].note=e.target.value;markEdited();}
});
document.addEventListener('change',e=>{
 if(e.target.id==='student-select'){state.student=e.target.value;render();}
 if(e.target.dataset.result){state.drafts[state.student]??={...defaults};state.drafts[state.student][e.target.dataset.result]=e.target.value;markEdited();}
 if(e.target.id==='class-scope'){state.scope=e.target.value;render();}
 if(e.target.name==='level')state.level=e.target.value;
});
document.addEventListener('keydown',e=>{if(e.target.closest('input,textarea,select,[contenteditable]')||$('#dialog').open)return;if(e.key==='ArrowLeft'){e.preventDefault();cycle(-1);}if(e.key==='ArrowRight'){e.preventDefault();cycle(1);}});
function syncLocation(){
 const v=location.hash.slice(1),variant=new URLSearchParams(location.search).get('variant');
 state.view=navs.some(([x])=>x===v)?v:'profile';state.variant=Object.hasOwn(variants,variant)?variant:'A';
 $('#dialog').close();render();
}
addEventListener('hashchange',syncLocation);
addEventListener('popstate',syncLocation);
render();
