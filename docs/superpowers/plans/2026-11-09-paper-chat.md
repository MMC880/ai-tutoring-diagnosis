# 已批准的试卷对话实施计划

用户已选择限定试卷引用、发送前预览、本地对话记录、教师审核后入档；无心理档案、无自动确认。

使用subagent-driven-development拆分互不覆盖的后端与前端任务，主任务负责整合、测试与封装。复用AIService现有PREPARED→逐次授权发送、凭据防重放、超时不自动重试和本地ai_jobs，避免第二套密钥或传输系统。

- [x] 后端：新增paper_chat模式及助手模块。输入message、sources=[{paper_id,version,question_ids}]、images=[{document_id,crop,masks}]、previous_job_id可选；最多3卷与3图。只发勾选题干/原答，不发学生身份；图片复用vision裁切去元数据，仍要求本次视觉验证。发送时复核版本，拒绝过期来源。回答存为普通文字，不执行其指令、不自动改卷或写正式事件。可依据job ID生成英文文件名Markdown只读导出。
- [x] 前端：设置AI服务下的“试卷对话”子入口；可勾选作业、图片与填写问题，切换模型复用设置；预览本次实际外发材料后单次授权。展示本地记录与来源，支持同范围追问、新对话、导出Markdown；动态内容转义。
- [x] 整合：Python模拟传输、来源过期/混生/选图授权/秘密回显/重复发送与导出测试；浏览器对话入口/状态/取消/回读合成检查；复审后封装新版本，不覆盖0.1.1。

接口契约：/api/ai/prepare传mode=paper_chat，其余收发沿用/api/ai/jobs/<id>。job.result={answer:string}，job.metadata含本地sources、scope_hash、previous_job_id；GET /api/ai/jobs/<id>/markdown返回text/markdown附件。首次实现不新增正式档案写入接口，老师仍用既有核对入口。
