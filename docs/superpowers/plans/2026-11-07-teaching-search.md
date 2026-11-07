# 教学知识查找 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Inline implementation, one independent review at end.

**Goal:** 老师搜索并核对准确知识出处，再明确关联原题待审草稿。
**Architecture:** teaching-catalog.js纯过滤与受限窗口；复用teaching/catalog、固定版本读取和teaching-panel行回填。无数据库迁移、新接口或模型调用。
**Tech Stack:** 原生JavaScript，已有Python本机服务、Node和CDP合成测试。
**Spec:** docs/design/TEACHING_SEARCH_DESIGN.md

## Global Constraints

每页20项，无静默截断；多词AND纯文本匹配；资料按ID筛选；初始/过滤/翻页后选择为空；仅待审草稿，不自动保存/确认。窗口、选择或原卷变化使迟到响应失效；固定历史来源不自动换新版本。本地提交，不合并main或推送。

## Review Focus

同名资料/条目不能混；大目录末页必须可达；过滤后旧选择不能回填；读取中切窗口/学生/选项不能覆盖；来源读取失败/旧审批版本必须保持准确且不自动写入。

### Task 1: 纯搜索与分页

Files: app/web/teaching-catalog.js、app/tests/check_teaching_catalog.mjs。
Interface: filterTeachingCatalog(entries,query,materialId,page=1)返回total/pages/page及{index,entry}的rows；索引对应完整原目录。
- [x] RED运行新Node测试，Expected:实现缺失导致失败。
- [x] 实现NFKC/空白/大小写、多词AND、资料ID和20条分页；Expected:全部新Node测试通过。

### Task 2: 查找窗口与关联守卫

Files: teaching-catalog.js、teaching-panel.js、app.js、index.html、styles.css、server.py；docs/design/verify-teaching-search.mjs。
Interfaces: teachingCatalogOpen(entries,context)、teachingCatalogChanged(element)、teachingCatalogHandle(action)、teachingCatalogBind()；保持#teaching-catalog-select和原关联action兼容。
- [x] 新浏览器RED，Expected:搜索输入不存在。
- [x] 接入搜索/资料/分页/预览，固定来源回读与上下文守卫；版本0.24。
- [x] 新浏览器GREEN，教学库/学生档案/报告/待办等受影响回归；完整Python、全部Node检查。Expected:全绿，合成零自动保存/确认/AI。
- [x] 一次独立整轮审查；重要项先RED后修复并全量回归。Expected:无遗留重要问题。

### Task 3: 本机验收与交付

Files: 相关说明、README、两份进度、交付/备份和打包脚本。
- [x] 记录完整本地备份及身份、密钥/活动任务检查，再更新；只读实际验收。Expected:0.24且业务摘要不变。
- [x] 基于0.23白名单打包，清单/CRC/源码字节/敏感路径核对。Expected:排除真实业务资料、密钥与备份。
- [x] 显式暂存并本地提交。Expected:干净工作区，保留分支，不合并/推送。
