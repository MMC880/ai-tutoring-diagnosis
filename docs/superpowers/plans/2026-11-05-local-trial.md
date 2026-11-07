# 本地试用版连续实施计划

> 执行：按 executing-plans 在当前会话逐项执行，TDD先写关键行为测试，最后独立审查。用户已在原型交付后要求继续并尽量多推进步骤，不重复索取同一授权。

**Goal:** 把当前页面演示推进为可刷新保留数据的单机本地试用版，验证教师审核、档案、统计、练习复测、备份与导出。

**Architecture:** 新建 app/，保留 prototype/。前端调用仅监听127.0.0.1的本地服务，SQLite事务保存不可覆盖的确认与复测历史，附件和备份存单独本地data目录。没有外部AI或收费请求。

**Tech Stack:** Python3.12标准库HTTP服务、SQLite、现有python-docx1.2.0及pypdf6.20.0，普通HTML/CSS/JS；不新增前端框架。Python http.server仅用于单机受限试用，不作公网生产服务。

**Spec:** ../../design/TEACHER_WORKBENCH_PROTOTYPE.md、../../../PHASE1_CONFIRMATION.md、../../../NEXT_STAGE_PLAN.md，以及本轮明确范围。技术选型为实施者在用户授权连续推进下的可调整选择，不伪称此前已选定。

## Global Constraints

- 不改变WorkBuddy旧包、62条事件或原型；不复制其他项目程序。当前项目没有独立Git仓库，使用全新app/隔离，不初始化或提交父目录仓库。
- 原图与转写、判断与错因分别保留；只有教师明确确认才生成确认事件，重复不新增，旧确认不覆盖，过期版本拒绝。
- 原卷、复测与批次分开；待确认/缺失不当错误，一次答对不自动掌握。
- 单机本地、无AI外发、无密钥、无支付；本地试用不等于真实隐私或机构上线验收通过。
- 导入文件不执行；限制类型大小和ZIP展开量，内部文件ID不接受任意路径；HTTP跨站与写入令牌校验。
- 恢复仅对测试数据库执行验证；用户数据恢复必须明确确认并先备份。

## Review Focus

事务失败不产生半份确认；重试幂等且旧版本冲突明确；不同学生/批次不串记录；未批准练习不能复测或导出学生版；上传路径/跨站写入/损坏备份不能绕过。

## Tasks

### 1 数据与文件核心

Create app/store.py、files.py、seed.py；Test app/tests/test_core.py。
Store接口：create_paper(payload)、get_paper(id)、save_paper(id,payload)、confirm(id,version,consent)、summary(batch)、profile(student)、create_exercise(payload)、approve_exercise(id,version,consent)、record_retest(payload)、backup()、restore(id,confirmation)。
文件接口：save_document(root,filename,bytes)返回内部标识与提取状态；不推断识别成功。

- [x] 写持久化、幂等、修订、过期版本、未审隔离、复测前置、批次防混、附件与备份恢复测试，观察缺实现失败。
- [x] 实现SQLite事务、只追加事件、严格字段验证、受限附件与备份恢复，通过测试。

### 2 本地服务与真实导出

Create app/server.py、exporting.py；Test app/tests/test_http.py。
JSON API按操作分路径，GET读取、POST带进程令牌写入。导出复用python-docx；PDF通过浏览器打印专用页，不写伪PDF。

- [x] 写Host/Origin/令牌、附件越界、导出审批限制及有效DOCX测试，先失败后实现。
- [x] 仅绑定回环、限制请求与文件范围，确保数据目录不作为静态目录暴露。

### 3 界面接入与运行

Create app/web/index.html、app.js、styles.css，README.md、启动.cmd、requirements.txt。

- [x] 保持审核主界面，接通真实本地文件、草稿保存、整卷确认、档案、班级、练习审批、复测及备份管理。
- [x] 页面刷新读取数据库，不依赖浏览器内存；AI/OCR未接，提供手工录入和结构化草稿导入。
- [x] 用临时数据目录做浏览器验证：确认后刷新、改判历史、不同批次统计、复测、真实Word与打印页；不以原型检查代替本地版验证。

### 4 审查与交付

- [x] 独立审查，修正重要问题并回归相关测试。
- [x] 合成数据启动本地试用服务；保留源码、运行说明、测试与已知限制，不打包个人数据或临时浏览器资料。
- [x] 同步需求状态，明确完成项与未接模型/真实试点/收费边界。
