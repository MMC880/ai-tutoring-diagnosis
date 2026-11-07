# SDD ledger — plan: docs/superpowers/plans/2026-11-06-teaching-library.md

2026-11-06，继续既有第3步，工作区E:/GPT/AI-Tutoring-Diagnosis。无Git；原8文件副本在app/.qa-temp/teaching-before-20261106，旧v0.10 ZIP保留。没有创建父仓库、推送或真实AI调用。

Ruling: 用户要先做四科底稿，四科Markdown按DRAFT保留；运行中的资料模块仍限定数学，不自动审核或预填学生结论。代价是其他三科的软件接入继续后置。

Ruling: 原Python312安装路径在本次环境已失效，采用桌面内置Python3.12.14，python-docx1.2.0、pypdf6.21.4、Pillow13.0.0。不安装依赖、不修改全局PATH，仅子进程使用内置解释器。

Task 1: complete — 资料版本、审核、引用及备份检查已实现，21项专项检查通过；全Python236项通过，日志teaching-python-final.txt。先前14项核心测试及3项追溯/原件检查已验证；本次补4项导入和备份归属场景。

Task 2: complete — 独立资料页、原件预览、目录核对、逐题引用和只读历史来源已接通。15项资料库浏览器、14项档案与15项老师主判回归通过；桌面和390px引用窗口图片实际检查，无可见截断。

Review findings and fixes:

- 切换资料期间旧编辑丢失：2项Node RED复现，禁用旧fieldset并检查editEpoch，错误时保留原DOM及选中资料；GREEN。
- 导入草稿改变知识名：保留已有引用与知识名称配对；导入不能授权或移除该引用，手工编辑仍检查一致性。
- 恢复备份索引与原件身份不一致：在替换现有库前核对资料行、所有版本、学科、原件元数据和文件哈希；2项新增RED复现并GREEN。改判和缺原件检查继续通过。
- 最终独立审查发现POST完成后refresh/load等待仍能丢字：第三项Node RED复现，资料提交改为直接render而不重新加载bootstrap；更新服务器版本并在首个await前锁编辑区。审查者用真实app.js和panel的VM复核，排队输入保留DOM、dirty及正确版本，3项Node GREEN，无新增发现。

初次新增测试曾因测试SQLite连接未关闭及VM桩递归报错，已先修测试，再确认真正的两项业务失败。浏览器普通沙箱WebSocket受限，隔离回环服务与隐藏Chrome经权限运行后通过；不把沙箱错误计为产品错误。

Task 3: complete — 操作说明、包和本机服务回读按最终交付报告记录。原本机资料不做导入／成绩确认／发布。真实教材、适用考试范围、实际公式与手写识读、真实跨次证据及教师省时仍未验收。

Deferred minors: 当前每题只保存一个主要教学引用；其他知识联系需说明，后续按实际业务扩展。未发现需阻断本次整理与追溯功能的未修复审查项。

最终本机22项只读检查通过，业务七表摘要一致；v0.11 ZIP 66文件/65清单CRC及SHA检查通过。实际服务旧进程已离线，使用内置Python隐藏启动，无需停止用户进程，详情见TEACHING_LIBRARY_DELIVERY.md。
