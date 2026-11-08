'use strict';
// Page IDs remain stable for existing links; grouping only changes the visible shell.
const workspaceGroups={profile:'profile',practice:'profile',queue:'profile',registration:'intake',intake:'intake',review:'intake',class:'class',settings:'settings',ai:'settings',teaching:'settings',backup:'settings',pilot:'settings'};
function workspaceButton(page,label,active=view===page){
 return `<button data-view="${page}" class="${active?'active':''}"${active?' aria-current="page"':''}>${label}</button>`;
}
function workspaceNavigationHTML(){
 const group=workspaceGroups[view];
 return `<div class="app-topbar"><div class="workspace-brand">晋学智辅<small>教师工作台</small></div><nav class="nav main-nav" aria-label="主要功能">${[['profile','学生档案'],['registration','登记作业'],['class','班级学情']].map(([page,label])=>workspaceButton(page,label,group===(page==='registration'?'intake':page))).join('')}</nav><nav class="settings-nav" aria-label="设置入口">${workspaceButton('settings','设置',group==='settings')}</nav></div>`;
}
function workspaceSubnavigationHTML(){
 const group=workspaceGroups[view];let links=[];
 if(group==='profile')links=[['profile','学习档案'],['queue','补练待办（全部学生）'],...(view==='practice'?[['practice','当前作业补练']]:[])];
 if(group==='intake')links=[['registration','选学生和作业'],['intake','批次收件'],...(paper()&&(view!=='registration'||registrationReviewMatchesStudent())?[['review','当前整卷核对']]:[]),...(view==='review'&&paper()?[['practice','这份作业的补练']]:[])];
 if(group==='settings')links=[['settings','设置首页'],['ai','AI 服务'],['teaching','教学资料'],['backup','本地备份'],['pilot','试点记录']];
 if(!links.length)return '';
 return `<nav class="workspace-subnav" aria-label="当前功能的子入口">${links.map(([page,label])=>workspaceButton(page,label)).join('')}</nav>`;
}
function workspaceSettingsPage(){
 const items=[['ai','AI 服务','填写本机接口设置，按需辅助核对。发送材料前仍须逐次预览和授权。'],['teaching','教学资料','整理老师提供的资料，核对后关联到学生的具体问题。'],['backup','本地资料与备份','查看资料位置，创建或恢复备份。恢复仍需明确确认。'],['pilot','试点记录','记录处理时间和工作量，核实软件是否真正省时。']];
 return `<section id="workspace-settings"><p class="form-hint">日常先找学生、登记作业、看班级学情。这里集中管理辅助工具与本机资料。</p><div class="settings-grid">${items.map(([page,title,description])=>`<section class="panel"><h2>${title}</h2><p>${description}</p>${workspaceButton(page,'打开'+title)}</section>`).join('')}</div></section>`;
}
