# SDD ledger — plan: docs/superpowers/plans/2026-11-05-tutoring-draft.md

Pre-flight: Task1沿现有ai_jobs/练习版本表，Store抽取_create_exercise(db,payload)同连接以保证候选映射原子性；Task2返回draft exercise id仍走既有练习审批/导出/复测。恢复核对V1来源与候选，不比较后来已修改的当前题面。
Ruling: 六步作为教师教案草稿，学生练习版仍不含答案/教案；未另建学生讲解发布功能。代价是老师课堂讲解或另行审核交付，避免自动泄露答案。
Ruling: 每档每任务仅创建一次；可明确另选其他档，不默认发三套。后续教师修订不被旧候选覆盖。
Ruling: 仅合成假接口验证，现有本机Key为空，不从聊天重装、不真实发送；数学有效性与渠道表现仍需后续实测。

Task 1: complete — backend RED (15 missing-mode errors) → 176/176; added active-key reflection RED (literal and unicode-escaped) → guarded parsed result and omitted sensitive diagnostics. Existing contracts, rollback and restore tests pass. Final full run pending.
Task 2: complete — browser initial RED missing tutor-open, then UI implemented; narrowed overflow RED (361px content in 356px dialog) fixed with scoped wrapping. New browser18/18, prior main34/34, photo16/16, learning14/14. Fake fixture only; no real sends. Same-level idempotent preserves V2, separate B creates only second draft, explicit approval + independent retest and stale-source block verified. Updated former knowledge caption as planned.
Ruling: No standalone Git in this project; preserve evidence/allowlisted ZIP rather than creating a parent-repository branch or running Git workspace scripts. Cost: review baseline is v0.5 package, not commit history.

Task 2 follow-up verification: browser20/20 adds explicit unsaved teacher edits retained and invalid-result no application. Desktop candidate screenshot and mobile screenshot visually inspected; initial narrow overflow was observed/fixed, not asserted from structure alone. SymPy1.14.0 verifies trusted fixture A/B/C algebra and exact inequality only (tutoring-math-check.txt); not arbitrary generated content.
Final review in progress: preliminary Important escaped active-key retention in malformed/truncated diagnostic reproduced RED in test_diagnostic_omits_escaped_key_on_truncated_or_malformed_response (2 failures). Waiting complete reviewer findings before one fix pass. No actual key or provider involved.

Final review: one fresh reviewer, gpt-6-astra. Critical0/Important1/Minor0. Important: truncated or malformed JSON skipped decoded-key check and saved reversible Unicode-escaped active key in diagnostic. Regraded Important for on-disk/backup impact; reproduced both RED, normalized-copy check now omits sensitive diagnostic text and retains usage. Targeted19/19 GREEN; full178 run pending. No second review dispatched.
Final: Ruling: Real handwriting and real provider behavior remain unverified — do not infer them from synthetic checks — cost: no real recognition reliability claim.
Final: Ruling: Arbitrary generated math, full curriculum coverage and difficulty remain teacher-checked/unverified — fixture-only SymPy is not generalized — cost: candidate content may need correction.
Final: Ruling: Real teaching impact, teacher time and paper printing remain unverified — no classroom/device tests — cost: no time-saving or printed-output promise.
Final: Ruling: Semantic answer/identity hidden inside natural-language stems is not automatically certified — field isolation plus explicit teacher approval retained — cost: teachers must inspect student stems and necessary outbound text.
Final: Ruling: Reviewer did not rerun full suites; its independent evidence is code inspection and synthetic leak probes — executor test logs carry suite claims — cost: suite evidence is author-run, not double execution.

Fix-pass regression: first full178 run found existing literal-key malformed-output test requires useful non-sensitive "not JSON" text retained. Kept literal-key replacement before normalized-copy check; encoded-key match still omits full text. Existing test unchanged, full rerun pending. This remains same fix pass, no second reviewer.

Final: fixed diagnostic escaped-key persistence — test_diagnostic_omits_escaped_key_on_truncated_or_malformed_response RED→GREEN; literal-key existing diagnostic preserved; suite178/178. Final runtime code verified, no deferred minors. Browser20/20 and earlier34/16/14 regressions, SymPy fixture exact check, actual live14/14.
Task 3 deployment: old service initially verified v0.5/PID48760 but later offline before backup; no blind kill. Offline backup backup-20261105T143130-f2e296ab.zip, then hidden PID59164 health0.6.0. 3papers/0events/0exercises/10jobs unchanged, keyfalse; actual no sending/prepare. Package pending final allowlist/hash readback.

Task 3: complete — delivery jinxue-local-trial-v0.6.0.zip 52 files/51 manifest entries, independent CRC/hash/duplicate/allowlist checks pass; SHA256 d6b43f7aacc2a59c0f7a11a19493133dd319d4c8fe184c51d00fc4275c894310. v0.5 artifact hash unchanged. No generic long sk-key pattern in packaged bytes; runtime data/profile excluded. Evidence retained because no independent Git. Finishing-a-development-branch skill considered: no project branch/merge exists, package+local upgrade is authorized delivery; no parent Git/menu or destructive cleanup.
