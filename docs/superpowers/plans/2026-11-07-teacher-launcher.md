# 教师启动与环境预检 Implementation Plan

使用executing-plans与TDD，最终独立审查。作为试点准备的实际操作补缺，不新增业务模块。

设计：启动.cmd用原生CMD寻找已有Python（显式JINXUE_PYTHON、本目录.venv、PATH、py、当前用户已有Codex内置运行时），跳过不可用候选；不安装软件、不更改PATH/执行策略。有效解释器运行launcher.py做版本/依赖导入预检。

launcher.py只通过127.0.0.1检查服务。新增只读/api/launch-info返回本项目目录和数据目录，不访问学生档案或密钥。同项目且同数据目录的已运行服务直接复用；端口冲突或身份不明只提示，不结束进程或改端口。无服务时隐藏启动本项目server.py，等待就绪后按需打开本机网页，失败返回日志位置。

提供--check只读预检，不启动服务、不建业务库、不打开浏览器。--no-browser用于本地验证。路径用参数数组、不拼shell命令；不使用ExecutionPolicy Bypass、下载脚本或自动pip。Windows CMD使用UTF-8无BOM、CRLF换行；实测子PowerShell禁止加载脚本，因此不交付ps1，不绕过策略。

- [x] RED/GREEN：解释器依赖、自身/其他目录/未知服务、错误端口、check不启动、不扫描真实档案，隔离目录实际启动与重复复用、中文/空格路径。
- [x] CMD候选解析和--check实测；原Python/浏览器回归、独立审查。
- [x] 操作说明、白名单v0.16包、备份更新服务及实际预检，业务哈希不变；真实试点仍未完成。
