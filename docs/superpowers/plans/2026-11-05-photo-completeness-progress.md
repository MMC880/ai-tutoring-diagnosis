# SDD ledger — plan: docs/superpowers/plans/2026-11-05-photo-completeness.md

Pre-flight: Task1 transport返回普通body或IncompleteResponse，Task2依旧只解析完整final JSON，metadata.outcome沿用；清单在job metadata与Store恢复中一致校验。Task3不把JSON替身当真实SSE支持，SSE由独立字节流测试覆盖。
Ruling: 图片分段接收默认关闭，指定书生渠道尚未核实流式兼容，不自动改模型或外发。代价是首次真实效果需用户在本机装载Key并重新验证；本轮不从聊天装载Key。
Ruling: 完整性清单由老师核对提供，是识别完整性的已知参照；无清单不宣称自动数齐。代价是首次作业多一步清单输入，但避免漏题伪完整。
Ruling: 沿用已授权本地栈与项目证据目录，无Git独立仓库不执行依赖Git的workspace脚本，不改父仓库。

Task 1: SSE core RED→GREEN, 125 tests passed; byte-split UTF8, heartbeat, terminal/DONE, size/time, tools and reasoning exclusion, interrupted usage/no retry tested. Only optional stream setting; no live API.
Task 2: coverage tests RED (missing/local checklist/outside IDs/manual/restore), implementation GREEN full135. Shared checked_question_ids lives in Store to avoid circular imports; vision consumes it. Missing source answers remain but unresolved/PENDING; no reference fill.
Task 3: browser first RED for missing controls, then11 checks passed before Page.navigate timeout; cause was expected unsaved-changes beforeunload dialog after a negative save test, not app transport. Test harness now explicitly accepts that beforeunload in isolated fixture, no automatic business confirmation.

Browser ruling: old15-check script mistook newly-required local owner/version preview for outbound identity leakage. Changed assertion to inspect actual prepared payload plus PNG/send-consent state; local owner remains visible, provider body must exclude name/filename. No privacy rule weakened. New completeness UI15/15 passed, synthetic only.

Final: fixed both Important findings — photo-completeness-review-red.txt has2 failed usage assertions and2 note-length errors; final full140/140 in photo-completeness-tests.txt, new browser16/16 includes carrying recognition_notice on whole-paper save. Normal DONE/interrupt usage and three repeated missing recognitions covered; full1500-char notes preserved, separately bounded500-char notice shown in teacher report.
Final review had Critical0/Important2/Minor0; no deferred minors. Previous PREPARED owner/version minor was included in this plan and implemented.
Deployment ruling: originalPID46220 was already gone; listener0/process absent/HTTP unreachable corroborated. No process terminated. Existing Store offline backup backup-20261105T084539-5ac47e9b.zip created before startingPID10452. Live readonly9/9, health0.4.0, papers3/events0/photoV4, known10 jobs and originalUNKNOWN retained; Key absent/image_stream false. No new real API calls.

Final review: first reviewer reported 2 reproducible boundaries before a user steer ended that agent; fresh completion reviewer independently confirmed both, final Critical0/Important2/Minor0. No source edits by reviewers. Important findings reproduced in photo-completeness-review-red.txt: 2 usage assertions failed, 2 long-note applications errored with ValidationError; no partial writes.
Final fix: only legal nonnegative integer usage fields update previously known fields, empty/invalid cannot clear them. System recognition_notice is separately bounded to500 and old recognition_notes stay intact at1500; notes combine only if they fit and don't duplicate. Both AI/manual use same helper, workbench preserves hidden notice and teacher export displays separate supplement when needed.
Final: Ruling: real channel compatibility, actual fee and teacher/handwriting effects remain unjudged — no real requests or student data. Existing byte tests and fake browser prove local behavior only; live UI will be read-only. No post-fix second review, per execution workflow.

Task 3: complete — final new browser16/16, old12/8/10 re-run after note fix; whole workflow34 and image race passed. Source v0.4.0 ZIP39 files/38 manifest hashes independently verified, CRC OK, ai_stream and tests included, long-Key pattern0 in243 scoped source/docs texts and package, runtime excluded. SHA256829fc911f04824f515cfc2120c7154f19077bd93d4bd6a28b5c49b9612376b83. No Git merge/publish or external API in this cycle.
