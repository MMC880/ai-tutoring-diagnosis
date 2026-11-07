# 同题续录核对助手 Implementation Plan

> superpowers:executing-plans inline; user requests continuous implementation. TDD + one final independent review.

**Goal:** 老师核对并保留同题已录内容与续录步骤，再走现有待审保存。
**Architecture:** continuation-panel.js纯合并/校验+行内预览；visionShowJob挂载按钮，复用原保存、历史与审核。无新后端业务接口。
**Tech Stack:** 现有原生JS、Python/SQLite；不增加依赖。
**Spec:** docs/design/CONTINUATION_DESIGN.md。

## Global Constraints

- 只处理本机当前学生/卷/版本同题，老师明确核对，禁止回退其他题。
- 预览仅填核对表，不写盘、不外发、不确认。旧AI结果保留，保存仍PENDING。
- 题干/作答≤12000字，识别备注≤1500，不截断；默认核清为两段AND。
- 预览与原表字段隔离，编辑清同意，同一行只自动合并一次。
- 无新Schema/服务商/依赖；保留旧流程及父仓库/WorkBuddy历史。

## Review Focus

- 原笔迹、旧识别疑点/notice不能无声丢失，新内容不应被正确答案替换。
- 错号/跨学生/旧版本或预览后题号改变不能把结果填到其他题。
- 合并按钮不得绕过转写同意、整卷审核、调用授权和历史保留。
- 预览字段/人工克隆行不能污染其他行或被错误收集，重复点击不能嵌套追加。
- 异步开窗/页面切换、超长内容和编辑旧同意等边界仍保护老师草稿。

### Task 1 纯文本契约

- [x] check_continuation.mjs RED：保留两段、相同题干、备注/notice、核清AND、空来源、长度、字符串类型。
- [x] composeContinuation/validateContinuation实现，Expected纯JS测试PASS。

### Task 2 核对界面

- [x] verify-continuation.mjs RED：合并预览、取消无变、单独勾选、编辑失效、仅填本行/无写入、保存待审与AI原结果留存、错号/过期来源/重复/人工表/克隆清理/窄屏。
- [x] 界面接现有visionShowJob和handle；新浏览器与照片/辅导回归Expected PASS，全186 Python保持PASS。

### Task 3 交付

- [x] 一次独立审查，Important先RED后修；完整校验PASS。
- [x] 备份、启动v0.8、实际只读验证；说明和新源码包及清单哈希验证。
