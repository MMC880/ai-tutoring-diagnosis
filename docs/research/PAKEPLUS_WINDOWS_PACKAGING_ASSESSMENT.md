# PakePlus 对晋学智辅 Windows 封装的适用性

核验日期：2026-11-08。用户本轮授权研究 PakePlus，并要求今后每一步在执行前说明范围、获准后再做。本轮只读取官方网页/源码与现有项目，整理此研究文档；没有安装、运行下载的软件、打包、配置 GitHub、读取学生档案或修改应用。

## 结论

**有参考价值，保留为候选；尚不采用为正式封装工具。** PakePlus 能为网站或静态前端提供桌面窗口；晋学智辅还需要分发 Python、业务依赖和本地服务，处理数据库目录、启动/退出及升级。读到的源码不足以证明 PakePlus 已经自动解决这整条链。它与 Matt Skills 职责不同，没有直接的工作流/运行库冲突；这不是实际安装后的兼容性验收。

当前更贴近既有 Python 项目的候选仍是 pywebview＋PyInstaller；这是技术适用性判断，不是已批准路线或实际构建结果。Tauri＋已冻结的 Python 后端在技术上也可行，需要额外集成，不能由 PakePlus 的静态打包宣传直接推得。

## 已核对的证据

|材料|实际读到的内容|可以/不能据此得出的结论|
|---|---|---|
|PakePlus 官方 README 与 Guide|介绍网站、HTML/dist 包装；列出本地打包和 GitHub Actions 等方式|适合作为窗口封装候选；“小于5M”“几分钟”等属于作者描述，不是咱们完整软件的实测体积/耗时。|
|package.json / Cargo.toml|读取到版本字段2.2.8、Tauri2相关依赖|只是已读源码字段；没有证明其为当前最新release，或本地已安装。|
|cmds.rs 的 start_server|使用 warp::fs::dir 提供静态文件，附带 callback 路由|有本地静态服务实现；这不是晋学智辅的 Python API、SQLite及档案业务服务。|
|cmds.rs 的 windows_build / build_local|复制HTML目录到 config/www，写配置/注入脚本，Windows路径调用rh.exe；按系统分派本地构建|证明存在本地构建入口；未发现这些函数自动分析、冻结和捆绑本项目Python依赖、管理其后台生命周期的实现。不能把“支持执行命令”当作已实现后端分发。|
|Tauri 官方 sidecar 文档|可嵌入外部可执行程序，例子明确包含用PyInstaller打包的Python API服务器；需要 externalBin、目标架构文件及启动配置|Tauri可以承载已冻结的后端；PakePlus图形工具是否暴露所需配置、能否正确退出后台，仍需独立实测。|
|Tauri 官方 Windows installer 文档|Windows安装包需要明确WebView2处理方式，含联网引导、离线安装或固定Runtime等选项|不能由开发机已有WebView2推断老师新电脑可用；不能承诺整个离线交付只有5M。|
|PakePlus 工具自身 tauri.conf.json / lib.rs|包含自身插件、更新地址、权限及窗口能力|这是打包工具本身的配置；不能不加区分地说成它生成的晋学智辅程序必有相同行为。|

官方仓库：[README](https://github.com/Sjj1024/PakePlus)、[中文README](https://github.com/Sjj1024/PakePlus/blob/main/README_ZH.md)、[Guide](https://pakeplus.com/guide/)、[构建说明](https://pakeplus.com/guide/build)。源码：[package.json](https://github.com/Sjj1024/PakePlus/blob/main/package.json)、[Cargo.toml](https://github.com/Sjj1024/PakePlus/blob/main/src-tauri/Cargo.toml)、[cmds.rs](https://github.com/Sjj1024/PakePlus/blob/main/src-tauri/src/command/cmds.rs)、[配置](https://github.com/Sjj1024/PakePlus/blob/main/src-tauri/tauri.conf.json)、[lib.rs](https://github.com/Sjj1024/PakePlus/blob/main/src-tauri/src/lib.rs)。

Tauri一手依据：[外部程序/sidecar](https://v2.tauri.app/develop/sidecar/)、[Windows分发与WebView2](https://v2.tauri.app/distribute/windows-installer/)。

## 对现有项目的实际影响

1. **前端不能脱离本地业务服务直接当完整软件分发。** 当前 [app.js](E:/GPT/AI-Tutoring-Diagnosis/app/web/app.js:15) 用相对 `/api/` 请求；[server.py](E:/GPT/AI-Tutoring-Diagnosis/app/server.py:48) 核验本机Host、Origin及写入令牌。只装入静态文件时，这些API不会凭空存在。若包装正在运行的本机网页，仍需解决谁启动Python服务、何时可用、如何关闭。若改用Tauri资源来源请求后端，则需单独设计受限适配，不能删除现有校验图省事。
2. **本地档案与窗口外壳分开考虑。** SQLite、原图、附件和备份必须保存在稳定可写位置；不能混进临时解包目录，不能为了云构建上传真实档案。启动器现有服务身份检测应保留，不结束其他程序的进程。[现有交付建议](E:/GPT/AI-Tutoring-Diagnosis/docs/design/WINDOWS_DELIVERY_AND_SIMPLE_UI.md:1)、[launcher.py](E:/GPT/AI-Tutoring-Diagnosis/app/launcher.py:1)。
3. **本地运行与离线AI分开。** 档案本地可用，不代表所选外部模型可以离线调用。封装不会改变既定的身份、本地完整档案、模型传输预览和教师确认边界。
4. **手机App不等于微信小程序。** 作者描述Android/iOS封装，不是微信小程序交付证明；当前不据此扩展家长端或云同步。

## 商业分发与云构建的未决事项

仓库 [LICENSE](https://github.com/Sjj1024/PakePlus/blob/main/LICENSE) 为MIT文字，包含分发/销售软件副本的许可措辞；但所读英文README的入门段又提到个人使用、不得传播或商用，README还称前端不再开源。不同材料的适用范围不清楚。这里仅记录文字不一致，不作法律结论。对咱们未来收费分发，需要先明确具体版本、所使用源码/预编译组件与打包服务各自的条款，不能仅凭MIT徽标确认完整商业交付无问题。

英文README还提示GitHub方式会把打包资源放进用户自己的公开仓库；[隐私说明](https://pakeplus.com/guide/policy)写明云构建配置会传至GitHub，并列有日志/使用信息等处理。官网“本地保存”等宣传不等于所有构建模式零传输。本项目当前只用本地Git；本轮没有创建Token、fork、远端、Actions或上传任何项目/学生文件。本地模式不应因为云模式需Token就被一并说成必须Token。

## 与 Matt Skills 的关系

|工具|职责|如何配合|
|---|---|---|
|Matt Skills|帮助代理访谈、做原型、写规格、拆任务、测试和评审|继续作为开发流程；不承担程序打包。|
|PakePlus|为网页/静态前端提供桌面封装能力|若获准且验证适合，可作为封装阶段工具；不取代档案业务。|
|pywebview＋PyInstaller候选|Python桌面窗口和解释器/依赖分发|更直接复用现有Python业务；仍须检验窗口、资源、资料路径及干净Windows启动。|

这是职责比较，不是必须叠加三套工具。若用Matt组织某阶段，就不再让另一套流程重复访谈、拆相同任务。现有[Matt审计](E:/GPT/AI-Tutoring-Diagnosis/docs/research/MATT_SKILLS_NEXT_DEVELOPMENT_AUDIT.md:1)继续有效。pywebview官方明确提供[PyInstaller封装方式](https://pywebview.flowrl.com/guide/freezing)，PyInstaller说明会打包解释器和依赖、使用者不需另装Python；动态导入等仍可能要补配置。[PyInstaller官方机制](https://pyinstaller.org/en/stable/operating-mode.html)。

## 建议下一步：先取得界面与工作范围许可

三布局原型已交付到独立分支 `prototype/teacher-three-entry`、提交 `bace3b3`，但用户还没有明确选定A/B/C。当前浏览器打开A不能代替用户选择。

建议下一步仅做“以用户选定布局为基础的开发规格与任务草稿”：列明三入口、现有功能归位、学生选择、未保存/未确认状态、历史追溯、验收条件及任务依赖。产物为本地Markdown，先给用户审阅；不改业务代码、不改数据库、不安装工具、不生成EXE。需要的本地工程配置也须先展示具体草稿，按用户要求获准再写，不能悄悄初始化。

如用户更想先验证PakePlus，另提一项独立实验供批准：只用原型三份静态资源和虚构数据，在独立目录测试本地桌面壳，不接真实库、不使用GitHub云构建；先核清所用组件条款。即使成功也只算静态壳通过，不算正式软件已可分发。此实验本轮没有执行。

## 核验边界

- 主代理已实际打开上述官方文档及关键源码，并复读项目相关代码；没有执行第三方下载脚本/程序。
- GitHub API的main提交SHA及工作流路径访问未成功；未固定完整远端快照、未读全仓库、未核对最新release。本报告链接指main，后续采用前需锁定具体版本重新核验，不能假称完整源码审计或可复现构建已通过。
- 独立研究代理提供了若干源码交叉发现，但未完成交付；本报告由主代理按实际已读证据整理。
- 本轮没有应用行为变化，未运行应用回归、PakePlus构建、EXE、网络隔离或无Python新机验证。
