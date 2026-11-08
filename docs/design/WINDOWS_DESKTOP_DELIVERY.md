# 晋学智辅 Windows便携试用版0.1.0

2026年11月8日。用户明确授权封装EXE，沿用`5b62ff0`的三个教师入口、Python业务逻辑、HTML/CSS/JavaScript页面和SQLite本地档案。安卓端留待下一阶段，不纳入本轮。

## 交付与启动

完整压缩包：`docs/delivery/windows-desktop-0.1.0/晋学智辅-Windows-x64-0.1.0.zip`。

解压完整文件夹，双击`晋学智辅/晋学智辅.exe`。EXE和`_internal`依赖必须放在一起。包内有中文使用说明、试用问题反馈表、构建版本、第三方许可和逐文件SHA-256清单；ZIP大小及完整哈希见同目录`build-summary.json`。

首次启动为空档案、无AI密钥。默认资料位置`%LOCALAPPDATA%\JinxueZhifu\data`，与程序目录分开。旧开发版及WorkBuddy资料未自动迁移，真实资料与配置未读、未改、未打包。

目标Windows10／11 x64，随包带Python解释器和依赖。系统仍需WebView2 Runtime和.NET Framework≥4.6.2；启动前检查，缺失给出中文微软官网提示，不静默安装。另一台干净机器的兼容性须实测。

## 包装层做了什么

- pywebview6.2.1／WebView2原生窗口，PyInstaller6.22.3生成Windows GUI EXE；内部业务页面版本仍为0.26。
- HTTP服务与窗口在同一进程，自选127.0.0.1可用端口，保留原接口的来源和会话校验。
- 先锁同一资料目录，再打开Store；重复启动提示已有实例，不结束其他程序。退出会等本实例在途请求结束，释放自有服务与锁。
- 同步关闭事件仅做状态判断；JavaScript忙碌检查放在后台，再回到原生确定/取消。浏览器私有缓存使用全新进程自有临时目录，不清理学生目录旁的同名文件夹。
- 个人报告在桌面环境打开核对后的完整本机打印地址，保留普通浏览器原有弹窗逻辑；无新增自动发布或AI调用。

## 实际验证与证据

最终冻结产物的结果以`app/.qa-temp/windows-package/verification.json`为准；每次验证新建独立合成目录，不拿旧结果充数。

最终本机冻结产物22项检查通过，运行目录`app/.qa-temp/windows-package/native-dgrafy6i/`。ZIP为29,536,715字节，SHA-256为`b8269ae948f7962309f9eb32411f109c64f3c9d726fad0df0602aca6280c4e76`，314个文件。后续重建如有变化，必须重新更新校验值。

已执行：

- 真正Windows GUI PE、ZIP CRC和逐文件哈希；解压到中文/空格路径，从另一工作目录启动。
- 子进程清除PYTHONHOME/PYTHONPATH/VIRTUAL_ENV，PATH只留Windows系统目录，仍使用随包解释器加载原生WebView2页面；不等同于另一台无Python电脑。
- 合成两题登记、教师模拟确认、知识问题档案、独立复测；备份后新增临时稿，再恢复到备份快照；重开保留两条确认及一条独立复测。
- 重复启动拒绝；窗口关闭走同一异步关闭守卫，结束后自有端口不再监听；无关相邻webview文件夹哨兵未改。
- Word输出为真实DOCX并通过ZIP部件检查；打印页内容有效。实际点击个人报告PDF入口，捕获原生后端向系统浏览器分派的本机URL，再由服务校验学生、快照指纹及打印页内容。烟测不实际启动系统浏览器或打印机。
- 实际查看打包WebView2截图：三个主入口与学生档案显示正常。截图保存在该次合成运行目录`packaged-window.png`。
- Python完整回归423项、桌面针对检查14项、个人报告浏览器回归20项通过。桌面14项包含于完整423项，不累计成不同测试。

未验证：另一台无Python开发环境的干净Windows、原生关闭对话框的实际取消与确定点击、原生Word保存对话框、系统浏览器真实打印/另存PDF及纸面效果。缺组件路径以隔离单元测试验证，本机未卸载WebView2或.NET模拟缺失。

未验证教师净省时、真实手写批改准确率和学生学习效果。不得把本轮包装验证称为教学验收。

## 审查与构建来源

Matt Pocock code-review分别审查规范与需求：修正UI线程关闭阻塞、缓存清理范围、个人报告弹窗及.NET前置检查四项发现，静态复审未发现新的阻断问题。原生交互未测部分继续保留。

首次备份烟测误用零题草稿，被既有“1至100题”约束拒绝；仅修正合成测试数据，未放宽业务校验。首次重开验证误从bootstrap取复测，改读已有学生档案接口；未改应用数据接口。失败日志与后续结果分别留存，不将失败回执称为通过。

构建环境只位于`.tools/windows-build/venv`，系统Python未改。固定版本及官方来源见`packaging/windows/BUILDING.md`和`requirements-lock.txt`。proxy_tools0.1.0无官方wheel，完整审查并校验官方源码后在隔离环境制轮；其他依赖使用官方二进制发行。

包内`构建版本.json`记录实际构建时的Git提交和工作树状态；本轮首次构建发生在提交前，`source_has_uncommitted_changes=true`为真实状态，不冒称清洁提交构建。包装源码及说明完成验证后作本地Git提交，构建产物、合成库、密钥与日志按规则不入Git。

## 给甲方的最小试用

按“找学生→登记已批改作业→保存待审→老师确认→档案看证据→当前批次班级问题→复测后看变化”演示。首次可用虚构材料；备份后再安排获授权的真实资料试用。记录复现步骤、版本及截图，截图遮住身份，不把整份库或密钥当反馈。

当前支持多文件选择；拖拽导入、跨次班级累计、安卓安装包、家长端、会员收费均未加入。已有个人档案与历史不会为安卓方向推倒重来，但APK不是简单更改EXE后缀，需要另定移动端数据和操作边界。

核心说明：[教师功能说明书](../pilot/CORE_FUNCTIONS_FOR_TEACHERS.md)、[包内使用说明源文件](../../packaging/windows/USER_GUIDE.md)。选型依据：[PyInstaller](https://pyinstaller.org/en/stable/operating-mode.html)、[pywebview](https://pywebview.flowrl.com/guide/freezing)、[微软WebView2](https://learn.microsoft.com/en-us/microsoft-edge/webview2/concepts/distribution)。
