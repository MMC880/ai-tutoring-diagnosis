# 数学公式与重复模板 Skills 初查

后续进展：用户已授权按缺口搜索与安装。现已新增用于代数结果核对的 sympy Skill 和隔离运行依赖，见 ../setup/SKILL_INSTALL_REPORT_2026-11-04.md；它不解决手写识别或 Word 公式转换。下文为最初公式候选初查记录，不再把是否搜索／安装作为未获授权事项。

日期：2026-11-04。范围：搜索、读取说明、核对适配方向；未安装新技能、未执行候选脚本、未生成 Word/PDF、未改系统字体或注册表。

## 需求需要分清的两层

1. 文档公式复用：公式在老师的 Word 中可编辑，分式、根式、上下标等表达正确，文档模板能重复使用。PDF 文本可选并不证明所有公式可提取或可编辑，需独立验证。
2. 题型模板复用：同类型题更换条件和数值后，题意、解法、答案、难度和知识点仍成立。这包含数学及教学规则验证，不是只解决排版。

最新澄清：用户指第一层的文档公式表达、识别与处理复用，涵盖输入识别和后续文档整理；本次没有要求参数化出题模板。新增 Skill 的选择与项目拆分，待用户看过项目总览和海报后再进行。

## 已执行搜索

已读取 find-skills；先查看 skills.sh 目录，再通过固定 Vercel CLI 1.7.6 搜索 `word equations`、`math worksheet`、`latex`，三个命令退出 0。关闭 npm 生命周期脚本和遥测，仅搜索不安装。

完整结果：docs/setup/search-word-equations.txt、search-math-worksheet.txt、search-latex.txt。安装数为本轮查询快照，不能作为安全或质量保证。

## 已有能力与候选

| 项目 | 本轮核实内容 | 状态与判断 |
| --- | --- | --- |
| 已安装 Documents Skill | 本地 SKILL.md 的 Equations 段要求可编辑 Word 公式优先使用原生 OMML，并在渲染后检查；不应把图片伪称为原生公式 | 优先利用已有规范制定样例验收；本轮没有实际生成或验证公式文件 |
| Kantyc/pandoc-math-docx | 搜索结果为 1 次安装；作者仓库显示 0 stars；说明使用 Pandoc 生成原生 Word 公式 | 第三方候选，仅查看，不作为已验证或官方推荐工具 |
| math worksheet 搜索 | 找到 zairoo-ai-sg 的候选，结果分别为 3、2、1 次安装 | 仅发现，未完成仓库/脚本审查，不推荐直接安装 |
| latex 搜索 | 多个较高安装量结果偏论文、海报与学术排版 | 未证明适合中文初中作业和 Word 可编辑公式，不按热度直接选择 |

已安装 Documents 路径：C:/Users/42248/.codex/plugins/cache/openai-primary-runtime/documents/26.1030.10813/skills/documents/SKILL.md。这里只检查了公式相关规范，不宣称完整文档工作流已执行。

## 已查看的候选行为

[pandoc-math-docx 的作者说明](https://github.com/Kantyc/pandoc-math-docx/blob/main/SKILL.md)包含自动下载依赖、安装系统字体并写入 HKLM 的步骤。本轮只审阅说明，没有遵循其自动安装步骤；未审查全部脚本，不声称完成安全审计。

[作者仓库](https://github.com/Kantyc/pandoc-math-docx)的低安装/关注数量仅表示外部使用证据有限，并非断言不安全。[Pandoc 官方手册](https://pandoc.org/MANUAL.html#math)说明 docx 数学输出使用 OMML，可作为底层能力依据；这不等于本项目文件往返转换已验证。

## 当前建议

先明确公式排版与题型复用的优先需求，再用已安装文档规范制定一个小样例验证计划；若确需新增 Skill，先审查其脚本、依赖和写入范围，再按用户已授权边界处理。当前没有必要为单次搜索改变系统配置。

Skill 是 Codex 的工作指导，不是已部署给老师使用的公式模块。未来产品是否能可靠读取原始 Word/PDF、生成可编辑材料并验证数学答案，仍需独立实现和验收；本轮不编码。
