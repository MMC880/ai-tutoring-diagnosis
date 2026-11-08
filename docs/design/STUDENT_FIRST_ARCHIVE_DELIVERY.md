# 第01步交付：先选学生，再看已有档案

2026-11-08。用户单独批准“执行第01步：先选学生，再看档案”。已实现并完成以下合成验证，**待用户界面验收**；未实施任务02—05。

## 实际行为

- 无指定旧页面链接时，默认进入档案。首次不选人，不从当前卷推断学生；刷新后也不持久化学生身份。
- 名单按已有姓名或稳定编号搜索；同名显示各自编号。选人后读取其全部已有作业确认、知识线索、补练和复测。
- 档案页不再出现全库整卷选择器；原卷审核仍保留自己的选卷上下文。从档案原题可回正确来源卷，班级证据下钻显式选择对应学生。
- 无学生引导既有收件；有学生但无确认记录明确待审，不判已掌握。已存草稿不替换确认快照，旧错题和改判历史保持。
- 切换先移除旧档案，显示当前人的读取状态；失败显示当前人及重试。迟到的档案、原题、报告不回填新学生；报告与复测定位沿用独立的档案学生身份。
- 未保存整卷修改仍走原离开确认，取消保留编辑。档案导航只清理证据/报告窗口，不清空未提交收件表单。

## 复用与范围

沿用 `bootstrap.students`、`profiles/<student-id>`、原证据/报告接口及既有历史展示。新增前端档案学生上下文，整卷上下文保持独立；不新增数据库、迁移、后台接口、班级名册或新登记格式。

工作目录 `E:\GPT\jinxue-student-first`，分支 `feature/student-first-archive`，基线 `e98c75d`。保留原项目及独立布局原型；不合并main、不推送、不安装工具或打包。原型代码和虚构记录未合并生产。

六份既有浏览器脚本随入口变化调整选人操作及合成夹具上下文，并改为从脚本位置定位项目，避免在工作树中误测原项目。原业务断言保留；旧版本live检查脚本仍对应旧版页面，未声称它们在新布局可直接执行。

## 本轮实际验证

全部使用独立合成库；浏览器用本机Chrome与公共HTTP接口，不读取真实学生库、不调用真实AI。

|检查|实测结果|命令/证据|
|---|---|---|
|新增学生优先档案|19/19|`node docs/design/verify-student-first.mjs`；`app/.qa-temp/student-first-browser/verification.json`|
|已有档案、去重和历史|14/14|`node docs/design/verify-student-archive.mjs`|
|报告预览/导出及切换|20/20|`node docs/design/verify-profile-report.mjs`|
|知识归组|12/12|`node docs/design/verify-knowledge-patterns.mjs`|
|知识补练跟踪|15/15|`node docs/design/verify-knowledge-followup.mjs`|
|班级证据下钻|19/19|`node docs/design/verify-class-knowledge.mjs`|
|补习与复测完整过程|25/25|`node docs/design/verify-learning-journey.mjs`|
|既有Node检查|8份脚本均通过|`Get-ChildItem app/tests/check_*.mjs` 逐份执行|
|全部Python回归|最终409/409|在app目录 `python tests/run_tests.py`；`.qa-temp/student-first-final-python-recheck.log`，131.853秒|
|桌面/窄屏视觉|已实际查看|`app/.qa-temp/student-first-browser/01-student-first-desktop.png`、`02-student-first-mobile.png`；1440×1000、390×844|

新增检查含空库/有名单但未选人、同名不同编号、按编号查找、无匹配、跨卷历史、迟到响应、失败重试、待审学生、旧证据取消、独立报告来源、取消离开保留修改、保存后切学生保留草稿，以及不新增确认历史/不外发。

测试失败与修复证据：

- 首轮新增测试0/1，确认为旧版默认整卷审核；实现后通过新增路径。
- 双轴审查：Standards无行动项；Spec发现1项——切出档案会清掉未提交收件表单。已先RED复现，再把清理限定为档案证据/报告窗口；19/19通过，Spec复审确认原项解决。失败记录 `app/.qa-temp/student-first-browser/red.json` 保留。
- 最初受限环境全量回归出现本机通信不可达；允许本机回环后基线409通过。实现后一次全量启动器子进程失败（其日志在测试清理时未保留，具体原因未证实），未修改启动器或跳过测试；定向14项通过，随后完整409项复跑通过。对应日志 `student-first-final-python.log`、`student-first-launcher-recheck.log`、`student-first-final-python-recheck.log` 均在app/.qa-temp保留。
- 新检查最后的网络断言曾误拒绝浏览器日历自带的本地`data:image/svg+xml`。检查保留网络记录后区分本地data图片与HTTP外发，仍禁止外部HTTP和模型send；不以放过外部请求换取通过。

这些结果仅验证软件行为，不证明真实批改准确率、教学效果、教师净省时或无Python电脑运行能力。

## 实际演示与验收

本机演示：<http://127.0.0.1:8767/#profile>，运行实际应用源码，独立合成库 `app/.qa-temp/student-first-preview-20261108`。3名合成学生、4份作业、3条确认历史；其中A有两份作业，C仅待审。不是原8766布局原型，也没有接入真实学生档案。

若会话结束后服务停止，在本工作目录执行：

```powershell
python app/tests/browser_fixture_server.py --data-dir app/.qa-temp/student-first-preview-20261108 --port 8767
```

此命令只用于假AI合成演示，不是生产启动命令；不要往该库放真实学生材料。

请用户验收：打开先选人→搜索姓名/编号→切A/B查看各自档案→选待审学生看空确认状态。桌面名单在左，窄屏名单在档案前；原十个导航暂保留，三入口收拢属于02。

下一项拟做02：收拢“学生档案、登记作业、班级学情”三入口，旧AI/资料/备份归设置，保留现有能力和确认边界。**需先说明并获用户许可，本交付不启动02。**
