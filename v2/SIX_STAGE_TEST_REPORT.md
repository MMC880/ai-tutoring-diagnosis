# 晋学智辅2.0六步试用交付测试报告

日期：2026-11-10。版本：`2.0.0-preview.1`。现有项目：`E:\GPT\jinxue-student-first`，分支`tooling/v2-environment`，本轮基线`8cea5d0`。仅本机、隔离合成档案；没有读取真实学生资料或使用聊天中旧密钥。旧`app/`与`packaging/`未改。

## 实现范围

|步骤|已实现并验证|限制|
|---|---|---|
|1 Agent收件|图片/PDF原件保存、哈希、去元数据分析副本、可理解的失败提示|PDF只本地保存；模型最多3图；无法解码可归档但不可分析|
|2 知识点关联|作业/题号/原件哈希/页码/引用依据；候选与教师确认分开；修订保留|当前教师填写原图位置，未自动整卷定位|
|3 个人和班级|跨不同作业计次、班级/学科隔离、覆盖分母、已归档班级选择|依赖确认关联，单次错误不认定长期薄弱|
|4 补练和复测|讲解+三档草稿、审核、无答案题面、独立复测、失效历史保护|仅顶点式内置演示；其他知识点手工JSON，非完整生成引擎|
|5 本地可靠性|待办续接、追加更正、一致备份/清单、仅空目录恢复、重开回读|单进程；不自动迁移；真实对话关闭/刷新清空，已保存摘要保留|
|6 Windows便携包|生产React、冻结Python、真实EXE与独立Agent窗口、退出清理|整个文件夹分发；未代码签名；未在另一台干净机器验收|

## 真实运行证据

从工程`v2/`执行：

```powershell
.\.venv\Scripts\python.exe -X utf8 -B -m unittest discover -s backend -p 'test_*.py'
.\.venv\Scripts\python.exe -X utf8 -B scripts/package-windows.py build ..\docs\delivery\v2-preview-20261110-r3
node scripts/verify-learning.mjs ..\docs\delivery\v2-preview-20261110-r3\JinxueZhifu\JinxueZhifu.exe
node scripts/verify-intake.mjs ..\docs\delivery\v2-preview-20261110-r3\JinxueZhifu\JinxueZhifu.exe
.\.venv\Scripts\python.exe -X utf8 -B scripts/package-windows.py archive ..\docs\delivery\v2-preview-20261110-r3
```

- 后端56/56，TypeScript/Vite生产构建成功；Starlette测试适配器弃用警告、主JS785.89kB体积警告仍存在，未据此升级依赖。
- 打包学习链12/12：`v2/.qa-temp/learning/1794322161445/result.json`。
- 打包Agent链8/8：`v2/.qa-temp/intake/1794322237595/result.json`。
- 窗口实际运行，原件实际下载且字节一致，SQLite/Markdown回读，备份恢复后重新运行同一EXE验证更正和2条复测历史。
- 实际查看打包主窗口及390×600的Agent截图；并非只做网页静态检查。
- 选择目录测试在主进程提供选择结果；拖图用DOM DataTransfer；跨学生外发请求用本地拦截观察。这些不冒充真人操作或真实AI验证。
- ZIP逐成员校验、程序哈希及ZIP哈希见交付目录`RELEASE_CHECK.json`、`MANIFEST.json`、`SHA256.txt`；程序785个文件、422,791,679字节未压缩。

## 交付与资料位置

交付：`docs/delivery/v2-preview-20261110-r3/JinxueZhifu-2.0.0-preview.1-Windows-x64.zip`。包内说明书`JinxueZhifu/START-HERE.md`，源码说明书`v2/WINDOWS_TRIAL_GUIDE.md`。

ZIP为183,524,229字节，SHA-256：`9d186168a7d2b1106cf80b9c57e905147175348e4a6f88c296441e1547bfa710`。交付前再次计算一致；本轮源码/文档文件的常见密钥模式扫描为0命中，`git diff --check`通过。

完整解压后双击`JinxueZhifu.exe`，默认资料为EXE旁`JinxueData/archive`。不需用户执行Python/Node命令，但尚未在移除开发工具的干净系统测试。测试使用单独环境指定资料目录，未写入用户真实档案。端口为本机8019/5179，退出会关闭自己启动的服务。

## 未验证及下一轮目标

1. 真实供应商文字/视图/工具调用、延迟、费用和错误恢复；API设置入口已有，本轮没有新真实调用。
2. 老师能否无需指导完成一次归档→查看记录→复习，净省时和教学效果；当前页面仍有较多控件，需真实试用。
3. 另一台无Python/Node的Windows电脑、真人系统拖拽、目录对话框点击、实际打印、强制断电场景。
4. 完整OCR、课程知识库、全学科训练质量、自然语言生成题目直接纳入审核流程尚未完成；四科入口不等于四科教学库。
5. 仅分析副本JPEG受2MB限制，Provider重编码PNG后的最终图片载荷未设上限，可能影响带宽/费用/供应商限制。主JS体积仍可优化。

不能据这些合成测试宣称批改准确率、真实模型识读质量、老师易用性或学习效果通过。重要审查问题已复现修复，取舍和剩余小项见`v2/requirements/SIX_STAGE_DELIVERY.md`。本轮按既有本地Git约定保留工作区及分支，不推送、不合并旧版，不自动扩展到家长端。
