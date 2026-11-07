# v0.20 班级共性知识证据交付

2026-11-07。起点5ddb59b，本地功能分支feature/class-knowledge-v020。本轮完成既定班级共性主线中的知识问题汇总与逐生追溯，没有替老师确认或自动诊断。

## 老师能做什么

在“班级共性问题”顶部的新知识区，按当前批次的最新确认记录查看每个知识点涉及多少名学生。错误和部分正确计入待补齐，同一学生多道错题只计一人；正确、待核对、缺材料单列，草稿和复测不混入原卷统计。

同一已审核知识条目跨资料版本、名称和题型可一起看；同名不同条目、未关联标签分开。每组显示曾用名称、题型与涉及学生，展开后回看固定当次原题、原答、老师批注和附件，或进入该学生档案。有待审修订仍保留并标注旧确认，改判后再按最新确认统计。原按题号统计区保留，不以题号替代知识身份。

多人涉及只提示老师可考虑集中核对、决定讲什么，不表示长期薄弱、独立作答次数或掌握率。当前批次不是长期固定班级名册。实际日期、独立条件及是否同一知识语义仍需老师核实。

## 实现与检查

新增class_analysis.py，复用个人档案的逐生保守去重，再合并稳定知识身份；summary只追加class_analysis字段，旧字段保持。新增class-panel.js及中文操作说明，复用既有证据/档案读取。无数据表或格式迁移、无新依赖、无AI请求。

班级摘要读取增加页面与原卷代次保护。证据读取核对学生、原卷、题号、确认事件/版本与批次；进入档案前重读原卷和bootstrap核对归属/版本。换批、切页、请求期间打开窗口会使迟到操作失效；失败可重试，不自动切到别人。

| 检查 | 结果 | 本地证据（docs/design下） |
| --- | --- | --- |
| 原版完整基线 | 330/330，134.101秒 | class-knowledge-baseline.txt |
| 新知识汇总专项 | 12/12 | class-knowledge-green.txt、app/tests/test_class_analysis.py |
| 最终完整Python | 342/342，143.774秒 | class-knowledge-python-final.txt |
| 新班级证据浏览器 | 19/19，无页面异常 | class-knowledge-browser/verification.json |
| 连续审核回归 | 26/26 | review-flow-browser/verification.json |
| 个人档案回归 | 14/14 | student-archive-browser/verification.json |
| 批次收件回归 | 18/18 | batch-intake-browser/verification.json |
| 材料补交回归 | 20/20 | paper-materials-browser/verification.json |
| 实际运行工作台只读 | 31/31，无页面异常 | v020-live-preview/verification.json |

TDD：先观察summary缺字段的失败与浏览器缺入口的失败，再实现。测试最初假设同一学生同批可重复建卷，被既有唯一约束拒绝；修正为相同照片跨学生仍分别计数，不修改既有约束。

完整回归首次在受限沙箱系统临时目录出现SQLite unable to open及清理WinError5（4 failures/347 errors），保留class-knowledge-python-sandbox-failed.txt。按与基线相同的执行环境重跑后342/342通过；没有删测试或改产品逻辑来获得通过。此失败是执行环境证据，不能写成首轮全部通过。

独立只读代码审查review_class_knowledge_v020：Critical/Important/Minor均0，独立重跑12项专项通过；未独立重跑会产出截图报告的浏览器脚本。审查不评价真实教师效率和识图质量，保留待验证。

实际看过合成截图：class-knowledge-browser/01-class-desktop.png、02-class-mobile.png、03-class-evidence.png。知识人数、状态和证据可读；390px页面未横向溢出，旧统计表在自身容器可横向滚动。

## 本机更新与资料保护

地址http://127.0.0.1:8765，健康接口0.20.0。先核实密钥未载入、无SENDING/RUNNING任务，创建完整备份；只停止路径已核实的旧项目PID41496，复用原启动器隐藏启动服务。

完整备份：app/.local-data/backups/backup-20261107T093252-a36e2ff8.zip，14,984,850字节；SHA-256：9594d6b18bd1292eae01fd10e60f089932990e5d6b38a51cda3740aad2180568。备份留在本机，不进入Git或交付包。

更新前后9张业务表逻辑SHA-256均为e7321a53a9b88db7230cc5e5df077f6f768748fe275247cc555a0530d94ef75b。学生3、试卷3、确认事件0、练习0、复测0、既有AI任务10、教学资料/版本0；真实试点记录0、材料历史快照0。新脚本与实际服务源码一致，应用/资料路径一致。证据：class-knowledge-live-before.json、class-knowledge-live-after.json。

本轮没有真实教师确认、真实归档、复测或学生发布，没有外部AI调用；既有10条AI历史不代表本轮新增。确认数据为空时，新知识区显示暂无可归组，不预填薄弱结论。

## 交付与恢复

- 操作说明：app/班级共性使用说明.md。
- 包：docs/delivery/jinxue-local-trial-v0.20.0.zip。
- 白名单：沿用v0.19源码并增加4文件，共91源码；附6份检查证据及MANIFEST，共98文件、97哈希项。
- 大小：2,765,901字节；SHA-256：21152c0b6be87e0c6ec69ac69e54b935fc6b15c009ec040d75bbd5dbfc5082c2。
- CRC、逐文件SHA和91源码与当前app逐字节比对通过。不含本机学生资料、真实照片、密钥、浏览器目录或Git。

按项目AGENTS明确列出本轮20个源码/文档文件，敏感信息扫描后本地提交；不合并main、不推送或配置远端。确切提交号以Git日志与最终回复为准。本轮无schema迁移，旧版本代码恢复仍须先保护本机业务与未提交内容，不能把Git回退当资料回退。

## 尚未验收

真实手写识读、实际数学内容质量、知识语义与教材/考试适配、真实独立复测、教师净省时及10人试点仍需真实记录。本轮是软件可操作性增量，未把7步业务验收改为全部通过；其他学科正式上线、多机构账户与付费会员不在本次范围。
