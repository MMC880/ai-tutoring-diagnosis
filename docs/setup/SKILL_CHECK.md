# Skills 安装与可用性证据

后续按需安装补充：2026-11-04 已新增 Codex 研发侧 sympy Skill，固定上游版本、原生发现启用和自编数学检查证据见 [首轮安装报告](SKILL_INSTALL_REPORT_2026-11-04.md)。下文保留最初访谈工具安装时的检查记录，不作为项目当前全部文档状态。

检查日期：2026-11-04（Asia/Shanghai）。范围：仅安装、检查、访谈和 Markdown 文档；无产品开发。

## 实际结果

| 能力 | 安装渠道 | 检查结果 |
| --- | --- | --- |
| find-skills | Vercel CLI 1.7.6，Codex 用户级 | PASS：Codex 发现、启用，安装文件已读取 |
| mattpocock-skills:ask-matt | Matt Codex 原生插件 1.3.2 | PASS：Codex 发现、启用，安装文件已读取 |
| mattpocock-skills:grill-me | Matt Codex 原生插件 1.3.2 | PASS：Codex 发现、启用，安装文件已读取 |
| mattpocock-skills:grill-with-docs | Matt Codex 原生插件 1.3.2 | PASS：Codex 发现、启用，安装文件已读取 |
| mattpocock-skills:grilling | Matt Codex 原生插件 1.3.2 | PASS：Codex 发现、启用，安装文件已读取 |
| mattpocock-skills:domain-modeling | Matt Codex 原生插件 1.3.2 | PASS：Codex 发现、启用，安装文件已读取 |
| Superpowers | 原有 openai-curated-remote 插件 7.0.1 | PASS：原生列表 installed/enabled；本会话 Skills 目录已发现且读取 using-superpowers、brainstorming、verification-before-completion；未重装 |

## 验证方法与限制

- 原生安装命令均退出 0：`codex plugin marketplace add mattpocock/skills --json`、`codex plugin add mattpocock-skills@mattpocock --json`。详见 matt-marketplace-add.txt、matt-plugin-add.txt。
- `codex plugin list --marketplace mattpocock --json` 返回 installed=true、enabled=true、version=1.3.2。详见 matt-plugin-status.json。
- 官方 Vercel 命令：`npm exec --yes --ignore-scripts --package=skills@1.7.6 -- skills add vercel-labs/skills --skill find-skills -g -a codex -y`，只安装 1 项。详见 find-skills-install.txt。
- CLI 安装包 SHA-512 与 npm registry 的 dist.integrity 一致。检查了入口、依赖声明和部分写入逻辑，未作完整安全审计。安装命令关闭 npm 生命周期脚本、遥测及安全审计请求。
- `skills list -g -a codex` 能列出 find-skills；`skills find grill-with-docs --owner mattpocock` 实际返回官方 grill-with-docs、grilling 等结果。详见 find-skills-list.txt、find-skills-search.txt。
- 新启动的 Codex app-server 经 initialize 后调用 skills/list（指定本项目目录、forceReload=true），共发现 42 项，加载错误为 0；六项新增目标均仅出现一次，enabled=true。详见 codex-skills-list.json。
- 第一次受限环境探针初始化 45 秒超时；在安装所用权限下重试通过。不能将首次超时解释为技能损坏。
- 此独立本地探针不用于声称列出了所有云端插件。Superpowers 使用原生插件列表和当前聊天已注入 Skills 目录作为证据。
- 本轮已从实际安装位置读取 ask-matt、grill-with-docs、grill-me、grilling、domain-modeling 和 find-skills。当前没有专用 Skill 调用工具，按 Codex 文本技能方式读取并应用；不是运行独立二进制程序。
- ask-matt 实际用于选择 grill-with-docs；其依赖 grilling、domain-modeling 已加载，初始项目说明和术语文档已写入，首轮问题随本轮回复发出。grill-me 作为备用入口已检查，其依赖也是 grilling；没有另起一场无文档访谈。
- 安装期间新增技能尚未出现在本聊天最初注入的静态技能列表中；新探针已证明新会话可发现。本轮手动加载应用，下轮可刷新发现。没有声称自动触发已完成端到端测试。
- 未测试 Superpowers 开发、TDD、审查全流程；本轮禁止编码，加载可用不等于开发全流程已验证。

## 安装范围、备份与来源

- Matt 原生插件自带 27 项 Skills，所需五项与依赖在同一包内；未通过第二渠道安装 Matt，也未重复安装 Superpowers。随包的其他技能不代表本轮获准运行。
- 配置备份：`C:/Users/42248/.codex/config.toml.before-teaching-skills-20261104-182642.bak`。备份保留在原用户目录，不复制到项目中。
- TOML 语义对比仅新增 `marketplaces.mattpocock` 和 `plugins.mattpocock-skills@mattpocock`；未删除或修改其他既有键。
- 官方说明：[Matt 仓库](https://github.com/mattpocock/skills)、[Vercel 仓库](https://github.com/vercel-labs/skills)、[OpenAI Skills 文档](https://learn.chatgpt.com/docs/build-skills)。
- 审查用 Matt 源码快照：`4ae2317ddb22b046e26455e4f9c9b3aaaf62212d`。安装以官方插件命令实际版本 1.3.2 为准，后续可能自动更新。

## 全量当前清单与文件校验

安装前原生插件列表共 18 项，详见 plugins-before.txt；新增 Matt 后增加 1 项。当前本地 Skills 发现完整列表见 codex-skills-list.json；不能将插件缓存目录等同于已安装清单。

| Skill | 安装文件 SHA-256 |
| --- | --- |
| find-skills | `c00eeea0e13e74fe4a9d84ba0a8542205a1b736d65f13134fe1a6647eb14976f` |
| mattpocock-skills:ask-matt | `9153a87908838ed24838c16da0eaeec46877f3ab701efdeefea7a5579a4a474d` |
| mattpocock-skills:grill-me | `19e660207b447acf6ee0d600471c02e549c7aca8fb3ab38fdc2c7056aa442fc8` |
| mattpocock-skills:grill-with-docs | `abc0fa7948db18b5fb0e1cc1c522ac5ff47d874e2da1e5df60619d79be11f38b` |
| mattpocock-skills:grilling | `ec91c3f684a0a6323eaf30faa26d3aac5b95f28811eca6d4f108138934063c5c` |
| mattpocock-skills:domain-modeling | `b62d997256cc073e123d4303da8e9db00db0e28de9739660ca3e55ab76e09cdb` |


## 需求文档状态

已建立 PROJECT_VISION.md、GLOSSARY.md 和 INTERVIEW_LOG.md。没有生成完整 PRD、MVP、功能验收、技术架构或开发任务。工程工单/标签初始化暂不执行；不宣称完整 setup-matt-pocock-skills 已完成。
