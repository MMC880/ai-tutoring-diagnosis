# 原题补讲与三级练习候选 Implementation Plan

> superpowers:executing-plans连续执行，TDD先RED后GREEN，一次最终独立审查；用户已持续授权。

**Goal:** 从已确认原题生成六步教案和三级练习候选，经老师选择后仅建草稿，接既有审批／复测。
**Architecture:** tutoring.py契约/恢复；AIService新模式；Store同事务建练习；tutoring-panel.js接现有AI预览及练习编辑。
**Tech Stack:** 现有Python/SQLite/原生JS，复用AI和SymPy校验工具，不新增运行依赖。
**Spec:** docs/design/TUTORING_DRAFT_DESIGN.md，PRD R09/R10/R18/R30。

## Global Constraints

- 仅当前已确认I/P原题，无识别疑点；一题必要材料逐次预览授权，档案/身份映射不外发。
- 六段教案每段最多2000字；三个固定档各一题，每个题干/答案/讲解最多2500字；组合教师讲解≤12000字。
- 不自动审批／发布，不自称数学已验证；任务结果仅候选。失败不重试，预算不自动增加。
- 每任务每档幂等创建DRAFT并原子记映射；其他档另行明确选择。
- 来源版本改变阻断新应用；同档旧映射仅返回既有练习，不覆盖修订。
- 旧备份兼容，新恢复验证源快照及练习创建版本内容。仅合成测试，不给本机卷伪造确认。
- 无独立Git，计划／证据／白名单包记录，不动父仓库和WorkBuddy历史。

## Review Focus

- 响应自称APPROVED/verified或夹杂工具与身份，不能越过教师审批或泄露教师答案到学生版。
- 来源变更与重复点击并发不得重复创建或把练习挂到其他题。
- 创建成功但映射失败时要整体回滚，恢复旧备份不导致已尝试任务重发。
- 后续练习V2／旧版审批不能破坏原候选映射与合法恢复，损坏映射必须在替换前拒绝。
- 隐藏候选表单不得混入整卷保存，离开有未保存修改时保留既有保护。

### Task 1 辅导契约与原子应用

Files: tutoring.py、ai_service.py、store.py、server.py、tests/test_tutoring.py。
- [x] RED：来源未审/正确/疑点/过期，最小payload，无自动写档，六步/三档校验，同档幂等/不同档独立/改判阻断，事务回滚，恢复坏映射和合法修改，学生版无教案答案。
- [x] 实现模式、同事务建练习与映射、接口，Expected全套PASS。

### Task 2 老师界面

Files: tutoring-panel.js、ai-panel.js、app.js、index.html、browser_fixture_server.py、verify-tutoring-draft.mjs。
- [x] 浏览器先RED：预览只一题，来源可见，教案六步/三档展示，必须选档＋同意才应用，草稿不批准，重复不增，审批后导出/复测接旧链。
- [x] 实现，统一旧知识点文案；新浏览器与主流程/照片/持续问题回归PASS。

### Task 3 交付

- [x] 一次独立审查，Important先RED修正后全套PASS；SymPy仅核可信合成案例。
- [x] 备份/启动v0.6，实际页面只读验证不新增确认；文档及源码包哈希核验。
