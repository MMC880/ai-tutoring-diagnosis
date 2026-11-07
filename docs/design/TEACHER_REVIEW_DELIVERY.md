# v0.9 老师主判入口交付

日期：2026-11-06。对应7步计划第1步的软件增量；真实教师整卷验收状态仍为WAITING_TEACHER。

## 实际变化

- 整卷审核每题新增老师原判、原批注，保留AI候选与本次最终判定三个不同来源。
- 已有老师原判时应用AI文字建议，保留原判与当前老师最终判定，AI意见另列；新AI意见撤销旧分歧核清。
- 原判与候选/最终判定冲突时，确定性成绩须核对说明与明确勾选，后端确认前统一拦截；可以暂留PENDING，不作确定错题。
- 编辑、JSON导入与OCR重新转写分别处理核清状态。旧格式草稿省略字段不清除老师证据；文件不是人工授权；导入不能抹掉识读疑点后直接记错。
- 已有教师证据的题目不能静默删除；已记批注的占位题不因新照片出现其他题号而消失。
- 教师报告与备份保留上述记录，包括只填写核对说明的情况。文字AI默认白名单不带本地原判/原批注/分歧说明。
- 未实施自动认定照片中的红笔作者或自动确认老师勾叉，也未执行真实成绩归档、学生发布或跨次薄弱点诊断。

## 验证证据

| 检查 | 结果 | 证据 |
| --- | --- | --- |
| 新增主判、导入、OCR保留与确认专项 | 18项通过 | app/tests/test_teacher_grading.py；teacher-grading-green.txt |
| 全Python回归 | 204项通过 | teacher-review-python-green.txt |
| 新老师主判页面 | 15项通过 | teacher-review-browser/verification.json |
| 原同题续录页面回归 | 25项通过 | continuation-preview/verification.json |
| 纯JS续录合同及图片来源竞态 | 9项＋来源检查通过 | app/tests/check_continuation.mjs、check_vision_race.mjs执行回执 |
| 实际工作台只读检查 | 18项通过 | v09-live-preview/verification.json |
| 桌面及390px页面 | 本人实际看过，两种布局可读 | teacher-review-browser/01-teacher-review-desktop.png、02-teacher-review-mobile.png |
| 独立代码审查 | 发现问题修复并通过纯内存复核；无新增重大遗漏 | teacher-review-progress.md及本聊天独立审查回执 |

新增测试均有修复前失败证据：teacher-grading-red.txt、teacher-grading-review-red.txt、teacher-grading-legacy-red.txt、teacher-grading-ocr-import-red.txt及teacher-review-browser/red.json。测试为合成/假接口，不替代真实OCR、真实数学质量与老师省时。

沙盒HTTP曾WinError10013，Chrome也未能在沙盒启动；隔离回环测试转在许可后的环境运行通过，没有修改代理/全局配置。实际只读脚本从v0.8复制时曾遗留后端旧版号断言，已修正为0.9.0后重跑18项通过，未据错误断言改动产品逻辑。

## 本机更新

- 地址：http://127.0.0.1:8765/#review，后端健康回读0.9.0，页面标示0.9；新grading-panel.js实际提供。
- 确认原监听为本项目Python进程43044，原会话无密钥、无运行中任务；已创建本机安全备份后才更新至新进程76348，窗口隐藏，仍仅回环监听。
- 更新前备份：backup-20261106T084011-68b30712.zip，位于app/.local-data/backups。SHA-256：99c83272fe0ff12139b39c67b92da758142ca96fa3b6664e7a9093d33603f197。该备份含原本机资料，不进入交付包。
- 更新前后均为3份原试卷、0条确认事件、0份补练、10条历史AI任务；所比较业务快照SHA-256均为cf6034b5e87a912ec026b9d3eb00a616e30841ead4f4da8cebe60563294c9433。
- 实际只读UI检查也确认试卷和确认事件未改；没有读取或复用聊天旧密钥，没有新增模型调用。见teacher-live-before.json、teacher-live-after.json。

以上为本次回读的时点状态，不保证其他进程日后持续运行。

## 交付包

docs/delivery/jinxue-local-trial-v0.9.0.zip：55文件，MANIFEST54/54、ZIP CRC通过。SHA-256为c56401e49207d55335a914936b56e855600eaf3c466f8f9ab72f84f2878569c5，详见docs/delivery/LOCAL_TRIAL_PACKAGE-v0.9.0.json。

按v0.8源码白名单增补4个源码/说明文件，并以3份当前检查记录替换旧证据；未遍历复制业务库。包不含.local-data、真实照片、试点报告、凭据或浏览器目录。旧v0.8包保留。

操作说明：app/老师主判使用说明.md。工作代码直接保留在原独立项目内；项目无Git，未初始化仓库、合并、推送或部署公网。

## 7步计划中的实际位置

第1步：软件入口与保护规则已交付；一名真实学生整卷仍需老师确认，不以测试代签。已有真实照片初查不是正式成绩记录。

下一步：推进第2步每生独立档案的真实可追溯验证；第3步教学参考资料导入随后细化。教案暂缺时可以继续现有档案能力，不虚构资料导入通过。此次没有声称三级新题真实教学效果、完整初中覆盖或10人净省时已经验收。
