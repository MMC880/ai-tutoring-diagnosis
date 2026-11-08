# Windows构建与验证

只在Windows x64构建。目标为完整便携文件夹，不是单文件EXE。依赖安装与输出均位于本项目，不改系统Python。

1. 用Python3.12创建`.tools/windows-build/venv`。
2. 官方PyPI安装固定依赖，完整解析版本见`requirements-lock.txt`。proxy_tools0.1.0没有官方wheel，需要先审查官方源码再本地构建wheel，不要用不明镜像包替代。
3. 用隔离环境执行`packaging/windows/build.py`。脚本调用PyInstaller、加入说明及许可、检查禁止文件、生成SHA-256清单与ZIP。
4. 用研发Python执行`packaging/windows/verify_bundle.py`。需Node及本机WebView2和.NET。仅新建`.qa-temp`合成目录；不会用真实库，不会外发AI。

构建命令：

```powershell
.tools/windows-build/venv/Scripts/python.exe packaging/windows/build.py
python packaging/windows/verify_bundle.py
```

proxy_tools官方来源：
`https://files.pythonhosted.org/packages/f2/cf/77d3e19b7fabd03895caca7857ef51e4c409e0ca6b37ee6e9f7daa50b642/proxy_tools-0.1.0.tar.gz`

源码SHA-256：`ccb3751f529c047e2d8a58440d86b205303cf0fe8146f784d1cbcd94f0a28010`。本轮完整检查setup.py、setup.cfg与唯一运行模块：构建入口只有setuptools.setup，无自定义脚本或网络下载钩子；隔离环境中`pip wheel --no-build-isolation --no-deps`后再按固定依赖安装。本地wheel与安装日志保留在`.tools/windows-build/`，不入Git。

交付目录：`docs/delivery/windows-desktop-0.1.0/`。每次构建记录真实源码提交及工作树是否有改动；最终ZIP体积与SHA-256在`build-summary.json`，包内逐文件清单在`MANIFEST.sha256`。不要手改包内文件后继续沿用旧校验值。

验证报告：`app/.qa-temp/windows-package/verification.json`。它区分真实冻结EXE、合成业务链路与未验证项。清除PATH中的Python不等同于另一台干净Windows验证。自动烟测捕获个人打印页向系统浏览器的分派地址，不自动调用真实打印机；正常关闭对话框的确定/取消仍需人工验收。
