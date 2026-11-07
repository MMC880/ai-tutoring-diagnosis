# SDD ledger — plan: docs/superpowers/plans/2026-11-07-class-knowledge.md

BASE 5ddb59b，初始干净，本地feature/class-knowledge-v020，同目录延续既有用户工作台；不新建或迁移应用/资料目录，不合并main、不推送。
Ruling: 用户反复要求继续开发且已确认班级共性目标，沿用既有技术栈直接完成一个增量，不重开需求审批。
Pre-flight: Task1产出summary.class_analysis供Task2使用，完整证据student/paper/event/revision/batch贯通；证据接口只读，Task3不用合成记录改本机业务。
Task 1: complete。

Task 1 Ruling: 同一学生同批次只能有一份原卷，初测的同批重复建卷场景被既有ConflictError拒绝；修正测试为同照片不同学生仍分别计数，不改已有唯一约束。跨卷保守去重继续复用个人分析。

Task 1 complete: 12/12专项通过；初始缺class_analysis的RED已观察。Task 2 complete: 19/19页面通过，初始入口缺失RED已观察。独立review_class_knowledge_v020审查Critical/Important/Minor均0，独立专项12/12，未重跑浏览器。
Final Ruling: 审查暂不评价真实教师省时/识图质量，这些保留待验证，不阻塞本轮只读工程增量。

Task 3 Ruling: 完整回归首次在受限系统临时目录遇到sqlite unable to open及清理WinError5（4 failures/347 errors），保留class-knowledge-python-sandbox-failed.txt；按与330项基线相同的已授权执行环境重跑，不修改测试或产品逻辑来规避失败。

Task 3 complete: 同基线环境完整342/342 Python（143.774秒）；26连续审核、14档案、18批次、20补交回归通过。完整备份后只重启项目PID41496，本机0.20.0，31/31实际只读检查通过；业务摘要未变。98文件/97清单、91源码逐字节一致。桌面/390px/证据窗口已实际查看。无实际AI、教师批准或学生发布。后续按AGENTS显式20文件本地提交，不推送。
