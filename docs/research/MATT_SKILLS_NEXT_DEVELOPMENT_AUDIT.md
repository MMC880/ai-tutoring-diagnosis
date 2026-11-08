# Matt Pocock Skills：晋学智辅下一轮开发适用性审计

核验日期：2026-11-08。研究对象为本地完整源码与安装缓存，结论固定到 commit `4ae2317ddb22b046e26455e4f9c9b3aaaf62212d`、插件 `1.3.2`；没有核验在线最新 HEAD。本报告只研究与说明工作流，没有执行本文中的开发示例、安装依赖、创建任务、修改项目配置或改动应用。

## 结论

最值得用的是一组小工具，而不是把全部流程重新跑一遍：**domain-modeling 澄清业务，prototype 对比三入口界面，tdd 保护关键行为，code-review 核对实现与需求；research 和 diagnosing-bugs 按需插入。** 多次会话的大改再使用 to-spec → to-tickets → implement。近期采用逐项本地实施更容易控制，不优先采用 implement-spec 的整批并发。

这些 Skill 是给编程代理读取的工作流指令及参考材料，不会直接给老师端软件增加功能。安装后不会出现“打包 EXE 引擎”、OCR、数学判卷服务、学生资料后端或微信小程序。EXE 仍须实现窗口、打包、依赖与资料目录处理并实际验证；题目识别和数学质量仍须各自验证。[插件入口](https://github.com/mattpocock/skills/blob/4ae2317ddb22b046e26455e4f9c9b3aaaf62212d/.claude-plugin/plugin.json)、[源码 README](https://github.com/mattpocock/skills/blob/4ae2317ddb22b046e26455e4f9c9b3aaaf62212d/README.md)、S02/S05/S10/S16。

## 依据与核验范围

- 源码：`E:\GPT\mattpocock-skills-research\source`；安装缓存：`C:\Users\42248\.codex\plugins\cache\mattpocock\mattpocock-skills\1.3.2`。
- 只读运行 `git rev-parse HEAD` 得到上述固定 commit；读取 manifest 得到版本 1.3.2、正式发布 27 项。本地扫描有 39 份 SKILL.md；完整源码包含的 misc/in-progress 不等于正式发布项。
- 对源码 `git ls-files` 列出的 **184 个文件**逐个与安装缓存做 SHA-256 比较，缺失及内容差异均为 0。另逐项读取本报告 17 项的 SKILL.md 与 agents/openai.yaml，核对正文限制和 OpenAI 策略。
- 主代理独立核验：插件 `enabled=true`、安装 revision 与上述源码一致；27 个发布项中 **11 个允许隐式、16 个仅显式**。当前聊天注入的 catalog 恰列出那 11 个允许隐式项，16 个显式项不在本聊天 catalog。这个观察不能推成“16 项未安装”或“已通过所有显式调用实测”。原始本地证据见 [本轮核验 JSON](E:/GPT/AI-Tutoring-Diagnosis/docs/setup/matt-next-development-verification-20261108.json:1)（本机忽略文件）。
- 主代理只读运行了 `codex plugin --help`，并在线核对作者 README 与 OpenAI 使用说明；没有安装或实际触发本文工程链，没有做桌面 UI 点选实测。GitHub API 的远端 main SHA 请求失败，因此不宣称本地快照是远端最新。帮助输出可用、安装启用和 Skill 开发流程实际成功是不同证据。
- 已读项目 [AGENTS.md](E:/GPT/AI-Tutoring-Diagnosis/AGENTS.md:1)，开始时 `git status --short` 无输出；最近提交为 `1214045`、`2f28d8a`、`65f8094`。这些只是本轮读取时的状态。
- 历史记忆仅用于找到此前核验路径；本报告有关版本、数量、源码行为和项目现状均重新读取确认。报告不复用旧的“Git 尚未初始化”判断。

正式发布入口证据：[官方 manifest](https://github.com/mattpocock/skills/blob/4ae2317ddb22b046e26455e4f9c9b3aaaf62212d/.claude-plugin/plugin.json)；[本地 manifest](E:/GPT/mattpocock-skills-research/source/.claude-plugin/plugin.json:1)。下文 S01—S17 的完整本地与固定版本官方证据见末尾索引。

## 项目目标如何决定选择

当前是 Python＋HTML/CSS/原生 JavaScript＋SQLite 的本地教师软件；最新文档建议先将约 10 个导航收拢为 **学生档案、登记作业、班级学情**，再做 Windows EXE 独立窗口。其具体方案尚未批准实施，本报告不把研究委托当作编码授权。长期主线为共用原题、各生作答与确认、知识关联、长期档案、班级共性、档案驱动三档复查和真实反馈；后续家长微信小程序暂不开发。

项目依据：[Windows 交付与简化界面建议](E:/GPT/AI-Tutoring-Diagnosis/docs/design/WINDOWS_DELIVERY_AND_SIMPLE_UI.md:1)、[档案 MVP 讨论稿](E:/GPT/AI-Tutoring-Diagnosis/docs/design/LEARNING_ARCHIVE_MVP_REFOCUS.md:1)、[当前路线](E:/GPT/AI-Tutoring-Diagnosis/DEVELOPMENT_ROADMAP.md:1)。这些文件明确区分已有能力、建议模型和待实施关系；不能因为调用 Skill 就将后两者算作已交付。

## 17 项逐项审阅

“可隐式”仅表示源码没有禁止模型自行采用，YAML 也没有设 `allow_implicit_invocation: false`；它不表示一定自动触发。“显式”表示正文 `disable-model-invocation: true` 和 YAML 的禁隐式策略相互吻合。17 项都列在正式插件 manifest 中。

|Skill|源码调用策略|对本项目的具体价值|实际动作与使用边界|
|---|---|---|---|
|ask-matt（S01）|显式|不记得流程时询问下一步选什么|路由说明，不负责直接实现；要求推荐前再读被推荐 Skill，不能只照摘要一口气跑完整套。|
|prototype（S02）|可隐式|先让用户看到三入口布局；或验证“共用原题修订不改历史”的状态模型|UI 分支通常默认 3 种结构方案；逻辑分支是一份可双击 HTML。默认内存/临时数据，不接真实写入；可抛弃的代码不等于最终产品。|
|to-spec（S03）|显式|把已讨论的“老师先选学生”和 EXE 交付边界形成验收规格|不重新访谈，但要确认测试接口；最终向配置的 tracker 发布规格。必须指定本地文件，不能默认发 GitHub。|
|to-tickets（S04）|显式|把跨会话任务拆成可独立演示的完整功能小步|先展示依赖和颗粒度，用户批准后才发布；本地一票一文件，不把任务拆成孤立数据库/API/UI层。|
|implement（S05）|显式|逐项实现确认后的导航、启动或档案任务|会采用 tdd、运行检查和 code-review，最后提交当前分支；需先保护已有改动，沿用本项目“通过相应测试后逐功能本地提交”。|
|implement-spec（S06）|显式|未来范围清楚、任务可独立时，整批推进已批准规格|创建集成分支、各票独立 worktree/代理、并发实现、合并代理、整体审查并清理 worktree；不是单代理顺序执行器。近期不是最小首选。|
|domain-modeling（S07）|可隐式|最贴合档案长期主线，分清原卷/原题/作答次、知识点/教案、确认事实/建议/复查观察|会当场更新 GLOSSARY.md；ADR 仅对难逆、真实取舍且后人难理解的决定使用。不是数据库建表 Skill。|
|codebase-design（S08）|可隐式|整理“先选学生再读档案”、知识关联、窗口启动等可测试接口|提供深模块、接口、可替换位置等设计词汇，不规定换框架；只有真实变化才引入可替换设计。其替代设计参考可用并行代理。|
|improve-codebase-architecture（S09）|显式|出现一次修改要跨很多文件、档案状态难测试等真实阻力时局部扫描|先按方向/近期热点缩小范围，开探索子代理，写临时 HTML 候选报告，让用户选择再讨论；不直接执行全库重构，报告 CDN 样式/图可能依赖网络。|
|tdd（S10）|可隐式|保护切学生不串档、旧确认不被新原题覆盖、未审候选不可发布、同次重传不算新作答等行为|先确认测试接口，逐个测试红→绿；测公共行为，不照抄实现，不为了每个界面文案加机械测试。正文把重构放在评审阶段，YAML 简介写 red-green-refactor，实施应以正文细则为准。|
|diagnosing-bugs（S11）|可隐式|窗口关闭残留、重复启动、请求迟到回填、版本混用、导入重复等具体故障|先实跑能抓住该症状的快速失败检查，再缩小复现、比较假设、最小修复和回归；不能先凭感觉改一批代码，日志与凭据须脱敏。|
|code-review（S12）|可隐式|分别检查仓库规则和原需求，抓“代码能跑但做错东西”|会启动 Standards/Spec 两个独立并行代理，固定比较基点；没有规格须明确跳过该轴。评审不是测试或教师试点的替代。|
|research（S13）|可隐式|查 pywebview/PyInstaller 官方兼容性、打包依赖、知识身份或批量录入格式的事实|明确委派后台研究代理，核对第一手资料并留下带引用 Markdown；研究结果喂给后续决策，不直接作为实施授权。|
|grill-with-docs（S14）|显式|关键取舍含糊时用一轮小范围追问，比如默认进入档案还是收作业|正文仅组合 grilling 与 domain-modeling，可能持续更新术语/ADR；已有结论直接复用，不重新把整个产品问一遍。|
|setup-matt-pocock-skills（S15）|显式|仅在缺少 tracker/领域文档消费约定时做一次适配|会查看现状、给草稿、确认后改 AGENTS/CLAUDE 与 docs/agents；GitHub 路线可能配置 remote、建 label，本项目应选 Local Markdown。已有配置只补缺项。|
|teach（S16）|显式|适合用户自己学习 SQLite、测试、数学教学设计概念；可借鉴短课、主动回忆与间隔练习思想|把当前目录当学习工作区，会创建 MISSION、lessons、learning-records 等。不是给多学生自动建档或教学诊断的后台，不应直接在应用根目录拿它代替产品。|
|wizard（S17）|可隐式|未来确实需要人操作外部后台、获取凭据时才考虑|生成交互 bash 脚本，模板可写 .env、GitHub secrets；PowerShell 场景不直接即用。代理能做的打包/本机检测不要甩给用户跑 wizard。|

## 最小组合与分阶段顺序

### 0．首次工程流补齐最小本地约定，之后不重复初始化

本轮实际检查发现：`AGENTS.md` 没有 `## Agent skills` 块；`docs/agents/issue-tracker.md`、`docs/agents/domain.md`、`docs/agents/triage-labels.md`、`.scratch/` 和 `.agents/` 均不存在。[历史安装核验](E:/GPT/AI-Tutoring-Diagnosis/docs/setup/SKILL_CHECK.md:1)也明确写着未完成工程工单/标签初始化。**插件已经安装启用，仓库级工程流初始化尚未完成。** 这里报告的是文件缺失，不推测其内容。

最小下一步：先延用当前术语和产品文档做有界的三入口原型；在首次真正执行 to-spec/to-tickets/code-review 等依赖 tracker 的工程流之前，明确使用 setup-matt-pocock-skills 完成一次最小适配：固定 **Local Markdown**，复用根 GLOSSARY 与现有 ADR，只补所需 docs/agents 约定及 AGENTS 引用，先展示草稿再按 S15 的确认步骤写入。之后不重新跑全套初始化。此次仅审计，没有执行 setup 或写这些配置文件。

本地 tracker 是上游原生支持：规格 `.scratch/<feature>/spec.md`；实施票 `.scratch/<feature>/issues/<NN>-<slug>.md`。源码的“publish”在此意为写本地文件，不代表联网发布。[官方本地 tracker 模板](https://github.com/mattpocock/skills/blob/4ae2317ddb22b046e26455e4f9c9b3aaaf62212d/skills/engineering/setup-matt-pocock-skills/issue-tracker-local.md#L1-L21)、[本地模板](E:/GPT/mattpocock-skills-research/source/skills/engineering/setup-matt-pocock-skills/issue-tracker-local.md:1)。

不需要重装插件、重新 git init、配置远端、开 PR 或把研究变成全量 setup。配置变动必须保留本项目现有本地 Git、资料隔离和恢复规则。

### 1．近期三入口：domain-modeling＋prototype

先复用既有术语，只解决老师操作中的关键歧义。用隔离原型比较“学生档案/登记作业/班级学情”三入口，原型重点是先选学生、进入原卷、返回档案与待复查的顺序；设置容纳 AI、备份和资料管理。

原生 HTML/CSS/JS 已足够。UI 参考中包含 React/框架式示例，不构成更换现有框架的要求；按本项目现有页面组织表达相同的变体。原型不连真实写入，使用合成学生或授权只读数据。若结论明确，直接写小规格；跨多次会话才扩到 to-spec/to-tickets。

Matt prototype 用于验证 UI 布局与流程；这个仓库不提供专门的 Windows 打包器或微信小程序实现。若需要进一步打磨视觉，可配当前宿主已经列出的 frontend-design，无需为此次研究重复安装。视觉选择也应服务教师操作，而不是扩大到新产品或新框架。

S02 要求把原型和答案留作可追溯来源：原型保存在独立 `prototype/<name>` 分支或等价隔离目录，主线只吸收已验证决定。“抛弃式”指不按正式产品质量编写，不是强制立即删除证据。[UI 细则](https://github.com/mattpocock/skills/blob/4ae2317ddb22b046e26455e4f9c9b3aaaf62212d/skills/engineering/prototype/UI.md#L14-L30)、[原型留存](https://github.com/mattpocock/skills/blob/4ae2317ddb22b046e26455e4f9c9b3aaaf62212d/skills/engineering/prototype/UI.md#L94-L112)、[逻辑 HTML](https://github.com/mattpocock/skills/blob/4ae2317ddb22b046e26455e4f9c9b3aaaf62212d/skills/engineering/prototype/LOGIC.md#L35-L67)。

### 2．实现三入口：小规格 → implement/tdd → code-review

验收围绕老师能做的事：不先打开整卷也能选学生；切学生与返回后不会显示前一人的窗口；待保存草稿不能静默丢弃；原有确认、历史和细节仍可达。减少主菜单不等于删除旧功能，也不能只隐藏按钮就声称完成选择状态整理。

范围小则一项 implement；跨会话则 to-spec → to-tickets → 每次一票 implement。沿用 Python 和 Node/浏览器已有相关检查；这些例子是计划建议，不是本轮测试结果。按已确认的公共接口做必要测试，每个独立功能通过相应验证后按项目规则本地提交，不推送。

### 3．Windows EXE：research → 小规格 → 实现与真实交付验证

research 先核对拟采用窗口/打包工具的官方依赖、当前锁定版本、Python/Windows 架构及 WebView2 处理方式，再细化可审阅方案。沿用已有“先窗口承载，再打包依赖”的候选路线，不凭 Skill 推荐改写业务或添加家长端。

测试重点：无 Python 的干净 Windows 启动、中文路径、重复打开、关闭只结束本程序后台、缺运行时提示、可写资料目录、升级不覆盖数据库、备份回读。自动化软件测试通过不等于实际 EXE 在新机通过；结构/打包/本机/干净新机验证分别报告。包装成功也不代表 OCR、数学质量或教师省时验收。

### 4．长期档案：domain-modeling＋codebase-design → 本地规格与任务 → 逐项实现

优先把共用原题与各生作答关系、原题版本、知识身份、班级成员及观察范围讲清。先有完整的单生行为再做跨次统计，最后把三档复查接到已确认档案事实。每步保留旧资料，不拿代码回退当成数据库恢复。

只有任务依赖明确、共享文件冲突可控、可分配独立工作区且用户确实需要整批并发时，再用 implement-spec。它会扩大代理、合并、审查和上下文成本；近期单人本地迭代无需把这套复杂度当门槛。需要外部 PR 的 tracker 才走上游可选 PR 路径，本项目无此默认授权。

## 如何调用：说明性示例，不在本轮执行

Skill 不是需要直接运行的 Python 模块或 EXE。OpenAI 官方说明 CLI/IDE 可用 `/skills` 列表或输入 `$` 选择已发现的 Skill，禁隐式项仍可显式点名；本次没有验证桌面 UI 的具体点选路径。[OpenAI Skills 官方使用说明](https://learn.chatgpt.com/docs/build-skills)。当前 catalog 可直接明确点名的例子是 `mattpocock-skills:prototype`、`mattpocock-skills:domain-modeling` 和 `mattpocock-skills:tdd`。

仓库 README 使用 `/ask-matt` 等 `/skill-name` 写法；这是作者的交互示例，不能保证它在当前桌面宿主中是原生命令。对本聊天未列出的显式项，先尝试由宿主的 Skill 选择器显式发现；如果宿主未列出，可在用户明确指定后读取安装路径的 SKILL.md，并在当前对话按流程执行。必须如实说是“读取并应用该文件”，不宣称已通过自动发现或原生调用实测。无需为此重复安装。

下面仅是将来可复制的提示词示例，均应从 `E:\GPT\AI-Tutoring-Diagnosis` 正确目录发起。执行前仍须符合当次授权范围。

**选择流程：**

> 请使用 ask-matt，只为晋学智辅选择这一次任务最小需要的 Skill。目标是把现有十个入口收为学生档案、登记作业、班级学情；保留 Python、原生 JS 与 SQLite，暂不做家长端。先读现有交付建议、GLOSSARY 和 AGENTS；只给下一步与理由，不创建任务、不改代码、不重新初始化。

**看得见的界面选择：**

> 请使用 prototype 的 UI 分支，针对三入口教师工作台做三种结构差异明显的只读原型。沿用原生 HTML/CSS/JS，用合成学生；重点比较先找学生、登记问题、安排复查的路径。放在隔离原型位置，不写真实 SQLite、不安装新前端框架；展示后记录选定方案与未确定项。保留原型来源，不把原型当正式交付。

**明确业务概念：**

> 请使用 domain-modeling，只讨论共用原卷题目、原题版本、学生作答次和复查观察四个概念。先读现有 GLOSSARY 与 ADR，核对“同卷重传不增加一次作答”“原题修订不改旧确认”的具体场景；仅在决定形成后更新对应术语，不改数据库，不重写产品计划。

**多会话任务拆分：**

> 请使用 to-spec，把已确认的三入口方案写成本地规格；tracker 固定为 Local Markdown，不发 GitHub、不加 remote。沿用现有文档，先给出拟测试的公共接口；家长端、云同步、共用原题迁移和 EXE 打包不混进本票。随后按 to-tickets 提出完整小步与依赖，待拆分获批再写每票文件。

**单票实施：**

> 请使用 implement 实施我指定的本地票，只做“从学生列表进入档案”，先读 AGENTS、工作区差异及票的验收要求。在已确认接口使用 tdd，保护切学生不串档与历史只读，复用既有相关检查；明确评审的实际 diff 范围。独立功能验证通过后仅作本地提交，报告哈希和未验证项，不推送、不合并其他分支。

**排查具体故障：**

> 请使用 diagnosing-bugs，排查“切换学生后旧请求把上一个学生的原题窗口重新打开”。先构造并实跑能复现此症状的最小检查，再列假设并修复；只用合成资料，先保护已有修改，修复后重跑原复现及相关回归，不改真实学习记录。

**打包事实调查：**

> 请使用 research，只核对现有 Python 与静态网页界面用 Windows 独立窗口交付的候选依赖、版本与验证条件，优先官方资料，写入现有 research 目录。区分本机可验证与干净 Windows 待验证；不安装、不打包、不修改全局配置，保持家长小程序不开发。

## 使用时最容易误判的地方

1. **正式发布、允许隐式、宿主发现是三件事。** manifest 包含不等于当前聊天一定列出；文件存在不等于已经执行。
2. **to-spec/to-tickets 有写入与发布动作。** 它们不是纯摘要；在本项目应明确绑定本地 tracker。setup 也不是只读检查，不能为了使用其他小 Skill 顺手添加 GitHub 远端。
3. **code-review 的默认 diff 不覆盖未提交文件。** 正文默认 `git diff <fixed-point>...HEAD`，因此只看已提交历史；它的描述虽提到 WIP，也不能据此认定未提交/未跟踪文件已审过。实施时明确审查基点与实际待交付 diff；需要未提交审查就显式调整命令并列出未跟踪文件。空 diff 或坏引用必须停在比较阶段。S05 的“先 review 后 commit”与这个默认范围存在衔接问题，调用者要实际解决，不走形式。
4. **TDD 有确认条件。** S10 明确要求先写出并确认测试接口，不能先堆一批贴实现的单测。已有已批准接口不重复问；新接口确未达成一致时，展示具体提案再确认。
5. **并发不仅来自 implement-spec。** research 明确委派研究代理；code-review 明确双轴并行；架构扫描也用探索代理。不能把所有调用都当作一条无副作用指令。
6. **teach 不等于学生档案模块。** 它面向当前使用者的学习工作区，生成课件与学习记录；多人隔离、教师确认、数学正确性与历史版本仍是产品开发问题。
7. **wizard 不适合充当本项目默认 Windows 安装向导。** 上游产物是 bash 交互脚本，验证要求 bash -n 等；它也明确禁止把代理自己能做的事交给人。将来如真需要本机 PowerShell 安装交互，应另行设计与核验。
8. **输出漂亮的 HTML 报告不等于完成重构。** S09 先呈现候选再让用户选；别把它扩成全库重构，或为“以后小程序”提前抽象所有层。
9. **本地 Git 约束优先。** 只提交本次独立功能且通过相应检查；不默认配置远端、创建 PR、推送、删工作树里已有工作或整库恢复。原型、任务、研究的提交策略仍须遵守当次明确指令；研究代理按委托仅新增本报告，未提交，最终 Git 状态由主代理报告。
10. **软件检查与真实教学验收分开。** 合成学生、假模型、静态页面和自动化检查可以证明对应软件行为，不能证明真实学生归属、真实数学内容、老师净省时或学习效果。

## 固定版本证据索引

下列链接均固定到 `4ae2317ddb22b046e26455e4f9c9b3aaaf62212d`。正文与 YAML 都已读取；YAML 主要是显示名称、简介及部分 Skill 的禁隐式策略，不是额外业务实现或命令脚本。

- S01 **ask-matt**：[官方正文](https://github.com/mattpocock/skills/blob/4ae2317ddb22b046e26455e4f9c9b3aaaf62212d/skills/engineering/ask-matt/SKILL.md#L1-L97)、[本地正文](E:/GPT/mattpocock-skills-research/source/skills/engineering/ask-matt/SKILL.md:1)；[官方 OpenAI YAML](https://github.com/mattpocock/skills/blob/4ae2317ddb22b046e26455e4f9c9b3aaaf62212d/skills/engineering/ask-matt/agents/openai.yaml)、[本地 OpenAI YAML](E:/GPT/mattpocock-skills-research/source/skills/engineering/ask-matt/agents/openai.yaml:1)。
- S02 **prototype**：[官方正文](https://github.com/mattpocock/skills/blob/4ae2317ddb22b046e26455e4f9c9b3aaaf62212d/skills/engineering/prototype/SKILL.md#L1-L26)、[本地正文](E:/GPT/mattpocock-skills-research/source/skills/engineering/prototype/SKILL.md:1)；[官方 OpenAI YAML](https://github.com/mattpocock/skills/blob/4ae2317ddb22b046e26455e4f9c9b3aaaf62212d/skills/engineering/prototype/agents/openai.yaml)、[本地 OpenAI YAML](E:/GPT/mattpocock-skills-research/source/skills/engineering/prototype/agents/openai.yaml:1)。
- S03 **to-spec**：[官方正文](https://github.com/mattpocock/skills/blob/4ae2317ddb22b046e26455e4f9c9b3aaaf62212d/skills/engineering/to-spec/SKILL.md#L1-L75)、[本地正文](E:/GPT/mattpocock-skills-research/source/skills/engineering/to-spec/SKILL.md:1)；[官方 OpenAI YAML](https://github.com/mattpocock/skills/blob/4ae2317ddb22b046e26455e4f9c9b3aaaf62212d/skills/engineering/to-spec/agents/openai.yaml)、[本地 OpenAI YAML](E:/GPT/mattpocock-skills-research/source/skills/engineering/to-spec/agents/openai.yaml:1)。
- S04 **to-tickets**：[官方正文](https://github.com/mattpocock/skills/blob/4ae2317ddb22b046e26455e4f9c9b3aaaf62212d/skills/engineering/to-tickets/SKILL.md#L1-L105)、[本地正文](E:/GPT/mattpocock-skills-research/source/skills/engineering/to-tickets/SKILL.md:1)；[官方 OpenAI YAML](https://github.com/mattpocock/skills/blob/4ae2317ddb22b046e26455e4f9c9b3aaaf62212d/skills/engineering/to-tickets/agents/openai.yaml)、[本地 OpenAI YAML](E:/GPT/mattpocock-skills-research/source/skills/engineering/to-tickets/agents/openai.yaml:1)。
- S05 **implement**：[官方正文](https://github.com/mattpocock/skills/blob/4ae2317ddb22b046e26455e4f9c9b3aaaf62212d/skills/engineering/implement/SKILL.md#L1-L17)、[本地正文](E:/GPT/mattpocock-skills-research/source/skills/engineering/implement/SKILL.md:1)；[官方 OpenAI YAML](https://github.com/mattpocock/skills/blob/4ae2317ddb22b046e26455e4f9c9b3aaaf62212d/skills/engineering/implement/agents/openai.yaml)、[本地 OpenAI YAML](E:/GPT/mattpocock-skills-research/source/skills/engineering/implement/agents/openai.yaml:1)。
- S06 **implement-spec**：[官方正文](https://github.com/mattpocock/skills/blob/4ae2317ddb22b046e26455e4f9c9b3aaaf62212d/skills/engineering/implement-spec/SKILL.md#L1-L42)、[本地正文](E:/GPT/mattpocock-skills-research/source/skills/engineering/implement-spec/SKILL.md:1)；[官方 OpenAI YAML](https://github.com/mattpocock/skills/blob/4ae2317ddb22b046e26455e4f9c9b3aaaf62212d/skills/engineering/implement-spec/agents/openai.yaml)、[本地 OpenAI YAML](E:/GPT/mattpocock-skills-research/source/skills/engineering/implement-spec/agents/openai.yaml:1)。
- S07 **domain-modeling**：[官方正文](https://github.com/mattpocock/skills/blob/4ae2317ddb22b046e26455e4f9c9b3aaaf62212d/skills/engineering/domain-modeling/SKILL.md#L1-L74)、[本地正文](E:/GPT/mattpocock-skills-research/source/skills/engineering/domain-modeling/SKILL.md:1)；[官方 OpenAI YAML](https://github.com/mattpocock/skills/blob/4ae2317ddb22b046e26455e4f9c9b3aaaf62212d/skills/engineering/domain-modeling/agents/openai.yaml)、[本地 OpenAI YAML](E:/GPT/mattpocock-skills-research/source/skills/engineering/domain-modeling/agents/openai.yaml:1)。
- S08 **codebase-design**：[官方正文](https://github.com/mattpocock/skills/blob/4ae2317ddb22b046e26455e4f9c9b3aaaf62212d/skills/engineering/codebase-design/SKILL.md#L1-L114)、[本地正文](E:/GPT/mattpocock-skills-research/source/skills/engineering/codebase-design/SKILL.md:1)；[官方 OpenAI YAML](https://github.com/mattpocock/skills/blob/4ae2317ddb22b046e26455e4f9c9b3aaaf62212d/skills/engineering/codebase-design/agents/openai.yaml)、[本地 OpenAI YAML](E:/GPT/mattpocock-skills-research/source/skills/engineering/codebase-design/agents/openai.yaml:1)。
- S09 **improve-codebase-architecture**：[官方正文](https://github.com/mattpocock/skills/blob/4ae2317ddb22b046e26455e4f9c9b3aaaf62212d/skills/engineering/improve-codebase-architecture/SKILL.md#L1-L71)、[本地正文](E:/GPT/mattpocock-skills-research/source/skills/engineering/improve-codebase-architecture/SKILL.md:1)；[官方 OpenAI YAML](https://github.com/mattpocock/skills/blob/4ae2317ddb22b046e26455e4f9c9b3aaaf62212d/skills/engineering/improve-codebase-architecture/agents/openai.yaml)、[本地 OpenAI YAML](E:/GPT/mattpocock-skills-research/source/skills/engineering/improve-codebase-architecture/agents/openai.yaml:1)。
- S10 **tdd**：[官方正文](https://github.com/mattpocock/skills/blob/4ae2317ddb22b046e26455e4f9c9b3aaaf62212d/skills/engineering/tdd/SKILL.md#L1-L38)、[本地正文](E:/GPT/mattpocock-skills-research/source/skills/engineering/tdd/SKILL.md:1)；[官方 OpenAI YAML](https://github.com/mattpocock/skills/blob/4ae2317ddb22b046e26455e4f9c9b3aaaf62212d/skills/engineering/tdd/agents/openai.yaml)、[本地 OpenAI YAML](E:/GPT/mattpocock-skills-research/source/skills/engineering/tdd/agents/openai.yaml:1)。
- S11 **diagnosing-bugs**：[官方正文](https://github.com/mattpocock/skills/blob/4ae2317ddb22b046e26455e4f9c9b3aaaf62212d/skills/engineering/diagnosing-bugs/SKILL.md#L1-L138)、[本地正文](E:/GPT/mattpocock-skills-research/source/skills/engineering/diagnosing-bugs/SKILL.md:1)；[官方 OpenAI YAML](https://github.com/mattpocock/skills/blob/4ae2317ddb22b046e26455e4f9c9b3aaaf62212d/skills/engineering/diagnosing-bugs/agents/openai.yaml)、[本地 OpenAI YAML](E:/GPT/mattpocock-skills-research/source/skills/engineering/diagnosing-bugs/agents/openai.yaml:1)。
- S12 **code-review**：[官方正文](https://github.com/mattpocock/skills/blob/4ae2317ddb22b046e26455e4f9c9b3aaaf62212d/skills/engineering/code-review/SKILL.md#L1-L89)、[本地正文](E:/GPT/mattpocock-skills-research/source/skills/engineering/code-review/SKILL.md:1)；[官方 OpenAI YAML](https://github.com/mattpocock/skills/blob/4ae2317ddb22b046e26455e4f9c9b3aaaf62212d/skills/engineering/code-review/agents/openai.yaml)、[本地 OpenAI YAML](E:/GPT/mattpocock-skills-research/source/skills/engineering/code-review/agents/openai.yaml:1)。
- S13 **research**：[官方正文](https://github.com/mattpocock/skills/blob/4ae2317ddb22b046e26455e4f9c9b3aaaf62212d/skills/engineering/research/SKILL.md#L1-L12)、[本地正文](E:/GPT/mattpocock-skills-research/source/skills/engineering/research/SKILL.md:1)；[官方 OpenAI YAML](https://github.com/mattpocock/skills/blob/4ae2317ddb22b046e26455e4f9c9b3aaaf62212d/skills/engineering/research/agents/openai.yaml)、[本地 OpenAI YAML](E:/GPT/mattpocock-skills-research/source/skills/engineering/research/agents/openai.yaml:1)。
- S14 **grill-with-docs**：[官方正文](https://github.com/mattpocock/skills/blob/4ae2317ddb22b046e26455e4f9c9b3aaaf62212d/skills/engineering/grill-with-docs/SKILL.md#L1-L7)、[本地正文](E:/GPT/mattpocock-skills-research/source/skills/engineering/grill-with-docs/SKILL.md:1)；[官方 OpenAI YAML](https://github.com/mattpocock/skills/blob/4ae2317ddb22b046e26455e4f9c9b3aaaf62212d/skills/engineering/grill-with-docs/agents/openai.yaml)、[本地 OpenAI YAML](E:/GPT/mattpocock-skills-research/source/skills/engineering/grill-with-docs/agents/openai.yaml:1)。
- S15 **setup-matt-pocock-skills**：[官方正文](https://github.com/mattpocock/skills/blob/4ae2317ddb22b046e26455e4f9c9b3aaaf62212d/skills/engineering/setup-matt-pocock-skills/SKILL.md#L1-L120)、[本地正文](E:/GPT/mattpocock-skills-research/source/skills/engineering/setup-matt-pocock-skills/SKILL.md:1)；[官方 OpenAI YAML](https://github.com/mattpocock/skills/blob/4ae2317ddb22b046e26455e4f9c9b3aaaf62212d/skills/engineering/setup-matt-pocock-skills/agents/openai.yaml)、[本地 OpenAI YAML](E:/GPT/mattpocock-skills-research/source/skills/engineering/setup-matt-pocock-skills/agents/openai.yaml:1)。
- S16 **teach**：[官方正文](https://github.com/mattpocock/skills/blob/4ae2317ddb22b046e26455e4f9c9b3aaaf62212d/skills/productivity/teach/SKILL.md#L1-L140)、[本地正文](E:/GPT/mattpocock-skills-research/source/skills/productivity/teach/SKILL.md:1)；[官方 OpenAI YAML](https://github.com/mattpocock/skills/blob/4ae2317ddb22b046e26455e4f9c9b3aaaf62212d/skills/productivity/teach/agents/openai.yaml)、[本地 OpenAI YAML](E:/GPT/mattpocock-skills-research/source/skills/productivity/teach/agents/openai.yaml:1)。
- S17 **wizard**：[官方正文](https://github.com/mattpocock/skills/blob/4ae2317ddb22b046e26455e4f9c9b3aaaf62212d/skills/engineering/wizard/SKILL.md#L1-L44)、[本地正文](E:/GPT/mattpocock-skills-research/source/skills/engineering/wizard/SKILL.md:1)；[官方 OpenAI YAML](https://github.com/mattpocock/skills/blob/4ae2317ddb22b046e26455e4f9c9b3aaaf62212d/skills/engineering/wizard/agents/openai.yaml)、[本地 OpenAI YAML](E:/GPT/mattpocock-skills-research/source/skills/engineering/wizard/agents/openai.yaml:1)。

其他关键一手材料：

- [官方插件清单](https://github.com/mattpocock/skills/blob/4ae2317ddb22b046e26455e4f9c9b3aaaf62212d/.claude-plugin/plugin.json)、[本地插件清单](E:/GPT/mattpocock-skills-research/source/.claude-plugin/plugin.json:1)。
- [官方 README](https://github.com/mattpocock/skills/blob/4ae2317ddb22b046e26455e4f9c9b3aaaf62212d/README.md)、[本地 README](E:/GPT/mattpocock-skills-research/source/README.md:1)：安装与作者流程说明；README 中的自动更新说法不作为当前宿主实测结论。
- [官方本地任务模板](https://github.com/mattpocock/skills/blob/4ae2317ddb22b046e26455e4f9c9b3aaaf62212d/skills/engineering/setup-matt-pocock-skills/issue-tracker-local.md)、[本地任务模板](E:/GPT/mattpocock-skills-research/source/skills/engineering/setup-matt-pocock-skills/issue-tracker-local.md:1)。
- [官方 UI 原型参考](https://github.com/mattpocock/skills/blob/4ae2317ddb22b046e26455e4f9c9b3aaaf62212d/skills/engineering/prototype/UI.md)、[本地 UI 参考](E:/GPT/mattpocock-skills-research/source/skills/engineering/prototype/UI.md:1)；[官方逻辑原型参考](https://github.com/mattpocock/skills/blob/4ae2317ddb22b046e26455e4f9c9b3aaaf62212d/skills/engineering/prototype/LOGIC.md)、[本地逻辑参考](E:/GPT/mattpocock-skills-research/source/skills/engineering/prototype/LOGIC.md:1)。

研究代理交付范围：本研究文件。未运行本文示例，未修改应用、数据库、AGENTS/配置或产品路线；未创建任务、分支、远端或提交；未安装依赖；未声称当前宿主或 CLI 已执行这些 Skill。最终 Git 状态由主代理报告。
