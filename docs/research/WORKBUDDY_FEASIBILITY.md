# WorkBuddy 一期载体：公开能力核对

日期：2026-11-04。用户决定一期先在 WorkBuddy 使用，后期再做接 AI API/中转的独立本地软件。本轮只核对官方公开资料，未安装技能、调用 WorkBuddy、创建应用或传输学生资料。

## 已查官方资料

| 官方页面 | 能支持的判断 | 不能据此声称 |
| --- | --- | --- |
| [Skills](https://www.workbuddy.cn/docs/workbuddy/From-Beginner-to-Expert-Guide/Function-Description/Skills-Market) | 可通过技能封装脚本和工作流，安装/导入后在对话调用 | Codex 已有技能在 WorkBuddy 自动生效；所有依赖均可运行 |
| [结果查看](https://www.workbuddy.cn/docs/workbuddy/Results) | 支持查看 Word/PDF 等产物、文件操作与另存为；有网页产物视图 | 自定义“导出格式”按钮已存在；任意格式可一键无损互转 |
| [零代码制作本地应用](https://www.workbuddy.cn/docs/workbuddy/From-Beginner-to-Expert-Guide/Practice-Cases/Practice-Seven) | 可用自然语言让 WorkBuddy 生成并尝试运行应用代码 | 该模式不涉及开发；本项目已有可用页面 |
| [FAQ](https://www.workbuddy.cn/docs/workbuddy/From-Beginner-to-Expert-Guide/FAQ) | 文件读取受模型和相关 Skill/插件能力影响，重要文件建议另存独立目录 | 现有环境已支持所有数学图片/文档；保存本地就不会进入模型请求 |

初次批量网页读取遇连接失败，单页重试成功；本轮未读取本机安装状态、版本或账号配置。没有适用于此聊天的 WorkBuddy 直连工具可作当前实测依据，但这不等于不能通过后续授权的本机方式核实。

## 一期形态已选 A：对话／Skills 工作流

- 工作流：老师在 WorkBuddy 对话/技能中提交材料，按每生整卷生成分析草稿，老师确认后执行归档、班级汇总和按需导出。
- 应用页面：有自己的班级/学生列表、整卷审核、归档和导出按钮，WorkBuddy 用于开发或承载页面；仍需实际代码、运行环境及能力验证。

用户已选择工作流走通 10 人试点；应用页面不纳入一期。后期独立软件再讨论页面与按钮，不能把 WorkBuddy 生成应用代码称为本项目无需开发。

后续补充只读检查：本机 `C:\Users\42248\.workbuddy\skills` 发现 15 项技能文件，含数学教学、可视化、GeoGebra 验证和 Obsidian；未验证应用发现／启用、依赖或实际任务。旧段落“未读取本机安装状态”描述初次公开资料核对，不是本轮最终检查范围。完整结果与来源见 ../../SKILL_REUSE_MATRIX.md。

## 必须保留的业务边界

老师审核后才可发布给学生；每生整卷确认并归档后汇总班级共性；完整初中范围、2027 年太原备考定位不变。导出由老师触发并选择 Word/PDF，不默认双份。

姓名/身份对应和完整档案需保持本地及既定最小外发边界。WorkBuddy 的文件读写与模型上下文可能相互关联，需核实具体访问和传输行为；不能直接把真实姓名目录和整库交给 agent 后就声称已满足。现有 Skills、公式编辑质量和本地持久化需要实际环境验证。

官方 Skills 文档也说明部分技能可能外发输入。该说明用于核实权限和数据范围，不代表本轮被授权安装或处理真实学生资料。
