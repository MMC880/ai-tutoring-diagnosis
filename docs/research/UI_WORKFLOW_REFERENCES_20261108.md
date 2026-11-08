# 教师工作台UI参考研究与本轮取舍

2026年11月8日。用户授权修复[界面测评](../design/UI_EVALUATION_20261108.md)中的四项问题，并先从GitHub学习已有工作流和项目。本轮优先读取原作者仓库，不执行外部安装脚本，不增加前端框架或全局插件。

|参考|本轮实际读取的来源|采用的做法|不采用的部分|
|---|---|---|---|
|Vercel web-design-guidelines|[Skill入口](https://github.com/vercel-labs/agent-skills/blob/main/skills/web-design-guidelines/SKILL.md)、[检查规则](https://github.com/vercel-labs/web-interface-guidelines/blob/main/command.md)|先读代码再检查；保留标签、焦点、未保存保护；检查长文本与窄屏、固定操作条遮挡|不为此改React、安装组件库或机械套用英文标题规则|
|Impeccable|[原作者README](https://github.com/pbakaus/impeccable/blob/main/README.md)|针对已有界面逐块critique→distill→clarify→polish；本项目落实为首屏排序、减少重复、澄清统计、截图复看|不安装CLI、Hook或live模式，不执行其可能启动其他代理或改变审批方式的路径|
|GOV.UK Design System|[表单问题页](https://github.com/alphagov/govuk-design-system/blob/main/src/patterns/question-pages/index.md)、[Details组件](https://github.com/alphagov/govuk-design-system/blob/main/src/components/details/index.md)|只问必要信息，复用已知学生信息；选填项标清；低频说明按需展开|不把主要任务必需的学生身份、待审状态或疑点藏进详情；不把教师重复操作拆成许多问答页|

通过GitHub连接器读取；读取的文件blob SHA分别为：Vercel Skill `ceae92ab319216a68274168fba9b63b998b65997`、规则 `3eb3a212b7b89493922ea418489d4c6f67ae8bd5`；Impeccable README `555fd9a67de957c750950e62bf1baad167f61b00`；GOV.UK问题页 `68e2ee593b911d268673f2f9f7c9c2fb5706c82e`、Details `d97a497ed8c88c191d0def340f2a21db4c4b7c5d`。这是读取文件版本证据，不表示安装了对应工具或验证其全部功能。

`find-skills`已用于发现流程：先查看[skills.sh目录](https://skills.sh/)，再核对官方仓库内容。目录显示已有frontend-design和Vercel检查技能可用；本机已具有frontend-design及审查／测试流程，本轮不需要新增Skill。安装量与星数未作为效果证明，不根据搜索结果直接安装。

## 方案与边界

保留三入口、现有原生网页技术和已确认的档案业务。相比替换后台模板或引入新组件库，本轮局部调整可以保留已有身份守卫、历史追溯和保存／确认接口。用户已授权测评四项修复，不再为既定小范围方案重复请求确认。

1. 档案：从已有知识归组生成关注摘要，显示作业份数、待补齐记录和补练进展。标签线索仍待核对，作业份数不称为独立作答次数。详情和完整历史保留。
2. 核对：减少重复页头与选卷信息，常见1366×768屏幕首屏出现第一道题。身份、日期未知、登记范围未知、待核对和明确确认继续可见。
3. 班级：用本次作业标题和完整中文交代范围、人数与作答计数，继续按现有批次统计；不新增跨次班级累计分析。
4. 新作业：同次作业编号仍由老师明确填写，不自动生成会拆散同次作业的编号；日期、参考答案等选填项可展开，底部按钮保持可达。附件仍支持原有多选，不增加拖拽上传。

不改数据库、判分、归档规则、模型发送权限或真实档案；不打包EXE、不做家长端。先后与验证见[本轮实施计划](../superpowers/plans/2026-11-08-teacher-ui-polish.md)。
