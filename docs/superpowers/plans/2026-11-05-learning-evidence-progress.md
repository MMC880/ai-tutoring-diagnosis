# SDD ledger — plan: docs/superpowers/plans/2026-11-05-learning-evidence.md

Pre-flight: Store._latest已提供每卷每题最新确认；Task1补充该学生原卷元数据，纯聚合不改review_events。Task2消费group.practice_source/review_source，只导航不写业务记录，仍由create_exercise检查原卷确认。
Ruling: 用明确标签与事实次数，不引入知识薄弱阈值；“跨作业反复”仅描述至少两份作业出现错误。代价是不同叫法不会自动合并，需老师统一标注。
Ruling: 相同PNG/JPEG作业图片组与同题号保守去重，最后确认胜出；共用空白原卷图＋人工答案可能被保守合并，保留全历史并说明，不将其当独立作答。参考答案图不参与。
Ruling: 本次复测继续独立时间线，不凭当前标签反向改写旧练习的知识归属；来源快照增强留后续，不自动判掌握。

Task 1: latest-confirmation aggregation and optional type RED→GREEN, 154 full tests passed. Covers revisions, multiple questions/same paper, photo duplicate/reference exclusion, unknown labels, retests separate, and pending-draft source blocking. Two AI candidate-type assertions RED before parser/apply support.
Task 2: browser RED for missing type field; next5 checks passed through correct Q02 practice creation, then test wrongly expected approval button still enabled after approval. App resets consent each render; corrected test to wait actual APPROVED state, not weakened gate. Only isolated synthetic confirmations.

Final review: Critical0/Important2/Minor1. RED evidence: learning-review-red.txt6 assertions (photo-group assignment count and stale/invalid source version), learning-focus-browser-red.json6/7 (focused Q02 regraded CORRECT then wrongly offered Q01). Fixed: count canonical photo-group assignment keys, retain navigation paper_id; focused options cannot fall back, invalid revision disables and submit rejects; client sends original paper_version and server checks optional exact positive version. Final159/159 and new14/14 passed.
Final: minor (deferred): old workbench field caption still reads“知识点／题型” despite separate question_type field. New field says separate; documentation tells users to use old field for knowledge only. Deferred wording cleanup, no schema/history rewrite.
Final: Ruling: independent reviewer did not assess actual OCR, learning validity, teacher net time or printing — continue to mark unverified; all regression is synthetic. No post-fix second reviewer, tests verify the fix.

Deployment: listener/HTTP bothOFFLINE, no process stopped. Store backup backup-20261105T121502-450ab646.zip before startingPID48760; actual readonly11/11, health0.5.0, three papers/photoV4/zero events/10 jobs preserved. Learning groups empty as expected for unconfirmed data. Key absent, no real AI.

Task 3: complete — old34 and photo16 regression after source fixes passed; final159/159, new14/14, actualreadonly11/11. v0.5.0 ZIP44 files/43 hashes and CRC independently verified, 267 scoped text files plus package long-Key pattern0; runtime excluded. SHA2561794a3c0b162c22a34e422fdc5b0831bbc99201271780a0a74c512b2629c3581. No merge/publish/new real API or business confirmation in live data.
