# SDD ledger — plan: docs/superpowers/plans/2026-11-07-knowledge-followup.md

BASE 5315ea3，初始干净，在feature/knowledge-followup-v021同目录继续，不迁移运行/资料目录、不合并main或推送。
Ruling: 用户已持续授权既定教学主线开发，本轮聚合已存在的知识点与补习复测证据，暂不新增实际日期/作答条件填写模型；实际作业日期仍待核实，摘要不冒充跨日诊断。
Pre-flight: Task1的knowledge_group_id与followup项练习ID供Task2渲染/定位，来源固定不随当前关联变化；Task3本机只读验证不写真实记录。
Task 1: complete（14专项通过）。

Task 2 Ruling: 首轮定位失败源于新按钮data-exercise被旧全局练习选择器提前截获并重渲染。保留knowledge-followup-navigation-red.json，改用独立data-followup-exercise而不改旧分发逻辑，再验证定位/聚焦。

Task 2 implementation complete: 新页面15/15，无页面异常；6份既有本地Node脚本全通过。342项基线通过；完整项目入口python app/tests/run_tests.py为356/356（112.611秒）。页面断言最初选错空知识组，已修测试目标；实际data-exercise拦截缺陷已先RED复现后GREEN。
Task 2 remaining: 原档案/班级/过程/知识归组/连续审核浏览器回归未执行。自动审批返回usage limit，明确说明操作未执行、不是unsafe判定；不通过其他执行方式绕过此检查。唯一独立审查代理review_knowledge_followup_v021也因usage limit未产生审查，不能称独审通过。
Task 3 remaining: 无本轮服务备份/重启/实时验收、无暂存/提交。仅准备候选包与后续验证脚本，旧业务记录未获新的确认或复测。本轮未调用真实AI。
Ruling: 首轮15项页面已运行，后续修改仅候选版本文字与人工说明；它不替代尚缺的页面原流程回归。检查恢复后先补回归/独审，再备份升级、检查本机与源码、重打正式包并本地提交。

恢复执行：原审批通道重试成功，正在补上旧浏览器回归。唯一独立审查代理恢复后完成只读审查，Critical/Important均0；未独立运行测试。Minor为CRLF被默认diff --check当作尾空白；项目* -text保留原字节，采用命令级cr-at-eol核验，不全局改配置或批量改行尾。真实独立条件/效果/省时仍待验证。

恢复后旧页面回归：档案14/14、班级19/19、补习过程25/25、知识归组12/12、连续审核26/26；新页面最终15/15。最终重新截图实际查看知识摘要桌面/390px，三组练习的待审、待补和独立正确并列清楚，无横向溢出。正式打包脚本已改为要求全部回归/实际版本验收通过后才出包，早先候选zip保留作历史。

Task 2 complete: 最终356/356 Python（90.159秒），新页面15/15，档案14、班级19、过程25、归组12、连续审核26均通过；独立静态审查无Critical/Important，CRLF Minor按原字节约定处理，命令级diff检查通过。
Task 3 complete: 完整备份backup-20261107T121329-29a495f7.zip并核对CRC/SHA，仅停止核准项目PID29504，由原启动器启动0.21。32/32实际只读检查通过，9表摘要及0真实试点、0材料快照不变；104文件/103清单、95源码逐字节一致。按AGENTS显式22文件本地提交，不合并或推送。此前候选说明为当时状态，最终以本行和正式交付说明为准。
