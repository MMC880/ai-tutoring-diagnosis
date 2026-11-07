# 日期功能进度

BASE a5c7564，初始干净，feature/assignment-date-v025在原目录继续；沿用用户本地提交、不覆盖资料、不推送约定。
Pre-flight: Task1 date_at按原卷revision供Task2历史显示，不读取当前值替代；Task2更新只修改日期并增加版本，不复用旧questions覆盖；Task3先完整备份再创建空表，检查9表摘要及新表0行。
Task1 in progress。基线389测试进行中。

Task1 original16 + HTTP1 + browser18 GREEN. First temporary-backup probe test left sqlite connection open on Windows; test helper corrected to explicit close, actual restore assertions passed. Existing confirmation-time label retained as“确认时间（写入）”to keep JS contract while adding separate assignment date.
Final review: reviewer review_assignment_dates_v025, Critical0/Important2/Minor0; cross-Store version race and tampered duplicate/missing-constraint restore both reproduced RED. Added3 tests incl distinct no-constraint case. CAS papers update with version predicate+rowcount check and date-table schema/uniqueness restore checks make19/19 GREEN. Final whole409 suite and browser regressions running.

2026-11-08 reconnect: uncommitted work preserved, commit stilla5c7564. Earlier execution cell did not apply final native-date guard; checked files before resuming. Native Backspace produces badInput=true/value='', save was enabled and intake created unknown date; both real-keyboard RED evidence retained. Guard date validity before enabling/submitting and before create; explicit empty remains allowed. Same final fix pass continues before delivery.

Final verification2026-11-08: full409/409 (127.487s), date-browser20/20; seven Node scripts and six old browser suites all pass. Native invalid-date edit/intake both RED→GREEN. Desktop/390px screenshots inspected. Independent review2 Important fixed, no deferred minors.
Task1/2 complete. Task3 complete: full pre-update backup retained; live0.25.0 39/39, old9-table business digest unchanged, date table0 rows. Delivery120/110source/119hashes CRC and current-byte checks pass. Keep branch local per AGENTS; explicit commit next. No real confirmations, dates or AI calls.
