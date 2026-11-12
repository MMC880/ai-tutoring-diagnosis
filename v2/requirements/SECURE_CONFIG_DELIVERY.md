# 模型配置安全保存与真实接口测试回执

日期：2026-11-12。交付版本：`2.0.0-preview.4`。工作目录：`E:\GPT\jinxue-student-first`。

**结论：本机安全保存及软件退出重开恢复已通过；真实模型认证未通过，返回 HTTP 401，Agent 自主工具调用尚未验收。** 本轮没有开发三级训练、正式档案确认流程或重构 Agent。

## 本次实际改动

- 使用 Windows 当前用户 DPAPI 加密完整的接口地址、模型名和 Key；Python 标准库调用系统 API，没有安装新依赖。
- 正常桌面启动时恢复配置，但不自动测试、不发送学生资料；重开后的 Key 输入框仍为空，不回显密钥。
- 设置弹窗增加“在这台电脑记住配置”、存储状态、“测试当前连接（无需重输Key）”和“清除密钥与本机保存项”。连接状态与保存状态分别显示。
- 未勾选记住时只在当前进程使用，同时移除旧保存项；修改地址或模型须重新输入 Key。清除失败明确提示，不假报已经删除。
- 密文临时写入后替换；损坏/不支持的配置不激活，不退回明文。通用 `create_app()` 与裸 ProviderService 保持默认无持久化；只有显式桌面 factory 注入存储。
- 现有桌面回归脚本使用独立的合成配置路径，避免测试清除老师保存项。

保存位置由 Windows known folder 解析：`%LOCALAPPDATA%\JinxueStudentFirst\provider-config.dpapi`。本机当前文件为 502 字节，仅为密文。它位于学生资料目录之外，不进入学生业务备份、MD、SQLite 或交付 ZIP；更新软件或切换学生资料目录不改变这份保存项。

DPAPI 保护磁盘静态配置，实际调用时仍需解密到后端内存；它不防同一 Windows 用户下的恶意程序。当前 provider 路由沿用 loopback、Host 与 CORS 边界，未额外增加桌面令牌认证。只验证本机同用户的软件进程重启，未执行 Windows 重启/注销、跨用户、跨电脑或断电恢复测试。

## 真实调用结果

固定地址：`https://discovery-api.intern-ai.org.cn/v1`；模型：`deepseek-v4.1-flash-1017`；请求：`POST /chat/completions`，Bearer 认证。

用户提供的测试 Key 已按原样保存，**保留末尾竖线字符**，没有自行删改或换用历史密钥。Key 不出现在此报告、命令行参数、环境变量、明文文件或接口回读中。401 说明这次请求未通过身份验证，不能仅凭该状态断定是哪一个字符、权限、有效期或账号状态导致。

| 实际动作 | 结果 | 证据（相对 v2） |
| --- | --- | --- |
| 本机隐藏输入，DPAPI 保存，主动发一次无学生资料探针 | 保存成功；接口 401 | `.qa-temp/provider-live/20261112T125007598548Z/result.json` |
| 已打包 EXE 两次启动，恢复后主动点“测试当前连接” | 恢复成功、Key 框空白、零启动自动 POST；主动测试 401 | `.qa-temp/provider-restart/1794487986697/result.json`、`restored-settings.png` |
| 两次合成数学作业的真实历史分析请求 | 第一条模型请求 401；无模型回答、无工具调用、无待确认 MD | `.qa-temp/history-live/20261112T125758935007Z/result.json`、`model-calls.jsonl` |

合计 **3 次真实外部请求，均为 401**；没有自动重试、备选模型或模拟回复来补成功。历史测试首次还发现脚本把 `id` 误作请求字段，而生产接口需要 `student_id`，因此在本地“未选择学生”就停止：`.qa-temp/history-live/20261112T125407698381Z/result.json`，外部调用 0 次。只修正该测试入口并增加范围断言后，才产生上表第三次真实请求，未改业务工具循环。

历史样例为先前生成的两张合成题图及结构化记录，**不是用户真实学生的手写卷面**。真实请求在首轮认证即失败，没有请求或发送历史图片。源样例及隔离副本的正式文件前后不变，无新增笔记。不能宣称看图、知识点关联、自主工具选择或 MD 保存已经真实模型通过。

## 可复查的本地测试

以下命令均在 `v2/` 下执行。生成证据位于忽略目录，保留在本机，不提交学生数据/日志。

| 命令/验证 | 实际结果 | 证据 |
| --- | --- | --- |
| `.\.venv\Scripts\python.exe -X utf8 -B -m unittest discover -s backend -p 'test_*.py'` | **74/74 PASS**，13.631 秒 | `.qa-temp/secure-config-backend-final.log` |
| 其中 `backend.test_provider_store` | **10 项 PASS**；真实 DPAPI 1/2560/2561/4096 字符、新 Python 进程逐字恢复、清除、损坏、替换/删除失败、业务备份排除等 | 上述后端日志及测试源码 |
| TypeScript + Vite 生产构建（打包脚本内） | PASS | `.qa-temp/secure-config-build.log` |
| `node scripts/verify-ux-home.mjs` | **12/12 PASS**；连接成功场景使用合成 transport，非真实服务 | `.qa-temp/ux-home/1794487865295/result.json` |
| `node scripts/verify-provider-restart.mjs <新版EXE>` | **5/5 PASS**；真实 EXE 三次启动，保存恢复、UI 清除、再次启动不恢复；合成 Key，独立密文 | `.qa-temp/provider-restart/1794487587995/result.json` |
| `node scripts/verify-provider-restart.mjs <新版EXE> --saved-real-config` | 恢复两项 PASS；真实连接 FAIL 401；未清除用户保存项 | `.qa-temp/provider-restart/1794487986697/result.json` |
| `node scripts/verify-learning.mjs <新版EXE>` | **12/12 PASS**；含资料/知识点/更正/备份恢复/重开 | `.qa-temp/learning/1794488274765/result.json` |
| `node scripts/verify-intake.mjs <新版EXE>` | **8/8 PASS**；含多图、归档、查询、重复提示及学生隔离 | `.qa-temp/intake/1794488281962/result.json` |

已实际查看真实恢复设置截图。UI 自动测试使用合成学生；部分系统目录对话框选择被测试替身代替。工程回归不等于教师易用性、识别准确率或教学效果验收。Vite 大包及 Starlette/httpx 弃用警告仍保留，未因此升级依赖。

`verify-provider-live.py` 是显式真实调用入口：首次保存只接受真正交互控制台隐藏输入；已有保存项则停止，避免覆盖。`--history` 只复用本机已授权且地址/模型完全匹配的加密配置，历史 runner 本身不接入持久存储，结束清理不会删除老师的保存项。运行会消耗真实接口额度，不作为自动回归执行。

## 新版使用及停止点

交付目录：`docs/delivery/v2-secure-config-20261112/`。将 ZIP 全部解压到可写目录，运行其中 `JinxueZhifu.exe`，不能只复制 EXE。

归档文件：`JinxueZhifu-2.0.0-preview.4-Windows-x64.zip`，183,544,079 字节；SHA-256：`207aabb64606ac14ebe23e7078527195b80b807d6f90c8f7fa5ba44c68b90f27`。已检查 ZIP CRC、无重复条目、786 个条目完整一致，785 个程序文件的哈希与实测目录逐一相符；说明书与源文件相符，未带入学生库/加密配置。对源码及相关文本证据进行了密钥形态检查，未检出；此检查不等于全面泄露证明。交付目录中的 `RELEASE_CHECK.json` 保留结果。

当前电脑、当前 Windows 用户已保存本次测试配置。打开右上方“AI 服务设置”，应看到“已从本机Windows加密存储恢复配置”；Key 框空白是正常保护。可点“测试当前连接”主动测试。更换有效凭据时重新填写，勾选记住，再点“配置并测试文字连接”。本轮不继续发送已返回 401 的凭据。

旧版 EXE 不会自动更新，原学生资料和旧包均保留；若新解压目录未显示原学生，请沿用已有资料目录选择流程，不能覆盖/删除旧 `JinxueData`。密钥与学生资料目录分别管理，学生备份恢复不恢复密钥。

**下一阶段条件**：在同一明确授权的服务上配置能够通过认证的凭据，重新跑真实历史工具/图片/MD 验证；只有真实结果合格后，再讨论待确认分析进入正式档案。本轮到此停止。
