# 同批连续审核 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 老师在整卷审核中看本批状态，并安全打开下一份同批待审卷。
**Architecture:** 新review-flow.js复用/api/intake及现有papers/bootstrap读取，接原审核页与事件处理，不新增后端接口或数据表。
**Tech Stack:** 原生JavaScript/CSS、现有Python本机服务。
**Spec:** docs/design/BATCH_REVIEW_DESIGN.md

## Global Constraints

逐人整卷确认、不自动跳转确认/保存；同批按学生编号现有顺序循环，跳过当前及已确认；未知人数/页数不猜；本地Git提交，不推送或合并main。

## Review Focus

当前卷未确认但其他均已确认，不得称全部完成；目标状态变化不得错跳；请求中新编辑不得被覆盖；进度失败不得启用旧按钮；切页/补交后缓存失效保持既有规则。

### Task 1: 选择规则与审核入口

Files: app/web/review-flow.js、app/web/app.js、app/web/index.html、app/web/styles.css、app/server.py（静态白名单）；docs/design/test-review-flow.mjs。

- [x] 纯JS规则先RED：无候选、跳过确认/自己、同批顺序循环、来源不在批次；实现选择和只读进度。
- [x] 接入当前审核页及手动下一份，重读当前/目标/最新bootstrap核对，保留未保存确认。

### Task 2: 交互验证与审查

Files: docs/design/verify-review-flow.mjs；现有档案/批次/补交回归。

- [x] 浏览器新入口先RED，测试确认留当前、循环、不跨批、当前待审提示、目标变化、读取失败、未保存取消、编辑/切页迟到保护、窄屏。
- [x] 完整Python/现有关键页面回归，一次独立审查；实际问题先复现后修复。

### Task 3: 交付

- [x] 本机更新前备份与密钥/活动任务/进程核准，0.19更新后业务摘要不变并只读页面检查。
- [x] 操作说明、源码白名单包/完整测试证据校验，显式暂存并按AGENTS本地提交。
