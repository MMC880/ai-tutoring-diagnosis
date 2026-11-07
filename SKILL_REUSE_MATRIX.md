# 晋学智辅：GitHub Skills 发现与复用清单 v0.2

日期：2026-11-04。用途：一期 WorkBuddy 工作流的复用评估。最新按需安装已完成：仅新增 Codex 研发侧 sympy Skill 及项目隔离运行依赖；原生发现和六个自编数学检查通过，不代表 WorkBuddy 或业务系统已验收。完整证据见 docs/setup/SKILL_INSTALL_REPORT_2026-11-04.md。其余研究与本地清单为分次记录，未复制旧项目代码。

## 选择原则（用户已确认）

用户进一步纠正：这里的“找现成能力”，重点是根据项目缺口，通过 find-skills 搜索 GitHub 上成熟的 Skills、工具和经验，不是主要在本机旧项目中找素材。此前本机清单作为检查记录保留，不再作为主要发现路径，也不据此复制旧项目代码。

find-skills 用于发现外部候选；搜索结果需回到 GitHub 原仓库核对说明、维护状态、许可和依赖。ask-matt 用于选择 Matt 技能库中的适用工作流，不是搜索所有 GitHub Skills 的引擎；当前继续需求整理，之后根据实际阶段选择流程。需求确认后的开发规划按用户要求交给 Superpowers，避免同时叠加多套重复的工程流程。

Skill 是给代理的工作说明，常依赖应用、脚本或外部服务；仅有 SKILL.md 不保证具备实际能力。Codex 中可用也不代表 WorkBuddy 中已加载。本机检查只用于避免重装和核实兼容性。

状态分为：说明或文件已发现、应用实际发现／启用、依赖可运行、任务验证通过。目前 WorkBuddy 本机仅证实技能文件存在，后面三层未知；官网能力亦不替代本机验证。

## 按业务缺口评估

| 业务需要 | 优先复用 | 当前证据与限制 | 下一步／是否下载 |
| --- | --- | --- | --- |
| 对话收件、文件处理、工作流执行 | WorkBuddy 原生对话、文件工具和 Skills | 官方说明支持 Skills；本机有技能目录，未做应用内发现或调用核验 | 先查实际环境，不重复安装平台 |
| PDF／Word 读取、整理、导出 | WorkBuddy 官方介绍的 Office 文档套件 | 官方介绍文件处理与生成；本机是否已配齐未知，数学手写和公式质量未证明 | 优先核实现成套件，再决定缺哪些组件 |
| 数学符号核对、解题质量规则 | 已有 mmc-math-teaching 等说明中的读题、独立求解、条件与边界核对经验 | 只读说明，未采用其脚本；多数工作流面向数学动画或有限模板 | 可评估复用审核方法，不启动视频流水线、不当作通用判题引擎 |
| 代数结果独立核验 | 成熟 SymPy 运算库；K-Dense 的 sympy Skill | 已固定提交安装到 Codex，原生发现启用、8 份文件一致，隔离依赖与六个自编检查通过；非 SymPy 官方 Skill | 使用项目独立解释器核对可信表达式；WorkBuddy 未导入，不保证手写识别、几何证明或错因诊断 |
| 数学公式表达、Word 可编辑公式、PDF 打印 | 现有文档工具与规范，先做公式样本核验 | 中文可选取不等于公式正确；公式图片不等于可编辑原生公式 | 不先装字体／系统注册表脚本；根据样本失败再选组件 |
| 学生本地问题档案 | WorkBuddy 受限文件操作；已有 Obsidian 为可选整理工具 | 本机 Obsidian Skill 文件存在，但说明含 macOS／brew 假设，Windows 依赖未验证 | 简单 Markdown 文件不必强依赖 Obsidian；不改现有 Vault 或默认配置 |
| 班级共性汇总 | 文档套件的数据整理／表格能力 | 一般汇总可复用，不能自动证明统计口径和学生关联正确 | 以确认后个人记录汇总，核验分母、待确认量与重复记录 |
| 整卷审核后归档、历史与最新状态 | 项目业务规则和记录模板 | 未找到经验证可直接套用的完整现成技能；不能凭通用文件写入宣称可靠 | 确认需求后编排最小业务规则；先验证，再判断是否需代码 |
| 身份／整库留本地、必要题目最小外发 | 应用权限、材料隔离和实际传输核查 | 通用“知识库／记忆”Skill 不证明隔离；模型读整库可能违反既定边界 | 真正缺口，真实数据试点前须验证；可能需要少量本地处理，不能承诺纯对话就满足 |
| 完整初中知识目录、山西适用资料与题库 | 正式课标、实际教材／复习资料和教师审核 | 是内容来源与维护任务，不是下载 Skill 就能得到已核准题库 | 来源、版本、使用权与验证状态分别记录；教材允许后补 |
| 六步辅导、三档训练、复测反馈 | 已有教学经验＋本项目教师可审查的规则 | 无现成 Skill 被证明能直接满足这批学生的全部教学要求 | 先整理可调整的模板和工作规则，不自建通用学习算法 |
| 动画、GeoGebra 可视化 | 本机 MMC／GGB／Manim 相关 Skills | 与核心作业闭环不同；部分依赖旧项目和有限题型 | 暂缓，不作为一期必须安装项 |
| 需求与后续工程方法 | Codex 的 Matt 插件、find-skills、Superpowers | 先前安装／发现证据在 docs/setup/SKILL_CHECK.md | 已有，不重装；是项目工作工具，不是老师使用系统的必需插件 |
| 当前界面原型设计 | anthropics/skills 的 frontend-design | 2026-11-05 按当前需要固定提交安装，单独目录 LICENSE.txt 为 Apache 2.0；两份文本校验一致，原生发现唯一启用，无加载错误 | 已加载应用于本地原型；未安装整套UI包或框架，详情见 docs/design/PROTOTYPE_DELIVERY.md |

## 分阶段到 GitHub 搜索的能力范围

下表是搜索计划，不是已经找到、批准或安装的清单。技术框架尚未确定时，不提前绑定某套前端／后端技能；不按数量凑一大套。

| 阶段 | 需要时搜索的能力 | 可用搜索词示例 | 使用时机 |
| --- | --- | --- | --- |
| 需求与流程 | 需求访谈、教师工作流、验收设计 | requirements、workflow、acceptance criteria | 当前优先用已安装的 Matt 访谈能力，不为同一职责重复安装 |
| WorkBuddy 一期 | 文档识别与整理、数学公式、PDF／Word、符号数学核验、本地记录 | math OCR、docx equations、pdf、sympy、local records | 针对实际业务缺口搜索；核对是否支持目标宿主与 Windows |
| 后续界面设计 | 老师操作流程、交互、界面规范、可访问性、设计审查 | ui ux、design system、accessibility、design review | 独立软件获准后，先设计审核和档案查看体验，再进入页面实现 |
| 后续软件开发 | 与已确定技术方案匹配的前端、后端、本地数据、API 接入经验 | frontend、backend、local database、api integration | 方案确定后按需搜索，当前不直接决定框架或编码 |
| 测试与质量 | 业务流程测试、公式文档核验、界面操作测试、代码审查 | testing、document validation、e2e、code review | 随实施阶段选择；先检查 Superpowers 等已有职责，避免重复编排 |
| 打包与维护 | 本地安装包、备份恢复、升级、发布检查 | desktop packaging、backup restore、release | 独立软件阶段再搜索；一期不提前部署 |

发现缺口 → find-skills 搜索 → GitHub 原仓库核实 → 比较适配性 → 按需安装 → 检查宿主发现与依赖 → 用相关任务验证。找不到适配能力或现成工具不满足时，再说明原因并规划最少必要定制；不先宣称必须自行开发。

Skills 主要帮助我们做好设计、开发与工作流执行，不是软件每一项功能都必须安装一个 Skill。数学运算库、OCR 服务等也可能是直接复用的软件组件，不能把组件和 Skill 混为一谈。

## WorkBuddy 本地检查证据（历史补充）

检查位置：`C:\Users\42248\.workbuddy\skills`。发现以下 15 个目录，逐项 SKILL.md 的 SHA-256 已记录在 docs/setup/WORKBUDDY_SKILL_INVENTORY.md；其中本轮阅读了标注的 6 份说明的前段内容，仅属部分审阅，不是完整安全审计。

| 本机目录名 | 本轮阅读状态／用途判断 |
| --- | --- |
| mmc-math-teaching | 部分阅读：读题、核符号和数学验证经验可参考；同时含动画生成流程 |
| mmc-math-teaching-v6 | 部分阅读：v6.2.0，面向动画；其 V6 生产路径仅覆盖一元一次不等式，不能扩称完整初中支持 |
| mmc-math-visualization | 部分阅读：数学验证与动画流程；可视化后续再评估 |
| mmc-pipeline-sop | 部分阅读：动画角色交接与验收规范；一期不启动 |
| mmc-ggb-verify | 部分阅读：已有 .ggb 文件的数值／界面验收，不是通用几何证明判题器 |
| obsidian | 部分阅读：Markdown 笔记整理，依赖／Windows 兼容未知 |
| agent-engineering-memory | 仅发现文件，未加载或运行 |
| ai-software-development-workflow | 仅发现文件，未加载或运行 |
| frontend-first-pptx | 仅发现文件，未加载或运行 |
| github | 仅发现文件，未加载或运行 |
| mmc-manim-preview | 仅发现文件，未加载或运行 |
| skill-trust-scanner | 仅发现文件，不因名字就视为已通过安全检查 |
| systematic-debugging | 仅发现文件，未加载或运行 |
| test-driven-development | 仅发现文件，未加载或运行 |
| workbuddy-reward-helper | 仅发现文件，未加载或运行 |

V6 说明指向的 `E:\WBBW\MMC_Manim_Project\V6_Math_Teaching\KNOWLEDGE_BASE` 和旧项目的 `references\defect-playbook.md` 路径本轮 Test-Path 为存在；没有读取其中知识资料或代码，也没有复制、改动或执行旧项目。路径存在不证明 Python、Manim、GeoGebra 或 MCP 服务可用。

标准卸载注册表路径与命令查询未取得 WorkBuddy 版本；这不能推出应用未安装。实际版本、启用状态、模型与文档套件配置仍待核实。没有读取账号、密钥或真实学生档案。

## 外部搜索与许可初查

搜索使用已核验过的 Vercel Skills CLI 1.7.6，关闭 npm 生命周期脚本；仅搜索，没有执行 skills add。输出见 docs/setup/search-reuse-anthropic-docx.txt、search-reuse-anthropic-pdf.txt、search-reuse-sympy.txt。

| 候选 | 来源和初查 | 本轮决定 |
| --- | --- | --- |
| anthropics/skills 的 docx、pdf | 搜索安装量分别约 21.2 万、22.3 万（动态快照）；对应 LICENSE.txt 为限制性专有许可，不因仓库公开就属于可任意移植的开源工具 | 不复制或安装到 WorkBuddy；优先用平台提供且使用授权明确的文档能力 |
| K-Dense-AI/scientific-agent-skills 的 sympy | 搜索约 2.1 千安装；第三方维护，仓库根 MIT；版权声明已随安装保留 | 已新增到 Codex；证据及边界见 docs/setup/SKILL_INSTALL_REPORT_2026-11-04.md，不重复装入其他宿主 |

安装量、仓库热度仅作筛选线索，不证明教学适配、安全或正确率。SymPy 是符号数学库；SimPy 是其他用途的库，不能因拼写相似装错。许可初查是记录实际条款与复用边界，不构成全面法律审查。

## 来源

- [WorkBuddy Skills 官方说明](https://www.workbuddy.cn/docs/workbuddy/From-Beginner-to-Expert-Guide/Function-Description/Skills-Market)
- [WorkBuddy Office 文档套件](https://www.workbuddy.cn/docs/workbuddy/From-Beginner-to-Expert-Guide/WorkBuddy-Zero-Cost-Skill-Top-10/Office-Document-Suite)
- [WorkBuddy Obsidian 说明](https://www.workbuddy.cn/docs/workbuddy/From-Beginner-to-Expert-Guide/WorkBuddy-Zero-Cost-Skill-Top-10/Obsidian)
- [WorkBuddy 结果查看](https://www.workbuddy.cn/docs/workbuddy/Results)
- [SymPy 官方文档](https://docs.sympy.org/latest/index.html)
- [K-Dense sympy Skill](https://github.com/K-Dense-AI/scientific-agent-skills/blob/main/skills/sympy/SKILL.md) 与[仓库许可](https://github.com/K-Dense-AI/scientific-agent-skills/blob/main/LICENSE.md)
- [Anthropic docx 许可](https://github.com/anthropics/skills/blob/main/skills/docx/LICENSE.txt) 与[pdf 许可](https://github.com/anthropics/skills/blob/main/skills/pdf/LICENSE.txt)

## 后续按需安装顺序

1. 根据当前阶段列出具体能力缺口，用 find-skills 搜索 GitHub 候选，并核实原仓库；已有能力清点只用于避免重复安装和检查宿主适配。
2. 已明确需要但尚无能力的项目可先做候选研究，不必等实际失败才搜索。验证时用虚构材料检查中文／公式文档、逐生审核、归档与导出，记录结果。
3. 按实际需要选候选，核对来源、许可、维护状态、脚本、依赖、外发范围与安装位置；避免多个渠道安装同一套。
4. 安装权限、未知脚本、覆盖配置等动作先说明；不一揽子安装无关工具，不把搜索成功当作安装成功。
5. 复用仍不能满足的审核、档案更新与隔离规则，在 PRD／MVP 确认后规划最少必要定制，并留下验证证据。
