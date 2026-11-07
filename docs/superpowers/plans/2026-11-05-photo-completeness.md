# 照片响应接收与题号完整性 Implementation Plan

> 使用superpowers:executing-plans连续实施，TDD先RED后GREEN，最后独立审查。用户已明确继续开发。

**Goal:** 改进整页照片响应接收，明确漏识别题，保留原作答与教师整卷审核。
**Architecture:** 新增ai_stream.py解析有界SSE；AIService图片配置和PartialResponse状态适配；vision.py负责本地清单／合并约束；Store恢复验证；原网页增加清单与覆盖提示。
**Tech Stack:** 现有Python/urllib/SQLite/Pillow/原生JS/Chrome，无新运行依赖。
**Spec:** docs/design/PHOTO_COMPLETENESS_DESIGN.md、PRD.md R30、docs/adr/0002-photo-to-targeted-practice.md。

## Global Constraints

- 默认image_stream=false，不更换模型、不自动重试、不加Token预算；真实渠道支持未知。
- SSE只保存final content，不保存reasoning或执行tools；不完整为UNKNOWN，usage按实际已收到值。
- 45秒阻塞空闲限制；流块间120秒总耗时检查（末次读取可再阻塞45秒）；1MB响应/256KB单行/100000字符最终内容。
- 清单仅本地、1～100项唯一非空题号，每项≤40；与单题目标互斥；漏题PENDING，不能记为不会。
- 仅合成数据，待审不归档；身份和完整档案留本地；旧包与WorkBuddy记录不改。
- 无独立Git仓库，计划/证据/白名单源码包记录，不操作父仓库。

## Review Focus

- 流式结束缺[DONE]、有usage却内容不完整：不能误判成功或丢用量。
- reasoning、tools和异常原文不能进入老师内容或密钥记录。
- 识别少题或读错号：不丢清单项、不把参考答案当作答、不改其他题。
- 恢复未应用任务或人工兜底：不绕过清单约束，旧备份仍可用。
- 清单/接收设置改变后，不能复用旧选区的同意、图片验证或外发预览。

### Task 1 分段接收

Files: app/ai_stream.py、ai_service.py、tests/test_ai_stream.py、tests/test_ai.py。
Interfaces: read_sse(response,clock=...)返回普通ChatCompletion字典或IncompleteResponse(usage,code)；image_stream布尔配置。
- [x] 先测UTF8跨块、心跳、content合并、usage尾块、缺DONE/terminal、截断、工具调用、字节/行/时长上限，Expected RED。
- [x] 实现有界解析，HTTPTransport按Content-Type接收，不重发；AIService保留中断usage，配置指纹绑定。
- [x] 全套Expected PASS，日志写docs/design/photo-completeness-tests.txt。

### Task 2 完整性清单与待审合并

Files: app/vision.py、ai_service.py、store.py、tests/test_vision.py。
Interfaces: metadata.expected_question_ids可选；result.coverage四类题号；merge_transcription生成缺口PENDING。
- [x] 先测缺题、清单外号、纠正后归并、只改清单、人工兜底、重复ID、无清单兼容和恢复拒绝错误快照，Expected RED。
- [x] 实现解析/应用约束及恢复验证，旧作答保留并标明需再核对。
- [x] 全套Expected PASS。

### Task 3 老师界面与交付

Files: web/vision-panel.js、ai-panel.js、app.js、tests/browser_fixture_server.py、docs/design/verify-photo-completeness.mjs、文档和白名单构建脚本。
- [x] 浏览器先RED：分段配置、清单预览、三识一漏保留PENDING、来源版本可见、编辑重新授权、无清单不假报完整。
- [x] 实现并用隔离假接口验证；复跑既有图片/单题/失败/原流程检查。
- [x] 独立审查Important先RED修复；全套PASS后备份、只重启本机项目、只读验收、v0.4源码包哈希检查。无真实外发。

执行动作完成，真实服务流式兼容与手写／整页可靠性仍未验收；以PHOTO_COMPLETENESS_DELIVERY.md的实际范围为准。
