# SDD ledger — plan: docs/superpowers/plans/2026-11-07-teacher-launcher.md

设计依据：现有数学试点主线与连续开发授权。只补可靠启动，不扩展心理、商业或四科上线范围。

Ruling: 项目没有Git仓库，使用app/.qa-temp/launcher-before-20261107的原四文件副本及白名单交付包保留变化依据，不初始化父目录、不编造提交；保留证据目录而不删除，避免无Git历史时丢失记录。代价是不能用Git自动回滚。

Pre-flight: CMD寻找解释器，Python预检与启动，服务提供仅目录身份的只读接口；身份与资料目录必须都匹配。测试库与真实资料完全分开。

Task 1: 初始6项单元测试RED（无launcher模块）→GREEN，见launcher-red.txt/launcher-green.txt。

Ruling: Windows空闲端口实测约2.06秒才拒绝连接，原1秒超时会误判UNREACHABLE；改3秒，超时仍失败关闭，不猜FREE。代价是未运行服务时预检多等约2秒。

Ruling: 子Windows PowerShell策略拒绝加载ps1（与父PowerShell所见策略不同）；改为原生CMD选择已有解释器，不使用-ExecutionPolicy或把脚本改成内联执行规避限制。删除本轮未交付的launch.ps1。代价是CMD入口需要保留CRLF换行，且不再提供PS参数形式。

Task 1 integration: 隔离真实服务启动/复用、其他目录拒绝、外部HTTP冲突、只读CLI、CMD显式解释器及不存在解释器验证。CMD初测因LF解析失败，规范CRLF后11项通过。原始失败保留launcher-integration*.txt，修正后launcher-cmd-green.txt。

Task 2: complete。中文空格程序目录与资料目录均实测；CMD测试需/S /C外层引号，修正的是测试调用而不是宣称双击失败。独立审查2项Important各先RED再修复：最终服务变化阻止打开、浏览器False明确给手动URL；专项14项和全294项通过。

Task 3: complete。旧进程52200核实本项目/无Key/无活动任务、完整备份后更新，新PID61608，CMD第二次复用。9表业务SHA不变、真实试点0记录。档案浏览器14项、实际只读25项通过。81文件/80清单包CRC及SHA逐项通过，见TEACHER_LAUNCHER_DELIVERY.md。未调用真实AI。

Final review: 独立审查完成，2项已由复现测试和全套验证关闭，无未处理Critical/Important；无报告的Minor。无Git可合并分支，原文件和旧包保留。
