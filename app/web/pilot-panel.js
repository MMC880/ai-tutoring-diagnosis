'use strict';
const pilotPhases={collect:'收件',organize:'整理',review:'核对',recapture:'补拍与纠错',tutor:'辅导与出题',release:'发放与登记'};
const pilotChecks={ownership:'学生归属未串档',recognition:'识读疑点已复核',review:'题目与学生版经老师审核',loop:'真实独立复测链已核实'};
let pilotRuns=[];
const pilotValue=value=>value===null||value===undefined?'未知':String(value);
async function pilotPage(){
 const epoch=renderEpoch,runs=await api('pilot/runs');if(epoch!==renderEpoch||view!=='pilot')return '';
 pilotRuns=runs;
 return `<section class="panel"><h2>10人试点记录</h2><p>以下均为老师自填记录，合成演练与真实试点分开。耗时按人分钟填写，包含采集、核对、补拍、辅导和发放；未知不能填0。比较范围须一致。</p><div class="notice warn">这里只计算自填数据，不自动认定准确率、教学效果或正式验收通过。老师认可的门槛需另行确认。</div><button class="primary" data-action="pilot-new">新建试点记录</button></section>${runs.map(p=>`<section class="panel pilot-record" data-run="${esc(p.id)}"><div class="panel-head"><h2>${esc(p.title)} · V${p.version}</h2><span class="tag">${p.mode==='REAL'?'真实试点（自填）':'合成演练'}</span></div><p>计划${p.planned_students}人，已处理${p.completed_students}人（均为自填，不由档案人数推定）。</p><table><thead><tr><th>环节</th><th>人工基线／人分钟</th><th>软件流程／人分钟</th></tr></thead><tbody>${Object.entries(pilotPhases).map(([k,label])=>`<tr><td>${label}</td><td>${pilotValue(p.baseline[k])}</td><td>${pilotValue(p.assisted[k])}</td></tr>`).join('')}</tbody></table><p>基线总计：${pilotValue(p.summary.baseline_minutes)}；软件总计：${pilotValue(p.summary.assisted_minutes)}；净节省：${pilotValue(p.summary.saving_minutes)}人分钟；比例：${pilotValue(p.summary.saving_percent)}${p.summary.saving_percent===null?'':'%'}。</p><p>自定目标：${pilotValue(p.target_minutes)}人分钟 · ${p.target_confirmed?'已勾选老师确认':'尚未确认'}。${p.summary.reported_threshold_met===null?'未评价目标是否达到':p.summary.reported_threshold_met?'自填耗时达到所填目标，仍待现场复核':'自填耗时尚未达到所填目标'}。</p><p class="notice">正式验收：未评定。部分样本、合成演练、未知耗时或零基线不能推定整班省时达标。</p><ul>${Object.entries(pilotChecks).map(([key,label])=>`<li>${label}：${esc({UNKNOWN:'未知',PASS:'自填通过',FAIL:'自填未通过'}[p.checks[key]])}</li>`).join('')}</ul><pre>${esc(p.notes||'尚未记录证据和问题')}</pre><button data-action="pilot-edit" data-run="${esc(p.id)}">补充或修订本次记录</button></section>`).join('')||'<section class="panel"><p>尚无试点记录，不预填真实结果。</p></section>'}`;
}
function pilotModal(p={}){
 const times=(field,label)=>`<h3>${label}（人分钟，空白为未知）</h3><div class="two">${Object.entries(pilotPhases).map(([key,name])=>`<label class="field"><span>${name}</span><input type="number" min="0" max="1440" step="0.01" data-pilot-time="${field}" data-phase="${key}" value="${esc(p[field]?.[key]??'')}"></label>`).join('')}</div>`;
 modal(`<h2>${p.id?'修订':'新建'}试点记录</h2><fieldset id="pilot-editor" data-run="${esc(p.id||'')}" data-version="${p.version||1}" style="border:0;padding:0;min-width:0"><label class="field"><span>记录名称（不填学生姓名）</span><input id="pilot-title" maxlength="160" value="${esc(p.title||'')}"></label><label class="field"><span>材料类型</span><select id="pilot-mode">${options({SYNTHETIC:'合成演练',REAL:'真实试点（主动选择）'},p.mode||'SYNTHETIC')}</select></label><div class="two"><label class="field"><span>计划人数（自填）</span><input id="pilot-planned" type="number" min="1" max="100" value="${p.planned_students||10}"></label><label class="field"><span>已处理人数（自填）</span><input id="pilot-completed" type="number" min="0" max="100" value="${p.completed_students||0}"></label></div>${times('baseline','原人工方式')}${times('assisted','使用软件后的完整流程')}<label class="field"><span>老师自定净节省目标（人分钟，可留空）</span><input id="pilot-target" type="number" min="0" max="1440" step="0.01" value="${esc(p.target_minutes??'')}"></label><label><input id="pilot-target-confirmed" type="checkbox" ${p.target_confirmed?'checked':''}> 已与老师核对相同工作范围和这项目标</label><h3>实际检查（自填）</h3>${Object.entries(pilotChecks).map(([key,label])=>`<label class="field"><span>${label}</span><select data-pilot-check="${key}">${options({UNKNOWN:'未知／未测',PASS:'自填通过',FAIL:'自填未通过'},p.checks?.[key]||'UNKNOWN')}</select></label>`).join('')}<label class="field"><span>证据、实际范围、阻断问题（最多1500字，不写学生身份或密钥）</span><textarea id="pilot-notes" maxlength="1500">${esc(p.notes||'')}</textarea></label><p>保存只记录老师自填情况，不确认学生成绩，不宣告试点验收。</p><button class="primary" data-action="pilot-save">保存本次记录</button></fieldset><button data-action="close">取消</button>`);
}
async function pilotHandle(action,el){
 if(action==='pilot-new'){pilotModal();return;}
 if(action==='pilot-edit'){const row=pilotRuns.find(p=>p.id===el.dataset.run);if(!row)throw Error('记录已变化，请刷新');pilotModal(row);return;}
 if(action==='pilot-save'){
  const form=$('#pilot-editor'),epoch=renderEpoch;
  const number=selector=>{const value=$(selector).value;return value===''?null:Number(value);};
  const payload={title:$('#pilot-title').value,mode:$('#pilot-mode').value,planned_students:number('#pilot-planned'),completed_students:number('#pilot-completed'),target_minutes:number('#pilot-target'),target_confirmed:$('#pilot-target-confirmed').checked,notes:$('#pilot-notes').value,baseline:{},assisted:{},checks:{}};
  $$('[data-pilot-time]',form).forEach(input=>payload[input.dataset.pilotTime][input.dataset.phase]=input.value===''?null:Number(input.value));
  $$('[data-pilot-check]',form).forEach(input=>payload.checks[input.dataset.pilotCheck]=input.value);
  form.disabled=true;
  try{
   await api('pilot/runs'+(form.dataset.run?'/'+form.dataset.run:''),{...payload,version:Number(form.dataset.version)});
   if(epoch!==renderEpoch||view!=='pilot'||!form.isConnected)return;
   close();await render();toast('试点自填记录已保存；正式验收仍未评定。');
  }finally{if(form.isConnected)form.disabled=false;}
 }
}
document.addEventListener('input',event=>{if(['pilot-target','pilot-planned','pilot-mode'].includes(event.target.id)&&$('#pilot-target-confirmed'))$('#pilot-target-confirmed').checked=false;});
document.addEventListener('change',event=>{if(['pilot-target','pilot-planned','pilot-mode'].includes(event.target.id)&&$('#pilot-target-confirmed'))$('#pilot-target-confirmed').checked=false;});
