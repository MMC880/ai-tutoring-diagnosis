# Agent作业归档 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在现有独立Agent窗口跑通拖材料、明确教师指令、实际归档、回执和本地历史查询。

**Architecture:** 本地指令解析及受控归档优先于模型对话；SQLite存流程及来源，按SHA-256保留原件。沿用学生索引和学科目录，旧版不动，当前模型对话/笔记工具保留。

**Tech Stack:** 现有FastAPI、SQLite、Pillow、React/TypeScript、assistant-ui、Electron；PDF页数复用旧版同一pypdf固定版本。

**Spec:** v2/requirements/AGENT_INTAKE_SPEC.md

## Global Constraints

- 一次一个学生的一份作业；12份以内、单文件15MB。
- 教师明确提供、AI候选／待老师确认分开；不以OCR成功为前提。
- 缺日期待补、重名询问、新生询问创建、重复材料不静默新增。
- 不改app/及packaging/；不调用外部模型处理真实材料，不配置密钥。

## Review Focus

- 日期/分数数字和否定、转述、疑似表达不得变成教师错题。
- 同名不同班和已选学生与文字冲突，不能错归。
- 超大/损坏/改扩展名文件不能阻塞保留原件，也不能虚报可预览。
- 重发、并行重复、部分重叠、写入失败不得增加重复已完成记录。
- 未关联知识点、待补日期、AI候选不混入错误统计。

### Task 1: 本地写档与历史工具

**Files:** Create `v2/backend/intake.py`, `v2/backend/instruction.py`, `v2/backend/test_intake.py`; Modify `v2/backend/archive.py`, `v2/backend/main.py`, `v2/backend/requirements.in`, `v2/backend/requirements-lock.txt`.

**Interfaces:** `IntakeService.submit(request_id, instruction, files, student_id=None, subject='math') -> dict`; `resolve(flow_id, student_id=None, confirm_create=False, instruction=None) -> dict`; `history(text, student_id, subject) -> dict|None`。响应包含状态、流程ID、明确问题、候选/回执及可验证来源。

- [x] 写API行为测试：三图教师3/5/8归档、SHA原件一致、重启回读、重复无新增、歧义无写档、日期/题号不串、候选来源分离、保存失败不成功、PDF页数与损坏图可归档。
- [x] 运行`.venv/Scripts/python.exe -X utf8 -B -m unittest backend.test_intake -v`，观察缺失接口失败。
- [x] 实现有界解析、班级匹配、不可覆盖对象、事务与回读、回执及本地查询。保留旧读写兼容。
- [x] 跑完整backend测试，检查diff；与本轮前端闭环一并提交，避免交付半套入口。

### Task 2: 独立Agent内一条归档流程

**Files:** Modify `v2/src/main.tsx`, `v2/src/style.css`; Create `v2/scripts/verify-intake.mjs`、交付记录。

**Interfaces:** 复用Task1 multipart归档/澄清接口；普通分析仍走`/api/chat`。上传列表保留到归档成功/明确清除，歧义在一张卡中解决。

- [x] 增加真实Electron合成材料行为回归：三张DOM拖图→输入指令→新建学生确认→回执→重复提示→本地查询→重新打开回读、PDF清单；先观察旧UI失败。
- [x] 实现发送分流、文件列表/预览和最少澄清卡，禁用处理中的重复发送/更改。
- [x] 跑TypeScript/Vite构建、后端全套、既有Agent/模型mock及新Electron回归，实际看截图。
- [x] 新上下文审查本轮差异，修复重要问题；补文档，检查敏感信息；本计划随通过验证的完整闭环提交。

## Execution ledger

用户已授权合理默认方案与继续开发；本轮详细流程是范围依据，直接执行，不再重复需求访谈。

最终39项后端、8项归档Electron、12项窗口、11项模型工具Mock及构建／pip check通过。新上下文审查发现跨学生history污染、来源矛盾／转述、旧手工记录查询缺失；均先复现失败，再修复转绿。限制及临时证据位置见`v2/requirements/AGENT_INTAKE_DELIVERY.md`。未调用真实模型、未修改旧版代码或资料、未封装新EXE。
