# SDD ledger — plan: docs/superpowers/plans/2026-11-07-profile-report.md

BASE 6212c06，初始干净，在feature/profile-report-v023同目录继续，不迁移应用或资料、不合并main或推送。
Scope: 用户已明确要本地档案和按需Word/PDF输出，继续授权下完成个人教师核对报告；不新增家长发布、心理档案或真实学情诊断。
Pre-flight: Task1指纹/块同时用于Task2预览和输出，所有变更都用该学生单次profile快照比较；Task3仅对实际已有档案做只读检查，不制造确认/复测。
Task 1: in progress。

Task 1: 15 report tests RED→GREEN; HTTP new test 404 RED→GREEN. Unchanged save does not increment version, stale HTTP fixture now changes actual answer.
Task 2: browser entry RED observed; UI implementation in progress.

Task 1 complete: report16 + HTTP1 pass; fingerprint additionally covers every student paper version, including unclassified pending drafts.
Final review: reviewer review_profile_report_v023; Critical0/Important2/Minor0.
Final fixed: all exercise version stems retained — test_all_exercise_versions_show_their_actual_stems_without_retests RED→GREEN.
Final fixed: popup blocking no longer claims success — browser blocked-window test RED→GREEN, plus actual blank window with 5.5s delay and opener null.
Task 2 complete: full Python389/389 (112.045s), new browser20/20; archive14, followup15, queue22, review26, intake18; six Node scripts pass. One initial Chrome CDP connection error occurred; unchanged suite retried and passed.
Task 3 in progress: complete backup made and service0.23 started; business9-table SHA unchanged. No real confirmation, retest, export or AI call.

Task 3 complete: live0.23.0 35/35 read-only, source bytes match; business SHA unchanged, complete backup protected locally. Final UI browser20/20 after layout QA; desktop/mobile and two PDF pages inspected. DOCX A4/2cm/7 OMML, PDF2 A4 pages; real Word editing/paper print unverified.
Delivery allowlist:113 files /103 source /112 hashes; CRC and current-byte comparison pass, no private data. All plan tasks done; local commit next, keep branch in place per AGENTS, no merge or push. No deferred minor findings or unimplemented review rulings.
