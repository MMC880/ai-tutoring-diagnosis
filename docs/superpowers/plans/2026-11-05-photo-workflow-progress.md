# SDD ledger — plan: docs/superpowers/plans/2026-11-05-photo-workflow.md

Ruling: 用户持续授权开发，采用现有本地Python/SQLite与Pillow，不另开架构选择。没有独立Git仓库，保留旧交付包，在app/迭代，不修改父目录仓库或其他项目。
Pre-flight: vision.py输出裁切PNG与元数据；AIService发送/解析/版本绑定；网页只提交坐标与教师纠正；Store疑点约束覆盖人工保存、AI应用与整卷确认，不仅依赖提示词。
Ruling: 只使用用户已指定模型；图片能力的真实会话验证与“文档说明支持图片”分开，未经探测不开放作业图外发。密钥重新装入或配置变化使探测失效。

Task 1/2: 核心与HTTP先RED后实现，83项回归通过；随机图片挑战、当前附件裁切、EXIF去除、PENDING转写、教师题号修正来源和原始转写保留均已实现。
Review: 独立审查发现“疑点文字清空绕过状态”和“切换图片旧回调覆盖”2项，已在photo-review-red.txt与photo-image-race-red.txt复现。按状态独立拦截，并绑定图片加载请求序号/附件ID。
Browser: 转写弹窗关闭后仍保留.question节点，导致整卷保存混入隐藏表；photo-browser-red.json保留失败，改为收集#questions内部题目，并同步清空关闭弹窗。

Task 1/2/3: 85项Python、图片竞态1项、图片浏览器15项、原功能浏览器34项通过。独立审查2项已修正并复核。
Live: 首轮数字图SUCCEEDED/374 Token，数学照片INVALID_RESULT/2786 Token；当时未留最终原文，不能回溯确定拒绝原因。新增本地脱敏诊断测试已RED→GREEN。后一次Key输入因自动审批额度故障未执行，已取消等待程序；2026-11-05北京时间09:23已过提示恢复时间，通过原审批/隐藏输入路径重新获准，没有换通道绕过。
Live retry: 新数字图SUCCEEDED/348 Token；数学照片UNKNOWN/usage未知。未重放原ID、不自动再试；只保留未归档占位卷。诊断精度仍不足以追溯网络异常种类，不能臆定超时。
Ruling: 增加本地人工转写兜底，匹配此前老师矫正的需求，不再消耗接口等待。原INVALID/UNKNOWN状态与用量必须保留；人工内容明示来源，不伪装模型成功。

Task 5: 本机人工转写、无Key/无网络、原失败与usage保留、来源快照、版本冲突/幂等、疑点约束已实现。教师Word报告补识别疑点。94项Python通过，人工兜底浏览器10/10；独立增量审查无剩余重要发现。
Live completion: 实际本机人工整理10/10；新建Q01裁切任务真实转写成功533 Token，前置数字图440；后续仅Q01文字诊断成功505，9项页面核对通过。V4未确认，其余3题及Q03疑点保留；正式事件0。图片相关已报告4986 Token，另一次UNKNOWN用量未知，旧文字1236另列。
Final verification: 最后一次沙箱内HTTP被WinError10013阻止，保持代码不变，在获准回环环境重跑94项全部通过；非产品失败。图片竞态PASS；15/34/10浏览器证据已刷新并逐项核对。当前服务health0.3.0、照片卷V4、0确认事件、UNKNOWN仍保留。源码/文档195个文本文件长Key格式扫描0命中（不扫描运行库，故不扩张为全盘秘密检查）。
Task 4: 操作文档、真实结果与边界说明已完成；源码白名单包待本次构建核验。整页识别未通过、真实手写未验收，不能用交付完成替代产品整体完成。

Delivery: v0.3.0源码ZIP已构建，34文件、33清单项逐字节及SHA-256复核通过，CRC正常，包内长Key格式0命中；旧包保留。构建记录docs/delivery/LOCAL_TRIAL_PACKAGE-v0.3.0.json。
