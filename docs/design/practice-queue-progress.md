# SDD ledger — plan: docs/superpowers/plans/2026-11-07-practice-queue.md

BASE 4a5e094，初始干净，在feature/practice-queue-v022同目录延续；不迁移资料或运行目录、不合并main或推送。
Ruling: 用户持续授权既定教师工作流开发，本轮补集中待办，不增加到期/心理/自动学习诊断或外发。当前记录决定处理线索，实际学生独立条件与日期仍待老师核实。
Pre-flight: Task1元数据行身份供Task2精确导航；最新复测ID与原卷/练习版本同为过期守卫；Task3本机仅检查既有记录，不把合成确认写真实库。
Task 1: complete（最终15项专项+1项HTTP）。

Task 1 complete: 后台12/12、只读HTTP/Origin专项1/1；初始模块缺失与404的RED已观察。Task 2初轮18项通过，测试中一次清筛选后未等异步渲染导致Missing selector，修测试等待而非产品逻辑。继续验证最终清单核对能拦截读取期间新增复测。

独审review_practice_queue_v022：Critical/Minor 0，Important 1（V1复测被套到已批V2）。审查是静态调用链，独立沙箱SQLite复现失败未计通过。作者新增3项运行复现，先3项失败，保留practice-queue-version-red.txt；修复当前版观察按版本筛选、历史观察单列。共用learning_journey.retest_observation保持旧过程语义不变，新15项专项通过；浏览器新增新版批准/旧版迟交用例。此为唯一审查的一轮修复，继续全套和受影响页面回归。
修复后浏览器回归首次执行因自动审批deadline超时未执行，非unsafe判断；按允许通过原审批通道重试一次，不绕过。

Task 2 complete: 一轮审查修复后372/372 Python（108.501秒）、新页面22/22、档案14/14、知识跟进15/15；连续审核26/26、收件18/18、6份Node检查通过。版本修复前后RED/GREEN都保留；作者复核固定来源、当前版筛选和历史分列，未再次派审查代理。
Task 3 complete: backup-20261107T124730-1890cda2.zip完整备份CRC/SHA通过，更新前再次只读核对资料与备份一致；仅停止核实项目PID64960，原启动器启动0.22。34/34实际检查通过，9表摘要/0试点/0材料快照不变。107文件/106校验项、99源码一致；显式21文件本地提交，不合并或推送。
