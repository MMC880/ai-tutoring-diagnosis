# Windows 模型 API 配置的安全本机持久化研究

日期：2026-11-12。工程基线：`277e06f`。范围：官方资料核对与方案说明；没有实现功能、安装依赖、读取或枚举用户真实凭据、调用模型或修改学生资料。研究文档纳入本轮本地版本管理。

当前测试入口复核、离线结果、老师操作与代码落点见 [MODEL_CONFIG_REVIEW.md](MODEL_CONFIG_REVIEW.md)。

## 推荐结论

**当前 Windows / Python FastAPI / Electron 45.2.3 架构，推荐由 Python 后端直接使用当前用户作用域的 DPAPI，将完整的 `base_url + model + api_key` 配置加密后存为一个本机文件。** 可用标准库 `ctypes` 封装 Windows API，无需新增第三方密钥库、Electron 原生扩展或跨语言凭据 IPC。此处是拟议实现路径，本轮未编写或验证该封装。

使用 `CryptProtectData` / `CryptUnprotectData`，不使用 `CRYPTPROTECT_LOCAL_MACHINE`；两端指定 `CRYPTPROTECT_UI_FORBIDDEN`，不弹出系统交互。首次保存应由老师明确选择“记住本机配置”；启动恢复不自动测试连接、不发送学生资料。默认是否勾选属于产品决策，最小建议为默认不勾选。[S5][S6]

**不建议把完整 API key 直接放进一个 Credential Manager 通用凭据。** 官方上限是 `CRED_MAX_CREDENTIAL_BLOB_SIZE = 5 * 512 = 2560` **字节**，现有 `ProviderConfig` 接受最多 4096 个可打印 ASCII 字符，即最多 4096 字节，尚未计算地址、模型及封装开销。不能默默截断、降低现有上限，或直到 Windows 写入时才告诉老师失败。[S1][S7]

备选为 Electron `safeStorage`：Windows 使用 DPAPI 保护密钥，但 API 位于 Electron 主进程。现有供应商请求、配置验证和活动密钥都在 Python；采用它需要主进程与 Python 间新增经过认证的恢复、保存和错误协调流程，因此当前不是改动最少的方案。若未来由 Electron 统一管理跨平台配置，再考虑这一方案。[S8][S9][S10][S11]

这些方案保护磁盘上的秘密并提供 Windows 用户边界，**均不能承诺阻止同一 Windows 用户身份下的其他程序获得正在使用的密钥**，也不防御已经控制该用户会话的攻击者。Electron 官方对 Windows 明确说明了同用户程序这一边界；Credential Manager 的读写依据当前令牌的用户凭据集，DPAPI 解密依据登录凭据。[S2][S3][S5][S8]

## 已核对的工程现状

以下是本轮读取源码所得，不是推测已有安全存储：

| 位置 | 当前行为与对方案的影响 |
| --- | --- |
| `v2/backend/provider.py` / `ProviderConfig` | `base_url` 最多 400 字符，`model` 为 1—160 字符，`api_key` 为 1—4096 字符；`configure()` 限制 key 为字符码 33—126，故合法 key 的 ASCII / UTF-8 编码长度等于字符数。 |
| `ProviderService.__init__()` / `settings()` | `_config=None`，`key_storage='PROCESS_MEMORY_ONLY'`；没有读取持久化配置。 |
| `configure()` / `_request()` | 要求标准 HTTPS，无内嵌用户名密码、query、fragment；仅默认端口或 443；拒绝 localhost 和直接填写的非公网 IP；去掉地址结尾 `/`。实际请求使用该配置中的完整地址加 `/chat/completions`，`follow_redirects=False`。这些校验与不跟随重定向应保留；本轮没有把它扩大称为所有 DNS / 网络层威胁均已解决。 |
| `v2/backend/main.py` | 已有 `GET /api/provider`、`POST /api/provider`、`POST /api/provider/clear`、`POST /api/provider/test`；后端持有密钥并调用供应商，无读取明文 key 的接口。 |
| `v2/src/main.tsx` | 提交时发送完整地址、模型和新输入 key，成功后清空输入框；修改草稿会暂停当前窗口发送。草稿暂停是前端行为，不能代替后端的配置绑定及多窗口一致性。 |
| `v2/package.json` | Electron 固定为 `45.2.3`，本轮未升级。 |
| `v2/desktop/main.cjs` / `preload.cjs` | 窗口已有 `contextIsolation=true`、`sandbox=true`、`nodeIntegration=false`；已有特定 IPC 与 sender 验证，没有 safeStorage 凭据桥。 |
| `v2/desktop/runtime.cjs` | 打包后 Python 为子进程，已有单独的本地桌面操作令牌。API key 不应加入命令行、环境变量或日志；选择 DPAPI 无需为存储再传一遍明文。 |
| `v2/backend/operations.py` | 学生备份递归打包 `archive.root` 下的文件，仅排除特定 SQLite / `.tmp`；不能把凭据文件放入归档目录后假定备份自动排除。 |

## 三种方案比较

| 维度 | Credential Manager 通用凭据 | 当前用户 DPAPI 文件 | Electron safeStorage |
| --- | --- | --- | --- |
| 官方接口 | `CredWriteW` / `CredReadW` / `CredDeleteW`，类型 `CRED_TYPE_GENERIC`。[S1—S4] | `CryptProtectData` / `CryptUnprotectData`。[S5][S6] | Electron 主进程 `safeStorage`；45.2.3 应优先异步 API。[S8][S9] |
| 秘密放在哪里 | Windows 用户凭据集，应用按自有 `TargetName` 读取。[S2][S3] | 应用保存 DPAPI 输出密文；Windows 管理保护材料。[S5] | 应用仍需保存返回的加密 Buffer；Windows 密钥由 DPAPI 保护。[S8] |
| 当前 4096 ASCII key | 单个 blob 不支持；仅 key 就超出 2560 字节。[S1][S7] | DPAPI 文档没有 Credential Manager 的 2560 字节限制；4096 字节加封装的真实 round-trip 尚未实测。[S5] | 文档没有 2560 字节限制；具体长度兼容性未实测。[S8] |
| 当前 Python 架构改动 | Python 封装 Win32，或新增依赖；还要解决长度与配置一致性 | Python 封装两个 DPAPI API、密文文件读写及状态；无新进程通信 | 主进程持久化，加 renderer → main 的有限 IPC 及 main ↔ Python 的认证桥接 / 启动恢复协调 |
| 用户边界 | 当前令牌所关联的用户凭据集；不是应用独占保险箱。[S2][S3] | 默认用户作用域；不是应用独占密钥。[S5] | Windows 防其他用户，不防同用户的其他应用。[S8] |
| 同用户本机重启恢复 | `CRED_PERSIST_LOCAL_MACHINE` 覆盖后续登录会话；须实际测试应用封装。[S1] | 密文文件与用户 DPAPI 材料仍可用时可恢复；须重启实测。[S5] | 密文和该应用所需的 profile / key 材料仍可用时可恢复，不能只复制 Buffer 就宣称可迁移。[S8] |
| 自动跨电脑 | `LOCAL_MACHINE` 不使凭据在另一电脑的该用户会话可见；不同于 `ENTERPRISE`。[S1] | 通常同电脑，官方明确列出 roaming profile 可跨电脑的例外；不是绝对硬件绑定。[S5] | Windows 基于 DPAPI，不承诺 portable 密钥；具体 profile、版本与域环境待测。[S8] |
| 备份 / 删除 | 不在普通学生 ZIP 内，但 Windows 存在独立的凭据备份恢复机制；删除不撤销已有备份。[S12][S13] | 本应用应将密文放在学生归档外，不纳入业务备份；删除当前文件不撤销历史备份或供应商 key | 同样需排除密文和相关 profile 材料；删除应用保存的密文，不是撤销上游 key |
| 建议 | 长度限制已明确收紧时可选；本项目当前不首选 | **推荐最小方案** | 跨平台统一到主进程管理后可选 |

表中“改动最少”“建议”“不纳入备份”为工程判断与拟议产品契约，非 Windows 自动提供的额外保证。

## Credential Manager 的精确边界

### 类型、名字及持久化标志

`CRED_TYPE_GENERIC=1` 为应用定义的通用凭据；Windows 说明它安全保存，不被特定认证包自动使用。它不会替应用把 key 绑定到 HTTP 地址或阻止发错服务。[S1]

凭据由 `TargetName + Type` 唯一标识。`TargetName` 不区分大小写，通用类型应包含服务 / 公司前缀。`UserName` 对通用类型会被凭据管理器忽略，不能把它当作授权隔离或 endpoint 绑定。[S1]

如选此备选，只访问本应用一个可预测的专有 target，例如 `JinxueStudentFirst/Provider/v1`，而不是扫描用户全部凭据。可将绑定值放在受限大小的版本化 blob 内；如未来多配置使用哈希 target，仍必须在 blob 内校验实际地址与模型，不能只信名字。

| 标志 | 官方真实含义 |
| --- | --- |
| `CRED_PERSIST_SESSION=1` | 当前登录会话存活期间存在，同用户其他登录会话不可见，注销后不存在。[S1] |
| `CRED_PERSIST_LOCAL_MACHINE=2` | 同一用户、同一电脑的后续登录会话可见；该用户在其他电脑的会话不可见。**不是本机所有用户共享。** [S1] |
| `CRED_PERSIST_ENTERPRISE=3` | 可覆盖同用户其他电脑的会话，但账户配置、无 roaming profile 等条件可能使其仅本机持久化；不适合把需求定义为本机保存。[S1] |

不要混淆 `CRED_PERSIST_LOCAL_MACHINE` 与 DPAPI 的 `CRYPTPROTECT_LOCAL_MACHINE`：前者控制同用户凭据的会话持久化范围；后者将 DPAPI 数据关联到电脑，允许该电脑上的任意用户解密。[S1][S5]

### 最少调用与错误处理

| 操作 | 官方行为与拟议处理 |
| --- | --- |
| 写入 | `CredWriteW` 向当前令牌用户凭据集创建或替换相同 target/type 的项。普通写入 `Flags=0`；不使用保留旧 blob 的 `CRED_PRESERVE_CREDENTIAL_BLOB` 来保存“新地址+旧key”。失败返回 `FALSE`，立即读取 `GetLastError`，不报告保存成功。[S2] |
| 读取 | `CredReadW(target, CRED_TYPE_GENERIC, 0, ...)`；成功返回的单块内存需 `CredFree`。`ERROR_NOT_FOUND` 是未保存，`ERROR_NO_SUCH_LOGON_SESSION` 是当前会话无法使用凭据集，后者不能伪装成“已清除”。[S3] |
| 删除 | `CredDeleteW(target, CRED_TYPE_GENERIC, 0)`。`ERROR_NOT_FOUND` 可按本应用幂等清除处理；其他失败明确报告，不能说“重启不会恢复”。只删除自有 target。[S4] |

使用 `W` 版本解决 target 等字符串的 Unicode 编码；blob 仍是应用定义的字节数组，长度字段是字节数，不会因函数名带 `W` 自动允许 4096 个 key 字符。[S1]

**不推荐为绕过 2560 字节上限拆成多个凭据。** 这会新增分片、版本、部分写入、删除和恢复一致性问题；把 key 截断、改用属性存秘密、压缩后碰运气，或为短 key / 长 key 静默选择不同存储，也不是本轮最小方案。

### 其他用户、备份及安全宣传

读取基于当前令牌用户凭据集，而不是持有 target 的程序签名。[S3] 微软也明确说明 Generic credentials 不受 Credential Guard 的该项保护，因为应用需要拿到明文；不能宣传为“即使同用户恶意程序也拿不到”。[S14]

微软安全事件 5376 / 5377 官方资料确认 Credential Manager 数据库可通过控制面板备份、恢复。因此 `LOCAL_MACHINE` 不等于“永远不可导出”“删掉应用后绝无副本”。这些资料不能证明每个 Windows 版本、域策略下本应用 generic 项都能成功跨机恢复；本轮没有进行此测试。[S12][S13]

## 推荐 DPAPI 方案的最小契约

### 加解密和文件位置

1. 后端先执行现有 `ProviderConfig` / URL / ASCII 校验，再生成包含 `format_version`、规范化 `base_url`、准确 `model`、`api_key` 的单一 UTF-8 配置载荷。设置合理的密文文件大小上限，拒绝异常大文件。
2. 调用 `CryptProtectData` 时使用当前用户默认作用域，即不加 `CRYPTPROTECT_LOCAL_MACHINE`。`dwFlags=CRYPTPROTECT_UI_FORBIDDEN`，`pPromptStruct=NULL`、`pvReserved=NULL`；调用 `CryptUnprotectData` 时也禁止 UI。[S5][S6]
3. `pOptionalEntropy=NULL` 是最小可用方案。若未来加入 entropy，解密必须传完全相同的内容；写在源码里的固定 entropy 不构成另一道秘密或应用身份认证，不能因此声称防同用户程序。[S5][S6]
4. 文件建议为当前用户 `FOLDERID_LocalAppData` 下应用专用目录，例如 `%LOCALAPPDATA%\JinxueStudentFirst\provider-config.dpapi`。微软将该 known folder 列为 per-user，默认路径为用户 `AppData\Local`。[S15] 通过系统 known-folder 机制解析，不硬编码盘符或用户名；使用用户目录 ACL，禁止放进共享目录。
5. 该方案是**每 Windows 用户、每应用一份配置**，不跟随所选学生归档目录或每个便携 EXE 副本复制。不同安装 / 开发测试必须能注入隔离的测试路径，测试不能打开生产配置。若将来需要多个机构配置，再设计明确的 profile 身份，本轮不扩展。
6. 不放在 `archive.root`、学生 SQLite、导出 MD、`desktop-settings.json`、项目 `.env`、浏览器 localStorage 或备份 ZIP 中。当前备份递归归档根目录，因此“目录外保存”是防止误备份的必要工程安排。
7. 加密成功后先向同目录临时文件写**密文**，flush 并替换最终文件，再切换活动配置；只对本应用文件操作。写入、替换或权限失败，保留原持久配置和原活动状态，不返回保存成功。该写入顺序减少不一致，断电与文件系统耐久性仍需故障测试，不能只凭“临时文件”宣称绝对原子 / 永不丢失。

如由桌面启动器统一确定位置，只新增独立的配置路径参数或环境项（例如拟议 `JINXUE_PROVIDER_CONFIG_PATH`），传递稳定的当前用户路径，**不传 API key**；不得从 `JINXUE_DATA_DIR`、EXE 所在目录、学生档案目录派生。开发、打包版的共享或隔离策略应固定，不能每次启动生成随机位置，也不能切学生资料目录后意外换回旧密钥。

DPAPI 返回的 `DATA_BLOB.pbData` 要 `LocalFree`；若获取 description，也必须 `LocalFree`。微软要求不用时清理敏感缓冲区；Python / JS 不可变字符串和 HTTP 客户端可能产生副本，`ctypes` 缓冲区可及时释放或清理，但不能承诺全部进程内存已被可靠擦除。[S5][S6]

### 读取与失败行为

| 情况 | 拟议产品状态 / 行为 |
| --- | --- |
| 文件不存在 | `storage_state=NOT_SAVED`，`key_loaded=false`；无需弹出错误，不外发请求。 |
| 解密与完整载荷校验成功 | 恢复该载荷中绑定的地址、模型、key；`connection=NOT_TESTED`，只表明本机恢复成功。启动不自动调用 `/test`。 |
| 文件无权限、DPAPI 返回 FALSE、用户材料缺失或更换 Windows 用户 | `storage_state=LOAD_FAILED`，无活动 key；提示“本机配置无法读取，请重新输入或清除”，保留密文便于诊断，不静默覆盖、不改试其他环境密钥。 |
| 解密返回 TRUE，但 JSON、版本、摘要、URL、模型或 ASCII/key长度校验失败 | 同样 `LOAD_FAILED`，禁止激活和外发。不得直接相信“DPAPI API 成功”。 |
| 读取时系统想显示 UI | `UI_FORBIDDEN` 使操作失败；微软文档指出 UI 与此标志冲突时返回 `ERROR_PASSWORD_RESTRICTION`。不去掉此标志自动重试。[S5][S6] |
| 保存失败 | 明确 `SAVE_FAILED`，不把新配置当作已记住；禁止悄悄退化为明文磁盘或“仅内存也算成功”。若用户另选仅本次使用，那是另一个明确操作。 |
| 删除失败 | 清除当前进程活动 key，报告 `DELETE_FAILED` / “当前会话已停用，本机保存尚未删除”；保留可再次清除入口，不能声称后续启动绝不恢复。 |

Windows 只保证 API 以 `TRUE/FALSE` 和 `GetLastError` 告知调用结果，**不保证所有损坏都返回同一个错误码**。现行 `CryptUnprotectData` 官方说明甚至警告某些损坏可能返回成功但输出损坏。因此不能写成“任意篡改一定抛 `ERROR_INVALID_DATA`”。[S6]

最小建议是在 DPAPI 保护的内部载荷中存放固定格式标识、严格 schema / 长度、完整绑定字段及规范化载荷的 SHA-256 摘要（覆盖除摘要字段本身之外的完整配置），解密后重新校验全部字段与摘要，再交给现有配置验证。摘要主要用于检测误损坏、封装错误和输出异常；**不是独立的密码学认证机制，也不阻止已能调用该用户 DPAPI 的程序改写合法配置**。DPAPI 本身已有 MAC，微软仍建议应用按自身风险增加完整性检查。[S5][S6]

不同电脑通常不能解密，但微软明确记载 roaming profile 的跨机解密例外。账号 / 系统重装、恢复、不正常口令重置、域或 roaming 配置改变之后，均不承诺一定恢复；产品应支持重新输入。不能把“当前用户 DPAPI”宣传成绝对不可迁移或永不丢失。[S5]

### endpoint + model 与 key 必须作为一项生效

DPAPI、Credential Manager、safeStorage 都不知道本项目的 HTTP 目的地址。防止改地址后发送旧 key 的责任在应用。

最小建议保持**一次只有一份完整配置**，保存 / 恢复 / 激活均以一个不可分割对象进行：

```text
binding = (normalized_base_url, exact_model_id)
record = (format_version, binding, api_key, integrity_fields)
```

- 最少沿用现有去掉结尾 `/` 的规范化；不把不同 host、path 或模型名视作同一配置。除已有规范化以外，宁可要求重新输入也不为“看起来相同”扩大匹配范围。完整 base path 属于绑定的一部分，不能只比较域名。
- `POST /api/provider` 仍要求完整 `base_url + model + api_key`，不引入“key 为空就用保存的旧 key”规则；明文 key 不回填给前端。修改地址 / 模型必须明确提交这三项，原 key 只有用户重新输入才可随新绑定提交。
- 保存地址 B 时不从地址 A 的记录取 key，也不从默认地址、历史会话、环境变量或另一供应商取 key；不按“最近一个 key”自动复用。
- 配置草稿不直接修改已生效记录。界面必须区分“草稿地址”和“已生效地址”，保留现在修改草稿后暂停发送的行为；跨窗口以后端活动配置为准，不能让窗口 B 从自己的草稿覆盖已加载配置。
- 每个模型请求在后端同一锁内获取完整配置快照；该请求的地址、模型和 Authorization 一起来自这个对象，不能分别读取易变的全局值。当前代码已有整体 `config` 快照和 `RLock`，沿用这一方向。
- 并发更新后，旧请求只能按其原快照完成或取消，不能在中途换地址。旧连接测试的 PASS 不得覆盖新配置；当前 `self._config is config` 检查值得保留。
- 启动恢复成功只恢复该记录中的绑定，不把密钥注入代码默认 endpoint/model。启动、打开设置窗口或恢复资料备份均不自动发送探针。

模型 ID 本身通常不改变凭据接收的 host；把模型也绑定是本项目配置一致性与防静默复用的产品选择，不是声称模型名在 Windows 中形成新的安全主体。

### “仅本次”“记住”“清除”的最少接口

无需新增可读明文 key 的接口，建议复用现有四个 provider 路由：

| 接口 | 拟议最少变更 |
| --- | --- |
| `GET /api/provider` | 仍仅返回地址、模型、`key_loaded`、连接状态；追加 `key_storage`（如 `PROCESS_MEMORY_ONLY` / `WINDOWS_DPAPI_CURRENT_USER`）和 `storage_state`。不返回 key、可逆掩码、请求体或原始错误对象。 |
| `POST /api/provider` | 完整三项配置加 `remember: boolean=false`。`true` 按上述事务保存；`false` 表示仅本次使用，并清除此前持久项，防止下次重启恢复旧 key。此前持久项清除失败必须明确失败，不能显示“已改为仅本次”。 |
| `POST /api/provider/clear` | 清空活动内存并删除本应用持久文件；不存在视为幂等成功，其他删除失败按明确状态返回。标签改成“清除当前和本机保存的密钥”，以免含义模糊。 |
| `POST /api/provider/test` | 仍由用户主动触发，测试当前活动完整配置；持久化成功不代表供应商认证成功，文字 PASS 不代表图片 / 工具通过。 |

内部最少存储接口为 `load() -> 完整记录或明确缺失状态`、`save(完整记录)`、`delete()`，异常分类至少区分缺失 / 无法读取 / 无法写入 / 无法删除。测试注入 fake store 或临时根目录，不设计扫描用户保险箱、找回历史 key 或导出明文的能力。

**测试与手动 live 验证默认不启用持久化。** 建议 `ProviderService` 接收可选存储依赖，默认 `None` 表示只用进程内存；仅正常产品启动显式注入生产存储。`create_app()` 的测试调用、`verify_provider_server.py`、现有模拟宿主和 `scripts/verify-history-live.py` 都不能因新增构造函数逻辑而自动探测生产路径或恢复老师的 key。live 脚本继续只接受本次安全输入；其 `finally: clear()` / 测试 teardown 只能清理本次内存或显式隔离的测试存储，**不能删除老师已保存的生产凭据**。若未来要做生产恢复验收，另设显式受控入口与合成记录，不改变默认。

推荐保持原有“配置并测试文字连接”动作，但分开显示“本机已保存”和“文字连接成功 / 失败”。例如 401 不应清除配置并谎称保存失败；DPAPI 保存失败也不应先去上游测试。此顺序与具体错误文案应在实现规格中固定。

## Electron 45.2.3 safeStorage 备选的注意事项

本轮使用 **`v45.2.3` 官方 tag 的文档和源码**，没有用 latest 的行为覆盖当前依赖。[S8][S9]

- Windows 同步和异步方案的密钥均由 DPAPI 保护；官方明确仅隔离其他用户，不隔离同用户的其他应用。它不是给 API key 建立 Credential Manager 通用凭据项。[S8]
- 此版本同步 `isEncryptionAvailable` / `encryptString` / `decryptString` 已 deprecated，官方计划 Electron 46 删除。新实现应在 `app.whenReady()` 后使用 `isAsyncEncryptionAvailable()`、`encryptStringAsync()`、`decryptStringAsync()`。[S8][S9]
- `encryptStringAsync` 返回 `Promise<Buffer>`，应用还需保存密文。`decryptStringAsync` 返回 `{ result, shouldReEncrypt }`。不要按旧同步接口把它当作明文 string。[S8][S9]
- 45.2.3 文档概述提到 temporary unavailable；该版本 C++ 源码实际在临时不可用时 **reject Promise**，没有在返回对象中给出 `isTemporarilyUnavailable` 字段。调用方须捕获失败并保持未激活状态，不能只读一个不存在的字段。[S9]
- `shouldReEncrypt=true` 表示应考虑重新加密已解出的 `result` 并替换密文。该版本文档该字段的尾句写成再次调用 `decryptStringAsync` 接收新解密值，与“重新加密”的意图不一致；不要把这句话复制成循环解密算法。实际重新加密和版本迁移流程待实现验证。[S8][S9]
- 需要保持本应用 profile 路径及相关存储材料；不能把业务目录 `JinxueData/electron-profile` 整体归入学生备份，并认为其中只含无关缓存。当前自定义 `userData` 路径应在实现前复核。[S8]

当前 renderer 已直接把完整配置 POST 给 Python。若改 safeStorage，建议由受信 renderer 通过 preload 暴露的**特定“保存完整配置 / 清除”调用**交给主进程，主进程只向经过认证的 Python 本地服务发送恢复或保存的完整配置；读取状态不返回明文给 renderer。启动恢复需等待 Python ready，并防止失败后无限重试或自动模型请求。这些是新增设计工作，尚未实现。

Electron 官方建议 renderer → main 的双向操作使用 `ipcRenderer.invoke` / `ipcMain.handle`，preload 只暴露有限 API；安全指引要求验证所有 IPC sender，包括 frame / origin。不能暴露通用 `decrypt(anyBuffer)`、任意 target 读取或全部 `ipcRenderer` 给页面。[S10][S11] 本项目已有 sender 校验可复用模式，仍须对凭据通道单独测试，避免任意 frame 触发恢复、发送或删除。

如果改用 Electron，API key 仍不可通过启动参数、环境变量或 renderer 回读完成桥接；认证本地请求、子进程 stdin 或专用 IPC 的具体选择要另做最小规格。现有 `JINXUE_DESKTOP_TOKEN` 是本地桌面操作认证材料，不能直接把它当成已完成凭据恢复权限设计的证明。

## 实现阶段的最少测试与验收

本轮仅列用例，**没有执行这些 Windows API 或产品验收**。正式实现应使用合成 key、自有测试 target / 临时目录，不读写用户已有凭据，不发外部模型请求。

| 用例组 | 最少验收内容 |
| --- | --- |
| 格式和长度 | 1、2560、2561、4096 个 ASCII 字符可通过推荐 DPAPI 保存 / 读取；4097、空值和非法字符仍被既有校验拒绝。检查读取后逐字节等同，绝不截断；真实 Win32 round-trip 不能仅用 fake store 代替。 |
| 当前用户重启 | 合成配置写入，结束后端并新建进程读取；还须单独做 Windows 注销 / 重启后同用户恢复，记录系统版本和结果。打开程序只恢复，不发生任何供应商请求。 |
| 用户 / 电脑边界 | 新建受控测试账户，复制合成密文后验证不可正常激活；另一台干净 Windows 同样测试。若域 / roaming 场景在支持范围内，单独记录，不把普通本机结果推成绝对跨机不可解密。 |
| 地址模型绑定 | 保存 A+M1+K1 后启动得到同一三元组；修改为 B 或 M2 而 key 为空必须拒绝；两个窗口并发切换、旧探针延迟返回，也不能把 K1 发往 B 或把旧 PASS 标给新配置。对 mock transport 的实际 URL、Authorization、model 作断言。 |
| 失败关闭 | 错用户、损坏 / 截断 / 空 / 超大文件、非法 JSON、未知版本、字段错绑、摘要不符、DPAPI 返回失败 / 成功但畸形输出、权限拒绝：均不激活，不外发；错误响应不含 key / 原始输入。 |
| 保存一致性 | 模拟加密失败、临时写入失败、替换失败与并发保存：不得显示记住成功或留下明文；原有效配置仍可解释。断电 / 崩溃恢复需专项验证，不只测正常返回。 |
| 仅本次 / 清除 | `remember=false` 不留旧持久配置；清除后当前请求不再获得配置，重启不恢复；连续清除幂等；删除失败显示真实状态。尚在进行的 HTTP 请求可能已发出，清除不等同撤回上游请求。 |
| 测试 / live 隔离 | 裸 `ProviderService`、测试 `create_app` 与 live 验证默认零生产存储调用；预置 fake 生产记录时执行 setup / 请求 / `finally: clear()` 后该记录完全不变。注入临时 store 才允许测试写入与删除，路径不得回落到生产默认值。 |
| 泄露与备份 | 合成 key 不出现在 JSON响应、validation error、日志、异常文本、MD、SQLite、学生 ZIP、配置临时文件、命令行 / 进程环境和 Git 差异；密文 / profile 不进入学生归档备份。 |
| 现有业务回归 | 原 provider 测试、HTTP 401 / 429 / 超时与不跟随重定向逻辑保留；API key 存储变化不扩大历史、图片或写笔记授权，本地归档无需 key。原先断言“一律内存”的测试应改成按 remember 分支验证，不直接删除。 |
| 备选专属 | 若选 Credential Manager：仅测试专有 target 的 write/read/delete、2560/2561 边界及清除失败。若选 safeStorage：在真实 Electron 45.2.3 中测试 ready、异步返回结构、拒绝分支、sender 校验、主进程 / Python 重启与 profile 丢失；不能用纯 Node mock 冒充。 |

保存测试与供应商认证测试分开：前者验证 OS 存储，不消耗 API 用量；后者以后由老师重新提供有效 key、主动发起、明确上游和材料范围。不能借本研究查找旧凭据来补做真实模型测试。

## 证据范围及未实测项

- 已完成：读取当前源码与锁定版本；通过 HTTPS 读取以下微软官方文档 / 官方 SDK 头及 Electron 45.2.3 官方文档 / 源码，核对 2560 字节限制、两个 LOCAL_MACHINE 标志差别、DPAPI 参数 / 错误约定、safeStorage 主进程与异步返回行为。
- 本轮没有：`CredEnumerate` 或其他真实凭据枚举、`CredRead` / 写入 / 删除用户项、DPAPI 合成 round-trip、safeStorage 实际运行、注册表 / 密钥材料读取、Windows 重启 / 跨账户 / 跨电脑 / 域漫游 / 系统恢复测试、外部模型请求、产品代码改动或依赖安装。
- 没有证明：所有企业 Windows 策略兼容、所有系统备份都不会携带密文、删除后不存在磁盘 / 系统备份残留、同用户恶意程序无法访问、4096 字节在本项目未来封装中已经通过。此文档的“推荐”属于有官方依据的实现建议。
- 删除本机保存项只阻止后续正常加载，不撤销供应商已经签发的 key；需要撤销应由用户在对应供应商平台执行。系统镜像或历史备份可能保留旧密文，恢复学生业务备份则按本方案不应恢复密钥。

## 官方来源

本轮通过 HTTPS 实际读取了 S1—S6 的官方文档 raw 源文件、S7 的官方头文件、S8—S11 的 Electron 固定版本 raw 文档 / 源码及 S12—S15 的 Microsoft Learn 页面；下方同时提供对应可浏览的官方文档链接，不把仅列出的等价页面称为另做了一次独立核验。微软文档源属于 `MicrosoftDocs` 官方仓库，非社区二次解读。在线页面会更新，Electron 来源固定到项目使用的 `v45.2.3`。

- **[S1] CREDENTIALW：类型、TargetName / UserName、blob 字节上限与持久化标志。** [Microsoft Learn](https://learn.microsoft.com/en-us/windows/win32/api/wincred/ns-wincred-credentialw)；[本轮读取的官方文档源](https://github.com/MicrosoftDocs/sdk-api/blob/docs/sdk-api-src/content/wincred/ns-wincred-credentialw.md)。
- **[S2] CredWriteW：当前令牌用户凭据集、创建 / 替换、错误返回。** [Microsoft Learn](https://learn.microsoft.com/en-us/windows/win32/api/wincred/nf-wincred-credwritew)；[官方文档源](https://github.com/MicrosoftDocs/sdk-api/blob/docs/sdk-api-src/content/wincred/nf-wincred-credwritew.md)。
- **[S3] CredReadW：当前令牌、CredFree、NOT_FOUND / NO_SUCH_LOGON_SESSION。** [Microsoft Learn](https://learn.microsoft.com/en-us/windows/win32/api/wincred/nf-wincred-credreadw)；[官方文档源](https://github.com/MicrosoftDocs/sdk-api/blob/docs/sdk-api-src/content/wincred/nf-wincred-credreadw.md)。
- **[S4] CredDeleteW：定点删除、Flags 与错误。** [Microsoft Learn](https://learn.microsoft.com/en-us/windows/win32/api/wincred/nf-wincred-creddeletew)；[官方文档源](https://github.com/MicrosoftDocs/sdk-api/blob/docs/sdk-api-src/content/wincred/nf-wincred-creddeletew.md)。
- **[S5] CryptProtectData：当前用户、机器标志、UI_FORBIDDEN、entropy、MAC、roaming 例外与 LocalFree。** [Microsoft Learn](https://learn.microsoft.com/en-us/windows/win32/api/dpapi/nf-dpapi-cryptprotectdata)；[官方文档源](https://github.com/MicrosoftDocs/sdk-api/blob/docs/sdk-api-src/content/dpapi/nf-dpapi-cryptprotectdata.md)。
- **[S6] CryptUnprotectData：解密参数、FALSE / GetLastError、损坏的非固定错误及可能畸形成功输出、内存释放。** [Microsoft Learn](https://learn.microsoft.com/en-us/windows/win32/api/dpapi/nf-dpapi-cryptunprotectdata)；[官方文档源](https://github.com/MicrosoftDocs/sdk-api/blob/docs/sdk-api-src/content/dpapi/nf-dpapi-cryptunprotectdata.md)。
- **[S7] 微软官方 WinSDK 重编译头 wincred.h。** [固定本轮仓库 revision](https://github.com/microsoft/win32metadata/blob/15fc870a5e96df7c560877ff30136c0fb5a21e9b/generation/WinSDK/RecompiledIdlHeaders/um/wincred.h)；本轮读取 main 头和 GitHub 官方 API revision，宏为 `(5*512)`。
- **[S8] Electron v45.2.3 safeStorage 文档。** [固定版本文档](https://github.com/electron/electron/blob/v45.2.3/docs/api/safe-storage.md)；[原始内容](https://raw.githubusercontent.com/electron/electron/v45.2.3/docs/api/safe-storage.md)。
- **[S9] Electron v45.2.3 safeStorage 实现。** [electron_api_safe_storage.cc](https://github.com/electron/electron/blob/v45.2.3/shell/browser/api/electron_api_safe_storage.cc)，尤其 `OnOsCryptReady`、`encryptStringAsync`、`decryptStringAsync` 的 resolve / reject 分支；[原始内容](https://raw.githubusercontent.com/electron/electron/v45.2.3/shell/browser/api/electron_api_safe_storage.cc)。
- **[S10] Electron v45.2.3 IPC 教程。** [官方版本文档](https://github.com/electron/electron/blob/v45.2.3/docs/tutorial/ipc.md)，双向 invoke / handle 及 preload 有限暴露。
- **[S11] Electron v45.2.3 安全指引。** [官方版本文档](https://github.com/electron/electron/blob/v45.2.3/docs/tutorial/security.md)，Validate the sender of all IPC messages。
- **[S12] 微软安全事件 5376：Credential Manager 备份。** [Microsoft Learn](https://learn.microsoft.com/en-us/previous-versions/windows/it-pro/windows-10/security/threat-protection/auditing/event-5376)。这是 Windows 10 / 既往版本事件资料，不能替代本机 Windows 11 实测。
- **[S13] 微软安全事件 5377：Credential Manager 恢复。** [Microsoft Learn](https://learn.microsoft.com/en-us/previous-versions/windows/it-pro/windows-10/security/threat-protection/auditing/event-5377)。同上，证明存在机制，不保证本项目跨机恢复成功。
- **[S14] Credential Guard considerations：Generic credentials 不受该保护。** [Microsoft Learn](https://learn.microsoft.com/en-us/windows/security/identity-protection/credential-guard/credential-guard-considerations)。
- **[S15] KNOWNFOLDERID：FOLDERID_LocalAppData。** [Microsoft Learn](https://learn.microsoft.com/en-us/windows/win32/shell/knownfolderid#folderid_localappdata)，per-user / `%LOCALAPPDATA%`。

本轮 `MicrosoftDocs/sdk-api` 的官方分支 revision 查询值为 `656e9656bfaef34dd29cd7ee9e1146aec17e924c`；读取的各 raw URL 指向 `docs` 分支，未逐文件证明其获取时刻与该 revision 完全一致，因此不把该 revision 当作逐文件内容哈希。Electron `v45.2.3` 的官方 tag 对象查询值为 `e60e4ee545740d472ad9e182bbd16700cf7b8bca`；后续解析 tag 到 commit 的 GitHub API 请求遇到限流，本轮没有据此推测 commit。版本资料与源码内容本身读取成功。
