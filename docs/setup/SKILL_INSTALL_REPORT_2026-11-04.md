# 按项目缺口搜索与安装 Skills：首轮结果

日期：2026-11-04。范围：GitHub Skills 搜索、来源核对、必要安装、依赖与发现检查；未编写产品代码，未操作旧项目，未使用真实学生资料。用户本轮授权按需安装，没有将其自动解释为已确认全部 PRD／MVP。

## 实际决定

| 能力 | 决定 | 理由和实际状态 |
| --- | --- | --- |
| 代数答案独立核验 | 新增 sympy 一项 | 当前数学题及答案核对确有用途；已固定来源版本安装、原生发现、读取并用自编题执行检查 |
| 数学手写 OCR | 暂不安装本轮候选 | 搜索结果不等于识别引擎；已读的 math-ocr 主要是转写流程说明，未证明提高中文初中手写识别可靠性 |
| UI／交互设计 | 记录候选，暂不安装 | 找到原作者 UI UX Pro Max 等，但一期是 WorkBuddy 对话工作流，尚无独立界面实施任务；不是遗漏 UI 设计 |
| Word／PDF | 不重复安装 | Codex 已有文档能力规范；WorkBuddy 文档能力需在目标宿主验证。此前限制性许可的候选不直接移植 |
| 需求、规划、测试和审查方法 | 不再加重复工具 | 已有 Matt、find-skills、Superpowers；按阶段使用，不为了数量叠加相同职责 |

## 新安装的来源和位置

- 来源：[K-Dense-AI/scientific-agent-skills 的 sympy](https://github.com/K-Dense-AI/scientific-agent-skills/tree/a25cf9ec00e2745d03f8704acf6f6919694ccd9a/skills/sympy)，第三方维护的 Skill，不是 SymPy 官方 Skill。
- 固定 Git 提交：`a25cf9ec00e2745d03f8704acf6f6919694ccd9a`；Skill metadata version 为 1.5。
- 搜索快照：sympy 约 2.1K 安装；仓库 56,062 stars、未归档。热度只作筛选线索，不证明业务质量。
- 唯一安装位置：`C:\Users\42248\.codex\skills\sympy`。这是 Codex 研发侧工具；本轮没有向 WorkBuddy 或第二个目录重复安装。
- 使用已读取的 Codex 自带 skill-installer，命令退出 0；上游目录仅含 8 份 Markdown，没有附带可执行脚本。读取了完整 SKILL.md、核心数学参考及上游验证说明，其他参考未逐行审计。
- 上游根 MIT 许可另存为安装目录的 LICENSE-K-Dense.md，保留版权声明；Skill 对 SymPy 库许可的链接与 Skill 仓库根许可分别记录。

实际安装命令：

```powershell
python 'C:\Users\42248\.codex\skills\.system\skill-installer\scripts\install-skill-from-github.py' --repo K-Dense-AI/scientific-agent-skills --path skills/sympy --ref a25cf9ec00e2745d03f8704acf6f6919694ccd9a --dest 'C:\Users\42248\.codex\skills' --method download
```

没有覆盖既有目录或改 Codex 配置。安装前检查 Codex、.agents、WorkBuddy 的 sympy 目标均不存在。未执行远程仓库脚本、未安装其整个科学工具集。按安装器说明，新技能可在下一轮发现；当前另用新启动的原生进程核验，不声称当前聊天已自动刷新或自动触发。

## 必要运行依赖

系统 Python 3.12.10 原先没有 SymPy。本轮创建专用环境：

`E:\GPT\AI-Tutoring-Diagnosis\.tools\sympy-venv`

通过 PyPI 的 wheel 安装 `sympy==1.14.0` 和 `mpmath==1.3.0`，未源码构建；未安装 NumPy、SciPy、Matplotlib、ANTLR 或编译器。只补当前精确代数运算所需依赖，不改全局 Python。pip check 返回无依赖损坏，安装后全局 Python 的 SymPy 仍不存在。

后续在本项目调用时，使用该环境解释器，不能用系统 python 误判缺依赖：

```powershell
& 'E:\GPT\AI-Tutoring-Diagnosis\.tools\sympy-venv\Scripts\python.exe' -c "import sympy; print(sympy.__version__)"
```

## 验证证据

| 检查 | 结果 | 证据文件 |
| --- | --- | --- |
| GitHub 来源与文件树 | 固定提交及文件 Git blob 哈希已留存 | sympy-source-manifest.json |
| 文件一致性 | 8 个上游文件逐一比对 Git blob 哈希，0 不一致 | sympy-file-verification.json |
| Skill 安装 | 官方安装器退出 0，安装日志已保存 | sympy-install.txt |
| 原生发现／启用 | 临时 Codex app-server skills/list 共 43 项；sympy 唯一匹配、enabled=true，加载错误 0 | sympy-codex-discovery.json |
| 运行依赖 | SymPy 1.14.0、mpmath 1.3.0，pip check 通过；wheel 来源与哈希保留 | sympy-dependencies-install.json、sympy-dependencies-install.txt |
| 自编数学检查 | 6/6 结果符合预期 | sympy-synthetic-verification.json |

SKILL.md SHA-256：`BB97087BDDDCCC845401737DDC7F7A8DA1C14CED5E8D40DA01271C991AC46E23`。

六个自编案例：二次函数顶点、二次方程求根并代回、不等式闭区间、实数根式绝对值、分母零点排除、根式方程增根排除。题目均由诊断命令直接构造可信符号表达式，没有从 OCR／用户字符串执行 parse_expr、sympify 或 lambdify，也没有创建可对外输入的求解接口。

这证明所检查的 Skill 发现与本地数学依赖可用，不证明完整初中覆盖、真实识图、步骤分、错因分析、教师省时或 WorkBuddy 端到端已通过。上游声称的测试数量属于上游说明，未作为本项目已执行结果。

## 搜索及暂缓候选证据

- 已查 skills.sh 目录，并通过固定 Vercel Skills CLI 1.7.6 搜索 `sympy --owner K-Dense-AI`、`math ocr`、`ui ux`。联网重试均成功；日志为 search-install-*-network.txt。
- 受限环境首次三个搜索失败（EACCES，无法访问现有代理），GitHub git ls-remote 同样失败。经联网权限重试后成功；没有更改代理或把失败解释为仓库不存在。
- math-ocr：搜索约 14 安装，作者仓库 5 stars。已读取[原始 Skill](https://github.com/texra-ai/texra-scientific-skills/blob/main/skills/math-ocr/SKILL.md)，核心是数学图片到 LaTeX 的转写检查说明，不自带经过本项目验证的识别引擎。部分“根据上下文解决歧义”的做法还需与保留学生原笔迹、不替学生修正答案的业务边界核对。未安装；不据低热度断言其不安全。
- UI UX Pro Max：搜索约 433.2K 安装，已读[原作者 README 前段](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill)。仅列后续候选；未做完整脚本／许可审查，不当作已批准安装。Vercel web-design-guidelines 也出现于结果，暂不安装界面审查工具。

## 使用范围与下一步

sympy 用于可信数学表达式的独立结果核对。需核实原题、定义域、除数和条件；求解工具未解出不等于无解，也不能据结果断定学生的错误原因。不得把 OCR 文本直接作为可执行表达式。

当前继续围绕 WorkBuddy 教师逐生整卷审核与本地学习档案核实实际能力。后续只有出现具体缺口，才继续搜索、审查和安装；本轮没有批准软件编码或把完整档案送进模型上下文。

## 来源与署名

- [SymPy 官方安装文档](https://docs.sympy.org/latest/install.html)；运行依赖版本以实际安装和检查为准。
- [K-Dense 根许可](https://github.com/K-Dense-AI/scientific-agent-skills/blob/a25cf9ec00e2745d03f8704acf6f6919694ccd9a/LICENSE.md)。
- 按已加载 Skill 的署名要求，已核对其论文记录并在本报告保留引用：Kassis, T., Agarwal, V., He, Y., Patel, D., & Brueckner, A. M. (2026). [Scientific Agent Skills: A Library of Procedural Knowledge for Research Agents](https://doi.org/10.48550/arXiv.2609.00065)。核对 arXiv 当前版本为 v2；引用使用不带版本后缀的 DOI，不据此宣称教学效果已经验证。
