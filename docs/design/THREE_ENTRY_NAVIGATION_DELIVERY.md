# 第02步交付：三个日常入口与设置

2026-11-08，用户单独批准任务02；基线`0b5133b`，分支`feature/teacher-three-entry`，隔离目录`E:\GPT\jinxue-student-first`。已完成下述合成软件验证，**待用户界面验收**。

## 老师看到的变化

顶部仅保留“学生档案、登记作业、班级学情”三个日常主入口，右侧单列“设置”。默认档案与第01步搜索/选人保留；宽屏名单在左，窄屏在档案前。

|主入口|实际承接的已有页面|
|---|---|
|学生档案|独立学生档案、证据、报告，以及“补练待办（全部学生）”；从已确认问题仍可安排已有补练。正在查看的补练有明确子页。|
|登记作业|已有收件进度、整卷核对；整卷内可以打开这份作业的补练。未简化编辑字段或改变保存/确认。|
|班级学情|原本按当前作业批次统计的共性与证据；尚未实施任务04独立范围选择。|
|设置|AI服务、教学资料、本地资料与备份、试点记录，均保留原页面和授权要求。|

旧hash `#profile/#review/#practice/#queue/#intake/#class/#ai/#teaching/#backup/#pilot`仍可用，并显示所属主入口。新增`#settings`仅为工具目录，不改变学生、原卷、统计批次或练习状态。

导航继续走既有离开确认；新增AI配置输入标记，未保存的地址/模型/密钥/Token/分段接收更改也可取消离开。明确放弃不保存配置、不调用模型。原备份恢复输入“恢复”、AI逐次发送确认仍保留。

## 复用与边界

沿用Python、SQLite和原生HTML/CSS/JavaScript。新增`workspace-navigation.js`集中页面分组/外壳，静态白名单只加入该固定脚本；无新增业务API、数据库/迁移、学生资料或服务商设置变更。

档案所选学生与原全局选卷继续独立。登记/直接旧补练页仍明确显示既有“当前整卷”，不能声称已完成任务03按学生简化登记，或任务05完整整合。跨次班级、共用原题、会员/家长端和EXE都未实施。原项目工作区、原型及真实数据未覆盖。

12份旧浏览器脚本只调整可见父入口操作、项目相对定位及日期场景的显式学生选择，原业务断言保留；`teacher-browser-navigation.mjs`集中辅助导航，不修改应用私有状态或跳过确认。

## 本轮执行证据

|验证|实测结果|入口/证据|
|---|---|---|
|新增导航|30/30|`node docs/design/verify-three-entry-navigation.mjs`；`app/.qa-temp/three-entry-browser/verification.json`|
|第01步档案|19/19|`verify-student-first.mjs`|
|档案历史/报告|14/14、20/20|`verify-student-archive.mjs`、`verify-profile-report.mjs`|
|知识归组/复测跟踪/班级证据|12/12、15/15、19/19|`verify-knowledge-patterns.mjs`、`verify-knowledge-followup.mjs`、`verify-class-knowledge.mjs`|
|补习复测过程|25/25|`verify-learning-journey.mjs`|
|收件/审核/待办|18/18、26/26、22/22|`verify-batch-intake.mjs`、`verify-review-flow.mjs`、`verify-practice-queue.mjs`|
|日期/题目筛选|20/20、21/21|`verify-assignment-date.mjs`、`verify-question-navigation.mjs`|
|既有Node检查|8份均通过|逐份运行`app/tests/check_*.mjs`|
|全部Python测试|409/409|app目录`python tests/run_tests.py`；`app/.qa-temp/three-entry-python.log`，129.897秒|
|页面视觉/键盘|已实际检查|1440×1000、390×844；主要入口可见、整页无横向溢出，设置可达。|

上述浏览器脚本均在`docs/design/`，12套既有场景共231项通过；新导航另计30项。使用独立合成库/假AI，不证明真实识图、批改准确率、老师省时、学习效果或无Python电脑运行能力。

失败与修复保留：

- 初轮新导航0/1，旧十入口确实不满足；实现后基础3/3，再逐项扩充旧链接和状态检查。
- AI配置保护先RED复现27/28（返回设置首页丢输入），最小修复后30/30。RED在`app/.qa-temp/three-entry-browser/red.json`。
- 旧日期脚本原先默认当前卷决定档案，现改为通过名单明确选择学生后执行全部原断言，20/20。
- 一次知识归组浏览器启动等待超时0/0，未进入业务断言且无页面异常；保留`app/.qa-temp/three-entry-patterns-first-failure.json`，不更改等待或断言，单独复跑12/12。具体首次超时原因未证实，不把推测写成已修复应用问题。

### Standards审查

无明确规范违反；1项判断性维护建议：12套脚本重复导航逻辑。已抽取公共辅助函数，复审确认解决，原断言保留。

### Spec审查

无任务02范围或实现阻断项。审查指出既有AI配置输入离开保护不足，本轮按导航保护要求补齐，RED/GREEN及源码复审通过。登记学生上下文和统计范围继续明确留待03/04，未提前扩展。

## 演示与下一步

实际应用演示：<http://127.0.0.1:8767/#profile>。仅重启本会话专用合成预览进程以加载新增静态脚本，不影响8765/8766其他服务。库为`app/.qa-temp/student-first-preview-20261108`；更新前后均3名学生、4份作业、3条确认历史，学生/卷/事件计数摘要SHA-256均为`c3e06059e69d0236729a6f8edc06ff6c91816560c23149d0e74767cb1a889f16`。

最终截图在`app/.qa-temp/three-entry-browser/01-three-entry-desktop.png`、`02-three-entry-mobile.png`、`03-settings-mobile.png`；合成数据，不是生产真实档案。

下一项建议03：让老师在登记入口选择作业，按需展开详细核对，保存待审再明确确认，回档案查看真实写入。**先向用户说明并取得许可；本次停止在02验收，不自动开始03或封装。**
