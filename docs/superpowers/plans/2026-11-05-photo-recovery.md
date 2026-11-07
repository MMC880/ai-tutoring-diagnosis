# 图片失败处理与单题归属 Implementation Plan

> 使用 superpowers:executing-plans 连续实施；先失败测试，后实现，最后独立审查。已有连续开发授权。

**Goal:** 让老师知道识图失败原因，并能安全地分题继续处理同一学生整卷。
**Architecture:** AIService保存无原文的outcome摘要与耗时；vision.py约束可选target_question_id；网页沿用既有裁切与核对弹窗。无需数据库迁移。
**Tech Stack:** 现有Python、SQLite、Pillow、原生JavaScript与Chrome。
**Spec:** docs/design/PHOTO_RECOVERY_DESIGN.md、PRD.md、TEACHER_WORKFLOW.md。

## Global Constraints

- 密钥仅进程内存，外发逐次授权，无自动重试，未知费用保持未知。
- 单题目标仅当前卷已存在题号；自由区域模式兼容初次转写。
- 未核清识别不能记对错；所有应用仅新待审，不归档或发布。
- 仅隔离合成数据；保留v0.3包、本机资料和WorkBuddy62条历史。
- 无独立Git仓库，使用项目内计划与证据文件记录，不创建或修改父仓库。

## Review Focus

- 目标Q03而模型报Q01：不能覆盖Q01，必须明确识别疑点及老师改号。
- 从失败旧任务回到当前卷：不能借旧版本授权写入新卷或自动发送。
- 自由模式旧任务与备份：新增可选元数据不能破坏旧格式；单题已核对记录恢复不得写错题。
- Transport异常：只有确实TimeoutError才写超时，别把所有UNKNOWN都归为超时。
- 人工兜底与修改后的同意勾选：不得绕过目标限制或复用旧勾选。

### Task 1: 有证据的失败摘要

Files: app/ai_service.py、app/tests/test_vision.py。
Interfaces: send()新增metadata.outcome={code,summary,next_step,elapsed_ms}，不改变status/usage/result契约。
- [x] 先测超时、非超时、截断、非JSON、接口拒绝和旧任务无摘要；运行须FAIL在缺少outcome。
- [x] 实现不含原文的固定摘要与单调时钟耗时，保留原诊断脱敏。
- [x] 运行照片单测与全套自动检查，Expected PASS。

### Task 2: 单题归属及失败后继续

Files: app/vision.py、app/ai_service.py、app/store.py、app/web/vision-panel.js、app/web/app.js、app/tests/test_vision.py。
Interfaces: prepare(mode=vision_transcribe,target_question_id?:str)，元数据持久化；apply和manual-transcription必须遵守目标。
- [x] 测错误目标、两题返回、读错题号、人工跨题、正确改号保留原读号和其他题、备份恢复目标校验，Expected RED。
- [x] 实现prepare/parse/apply/restore约束；无目标保持兼容。
- [x] 实现逐题按钮、目标选择、结果归属展示和失败分题入口；每次重新选图与授权。
- [x] 隔离浏览器验证错误题号纠正、其他题不变、失败入口和无外部网络，Expected PASS；复跑15/34/10现有浏览器检查。

### Task 3: 交付

- [x] 独立审查；重要发现先RED复现后修正，全套PASS。
- [x] 升级本机前备份，确认无发送中任务，只重启本项目服务；不重新装载聊天密钥。
- [x] 文档、源码v0.3.1白名单包与SHA-256校验；明确超时诊断不等于整页识别通过。

执行动作已完成；Minor预览归属/版本提示暂缓，见progress与交付报告，不据此宣称全产品或整页OCR通过。
