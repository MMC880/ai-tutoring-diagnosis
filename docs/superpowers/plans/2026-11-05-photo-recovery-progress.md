# SDD ledger — plan: docs/superpowers/plans/2026-11-05-photo-recovery.md

Pre-flight: Task1/Task2共享AIService.send与metadata，outcome和target_question_id并列，旧任务无字段继续可读。Task2应用和Store.restore共享transcription_reviews，需要在阶段库按目标核对已保存题号。Task3打包必须含全部新源码且排除.local-data。
Ruling: 继续现有本地栈和逐次外发方式，不增加全页自动重试或超时上限；单题目标为已有题号的本地约束。代价是首份未录题号的卷仍需自由模式与人工核对，不伪造识别准确率提升。
Ruling: 项目没有独立Git仓库，使用文档与白名单包记录执行，不调用依赖Git的工作区脚本、不动父目录仓库。
Evidence: live-photo-diagnostic/20261105T020012Z-71f7ed87/verification.json，本轮一次合成整页请求UNKNOWN，TimeoutError，52.08s，usage未知，V4/0事件保持。不会回写此原因到旧UNKNOWN。

Task 1: complete — 6个失败摘要测试在缺outcome时RED，新增固定摘要/有证据的超时分类/耗时后全套100项通过，见photo-recovery-diagnostics-red.txt和photo-recovery-task1-tests.txt。初次用系统临时目录失败，改用项目既有.qa-temp测试路径，未将环境权限错当产品失败。
Task 2: complete — 目标归属/多题/读错号/人工跨题/恢复错目标8项断言RED，106项全套GREEN。逐题入口浏览器先RED后12/12；发现新选择器min-content导致窄屏溢出，尺寸356/402已记录，约束grid列后356/356。失败继续8/8（含跨学生返回正确卷、新版本重新框选），原图片15/15和人工10/10回归通过。证据photo-recovery-target-red.txt、photo-recovery-browser-red.json、photo-recovery-mobile-red.json及对应preview/verification.json。

Final review: independent reviewer found 1 Important (unapplied job target not checked during restore; application only compared target equality) and 1 Minor (PREPARED preview lacks local owner/source version). Important reproduced as 3 RED assertions in photo-recovery-review-red.txt; fix validates unapplied targets in staged backup plus actual current-paper membership on both AI and manual apply. Added compatibility test for an old target removed by a later draft, which can restore but cannot apply old job.
Final: minor (deferred): PREPARED image preview shows target/image/destination but not local student/卷/source version; result page and backend version conflict guard are present. No bypass or data loss reproduced. Defer preview context polish, disclose in delivery.
Final: Ruling: reviewer did not run browser/real model/deployment/teacher trials — author runs browser and deployment, real teacher accuracy/costs remain unverified; no real student material enters this cycle. No second review requested after TDD fix, per execution workflow.

Final: fixed Important restore/apply target gap — 3 RED assertions in photo-recovery-review-red.txt → GREEN; added later-draft compatibility case, final suite110/110 in photo-recovery-tests.txt, approved local-loopback environment. Reviewer's106 run had13 socket-denied HTTP environment errors, not a passing suite; author's final110 passed.
Task 3 deployment: verified PID8668/loopback8765/health0.3.0, zero SENDING and backup-20261105T021600-a6d1f955.zip before stopping only8668; new PID46220 health0.3.1. Readonly live UI7/7, V4/0 events/old timeout diagnostic intact, key_loaded=false and vision NOT_VERIFIED. No key reloaded, no post-upgrade external requests.

Task 3: complete — docs updated, v0.3.1 ZIP36 files /35 manifest hashes and CRC independently verified; source/docs220 text files long-Key pattern0, runtime excluded, no claim of full-machine secret audit. Old packages retained. Delivery hash9c5a379862d35b494f5cfba0acc36b89587b7983e5734df212fa61dbbf5a1dff. No external deployment/merge.
