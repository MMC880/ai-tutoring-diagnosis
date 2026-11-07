# 老师工作台交互原型交付 v0.1

日期：2026-11-05。用户已授权由我们继续制作可审阅的老师工作台原型。本轮完成一次性本地界面样稿；未进入真实模型、持久化档案、支付或正式部署。

## 打开与交付

- 双击 [prototype/index.html](../../prototype/index.html)。整个目录可移动，不依赖原电脑绝对路径、框架、服务器或网络资源。
- [完整ZIP](../delivery/jinxue-teacher-workbench-prototype-v0.1.zip)，2,531,228字节，含5个文件；解压后打开 teacher-workbench/index.html。
- ZIP SHA-256：`5f523b3120e21a94cc4dae0235e49fa14988a6959ed9c99b5764031928e83a9d`，内容逐文件回读与源目录一致，见 [打包回执](prototype-artifact.json)。
- [页面流程图](WORKBENCH_FLOW.md)、[原型设计说明](TEACHER_WORKBENCH_PROTOTYPE.md)。

## 实际可操作内容

材料导入为固定合成样例的载入示意；整卷审核可切题、校正识别、调整结果并明确确认；确认前档案和补练有前置限制；确认后可查看个人证据和班级表。原卷与复测、四题图片与独立十人六题样例分别显示。

三档练习按需选，生成的是固定自编教师审稿。老师批准当前单题后可录入一次虚构复测；新证据保留原错题，不自动判掌握。Word／PDF提供按需选择与取消，不生成真实文件或假下载。

所有写入和审批只改变页面内存。刷新或重置后恢复，未读取真实作业、写入磁盘学生档案或改变WorkBuddy运行数据。

## 实际验证

使用现有Chrome、独立临时配置和Node内置模块进行本地浏览器检查，完成18项关键抽查：本地原图加载；桌面确认按钮可达；审核前档案／补练前置；明确勾选后整卷确认；确认后时间线；独立班级样例；档次切换不迁移生成状态；练习审批前不能复测；新复测追加且原卷统计不变；导出未选禁用、仅选定格式和取消；390px窄屏无全页横向溢出；未捕获页面JS异常或页面HTTP请求。

这些检查使用页面实际控件和DOM，只针对原型交互，不是教师试用、真实识图、权限或持久化验收。第一次检查15项通过，目视后调整桌面审核区滚动与确认位置，补强复测条件说明；修改后18项通过。没有扩展为应用测试套件。

证据：[浏览器检查](prototype-preview/verification.json)。生成七张截图，已目视查看主要审核页、补练页、窄屏页和复测后的档案页。

- [审核主界面](prototype-preview/01-review-desktop.png)
- [确认后档案](prototype-preview/02-profile-confirmed.png)
- [当前批次班级表](prototype-preview/03-class-current.png)
- [十人独立样例](prototype-preview/04-class-ten-students.png)
- [补练教师审稿](prototype-preview/05-practice-draft.png)
- [复测后历史](prototype-preview/06-profile-after-retest.png)
- [窄屏审核页](prototype-preview/07-review-mobile.png)

## 本轮按需新增的Skill

已使用 find-skills 搜索 frontend-design，来源 [anthropics/skills](https://github.com/anthropics/skills/tree/ca45fc496a3436251f191354091d557da31c15b5/skills/frontend-design)。搜索快照约1.1M安装，原仓库187,320 stars，仅作筛选线索。逐项核对该技能自身 LICENSE.txt 为Apache2.0，不能沿用文档工具专有许可的结论。

安装提交固定为 `ca45fc496a3436251f191354091d557da31c15b5`，通过Codex自带安装器仅安装两份文本到 `C:\Users\42248\.codex\skills\frontend-design`。两份文件Git blob哈希与原仓库一致，许可保留；无依赖、脚本执行、配置覆盖或多渠道重复安装。GitHub连接器读取暂时失败，改用原仓库公开文件及API核对，没有据失败猜内容。

新原生app-server发现该技能唯一启用、加载错误0；本轮已读取并用于原型，下一轮可在新发现列表中使用。不将此独立检查称为本聊天自动触发验证。证据在 ../setup/ 的 frontend-design-source.json、frontend-design-install.txt、frontend-design-codex-discovery.json 和 search-frontend-design.txt。

## 下一步审阅

重点审阅整卷对照、教师修正与确认、问题档案、统计范围和补练复测是否顺手。界面、色彩、布局及演示操作是可修改提案；正式产品技术方案和实现任务在原型确认后细化。
