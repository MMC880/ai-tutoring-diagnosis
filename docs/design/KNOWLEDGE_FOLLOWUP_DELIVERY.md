# v0.21 知识点补练跟进交付

2026-11-07。起点5315ea3，本地功能分支feature/knowledge-followup-v021。本轮完成个人知识问题与补习/复测过程的只读衔接，已更新本机0.21.0。先前候选阶段受审批额度限制中断的回归、独审及实机验收已补齐。

## 老师可见的变化

每个知识组显示关联补练组数、累计复测记录数，以及各练习最后一次录入对应的观察状态。独立答对、有提示需独立复测、仍需补齐、完成条件/材料待核、待审批和待复测分列；一组正确不抵消另一组失败，原卷错误计数和历史保持。

关联依据是建立练习时固定的原题确认。相同已审核知识条目跨版本/名称/题型匹配，同名不同条目与未关联标签分开；原题后来改关联不把旧练习改挂新知识。没有当前组可对应或旧来源缺失时提示数量，完整过程仍保留。

每组注明来源确认版本、当前练习版本及待审状态、已批版本数、复测次数和最后记录的条件/结果/题面版本。当前题面V2待审时，V1复测仍对应V1。可在当前档案准确定位并聚焦完整过程，回看原题、讲解、各版本和全部复测；定位不保存、生成、审批或发布。

一次独立答对只增加观察证据，累计记录不等于独立作答次数。最近指该练习写入顺序，不是实际作业日期或知识点统一掌握结论。

## 实现和审查

learning_analysis提供统一知识身份函数；knowledge_followup.py只读整理已有learning_journeys，Store.profile计算一次过程后附加组内followup。followup-panel.js渲染摘要并核验当前学生、知识组、练习、固定来源和现有过程卡后定位。无schema或业务写API变动，无新依赖、无真实模型调用。

TDD：先观察缺followup字段与页面缺入口失败，再实现。页面定位实际发现data-exercise被旧全局练习选择器提前截获，已保留knowledge-followup-navigation-red.json，改用独立data-followup-exercise后通过。一次断言误选空知识卡，已修正测试目标，不把测试选择器问题当产品修复。

唯一独立审查代理review_knowledge_followup_v021恢复后完成静态审查，Critical/Important均0；没有独立运行测试或浏览器。Minor为默认git diff --check将CRLF误作尾空白；本项目* -text保留原字节，采用命令级cr-at-eol检查通过，无批量改行尾或全局配置变化。审查不评价真实学生是否独立完成、教学效果与省时，继续待验证。

## 实际验证

| 项目 | 结果 | 本地证据（docs/design下） |
| --- | --- | --- |
| 原版完整基线 | 342/342，136.671秒 | knowledge-followup-baseline.txt |
| 新后端专项 | 14/14（包含在完整套件内） | knowledge-followup-green.txt |
| 最终完整Python | 356/356，90.159秒 | knowledge-followup-python-final.txt |
| 新功能浏览器 | 15/15，无页面异常 | knowledge-followup-browser/verification.json |
| 原个人档案 | 14/14 | student-archive-browser/verification.json |
| 原班级共性 | 19/19 | class-knowledge-browser/verification.json |
| 原补习过程 | 25/25 | learning-journey-browser/verification.json |
| 原知识归组 | 12/12 | knowledge-patterns-browser/verification.json |
| 原连续审核 | 26/26 | review-flow-browser/verification.json |
| 原本地JS脚本 | 6份全部通过 | knowledge-followup-node-checks.txt |
| 实际运行工作台只读 | 32/32，无页面异常 | v021-live-preview/verification.json |

六份Node检查为vision_race、teaching_switch、learning_journey、knowledge_patterns、grounded_tutoring、continuation。原回归本次重新运行，不用旧版本结果替代。

最终桌面1440px、窄屏390px和完整过程聚焦图已实际查看：knowledge-followup-browser中的01、02、03图片。桌面/窄屏实际展示三组练习的待审、仍待补和独立正确并列，文字按钮可读，页面不横向溢出；03显示正确过程卡及旧版/待审题面区别。均是隔离合成验证，不是学生真实复测。

## 本机更新与资料

入口http://127.0.0.1:8765/#profile，健康接口0.21.0。先核实无载入密钥、无SENDING/RUNNING任务，创建并验证完整备份；仅停止路径已核准的旧项目PID29504，由原启动器隐藏启动新服务。

备份：app/.local-data/backups/backup-20261107T121329-29a495f7.zip，14,984,850字节。SHA-256：3465cea928f36346efd2894d687d609fd3befdd36af7c6e2e38b2b8bf069ced6；CRC与文件SHA核验通过。备份是本机资料，不进入Git或交付包。

升级前后9张业务表逻辑SHA-256均为e7321a53a9b88db7230cc5e5df077f6f768748fe275247cc555a0530d94ef75b。学生3、卷3、确认事件0、练习0、复测0、既有AI历史10、教学资料/版本0；真实试点记录0、材料历史快照0。应用/数据路径及实际静态源码一致，全部学生档案都具备新的分析字段。证据：knowledge-followup-live-before.json和knowledge-followup-live-after.json。

本轮无真实外部AI调用、无教师确认/新复测/学生发布。实际档案无确认时不伪造问题或学习进展。

## 交付包与Git

操作说明：app/知识补练跟进说明.md。

正式源码包：docs/delivery/jinxue-local-trial-v0.21.0.zip。沿用v0.20明确源码白名单增加4文件，共95源码，加8份验证证据与MANIFEST，共104文件、103校验项。CRC、逐文件SHA及源码与当前app逐字节比对通过。

大小：2,784,105字节；SHA-256：9d220f30ee7c0fcc7d6a818d8b40c5ddfeb987a81e7ed018c900c6d0dcc72a13。不包含本机学生档案、真实照片、密钥、备份、浏览器目录或Git。早先candidate.zip保留作当时状态记录，未简单改名冒充正式包。

本轮22个源码/说明文件按AGENTS显式暂存并创建本地提交；确切提交号见Git日志和最终回复。未合并main、配置远端或推送。无schema迁移；代码恢复仍须先保护业务库和未提交内容，不能把Git回退当资料回退。

## 真实验收边界

真实手写识读、知识语义和教材/考试适配、数学补练质量、真实独立复测、教师净省时和10人试点仍待实际记录；不因软件增量而把7步真实业务验收改为全部通过。其他学科正式上线、多机构账号和付费会员不在本轮范围。
