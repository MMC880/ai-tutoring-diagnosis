# SDD ledger — plan: docs/superpowers/plans/2026-11-06-knowledge-patterns.md

2026-11-06。工作区E:/GPT/AI-Tutoring-Diagnosis；无Git，改前5份源码副本在app/.qa-temp/patterns-before-20261106，v0.11交付包保留。

Ruling: 按已授权第4步主线细化，采用教师已选教学条目的稳定ID，不增加AI同义猜测、全局别名自动映射或学生诊断阈值。不同资料／条目不能靠同名自动合并；老师可回原卷明确统一关联。代价是没有教师关联的旧数据仍只是标签线索。

Ruling: 本次不扩展实际作业日期和独立作答条件的数据模型；明确显示确认时间不是作业日期，跨作业信号不是跨日独立作答认证。第4步真实验收继续待老师跨次材料及核实，不伪造日期满足验收。

Task 1: complete — 12项Python RED首次7失败/3缺新字段错误；稳定material_id+entry_id归组后12项GREEN。保留无引用旧标签分组、照片/PDF/Word来源去重、学生边界、最新确认和原历史。原learning/archive28项回归通过，全Python248项通过。

Task 2: complete — 真实renderer的4项Node RED→GREEN，显示知识依据、曾用名称、涉及题型、当次标签／固定资料版本和确认时间。补2项来源切换RED（先修测试缺少全局变量的桩，再确认Missing expected rejection），增加profile/renderEpoch身份检查后共6项GREEN。

新知识归组浏览器12项，原持续问题14项、原档案14项回归通过。全部使用隔离合成学生及合成Word，不写真实确认记录、不调用模型。桌面和390px截图已检查，最终版本再聚焦分组证据区域回看。

Independent review: 未发现实质缺陷；审查者自行重跑新知识12+原学习17+原档案11共40项Python及6项Node，均通过。浏览器没有由审查者重复运行，不冒称其独立浏览器复核。

Task 3: complete — 最终v0.12版本、源码包、本机备份与回读见KNOWLEDGE_PATTERNS_DELIVERY.md。业务只读增量，不新增数据库schema或实际学生事件。

Deferred minors / boundary: 实际日期与独立条件、跨资料全局条目映射、真实长期教学效果待后续，均明确展示，不把合成工程检查当作教学验收。

最终本机23项只读验收通过，9表业务摘要不变；v0.12包70文件、69清单，逐项SHA与CRC通过。实际资料库仍空、原真实确认事件仍0，详情见交付报告。
