# 首页学生点选与AI设置弹窗交付

日期：2026-11-11。版本：`2.0.0-preview.3`。状态：工程验证通过，待用户试用。

## 用户批准的范围与实际变化

1. AI地址、模型、密钥不再占据首页。点击右上方“AI 服务设置”才弹出配置窗口，可点“关闭设置”或按Esc返回。配置测试进行中暂不能关闭；未完成重新测试时首页保留发送暂停提示。“打开 AI Agent”独立可见，不必进入设置。
2. 首页先显示数学、英语、物理、化学，以及本地已有学生名单。名单支持上下滚动，点击姓名即可选择学生并读取该科学习记录；姓名下显示班级和编号。筛选选填，输入立即生效，无须点搜索。空名单、读取失败和筛选无结果分别提示；新增学生、重开以及从Agent返回后可读取名单。

不自动选中第一名学生。切换学科/学生按既有身份范围读取档案；重复点同一学生不会重新设置身份。没有改数据库、后端业务代码、依赖或旧版app/packaging。

## 实际验证

| 验证 | 结果 | 证据 |
| --- | --- | --- |
| TypeScript与Vite生产构建 | PASS | 新包构建使用`JINXUE_RELEASE=1`；既有大分块警告保留 |
| 后端原有测试 | 56/56 PASS | `python -X utf8 -B -m unittest discover -s backend -p 'test_*.py'`，11.500秒 |
| 源码Electron首页场景 | 12/12 PASS | `v2/.qa-temp/ux-home/1794399034802/result.json` |
| 原UX-01至UX-03路由回归 | 10/10 PASS | `v2/.qa-temp/ux-routing/1794399040935/result.json` |
| 实际新版EXE首页场景 | 10/10 PASS | `v2/.qa-temp/ux-home/1794399607994/result.json` |
| 实际新版EXE档案/知识点/复测/备份恢复 | 12/12 PASS | `v2/.qa-temp/learning/1794399680835/result.json` |
| 实际新版EXE Agent收件/归档/查询 | 8/8 PASS | `v2/.qa-temp/intake/1794399689597/result.json` |

旧界面先运行新增场景，11项预期行为失败；实现后上述场景通过。测试使用隔离目录、28名虚构学生及合成材料，包括同名区分、班级/学科切换、名单末尾点选、即时筛选、新增后重开、窄窗口和弹窗关闭。源码连接测试使用本地假传输，失败重试使用测试宿主模拟503；这些不是实际供应商测试。

执行命令从`v2/`运行：

```powershell
node scripts/verify-ux-home.mjs
node scripts/verify-ux-routing.mjs
node scripts/verify-ux-home.mjs ..\docs\delivery\v2-home-students-20261111\JinxueZhifu\JinxueZhifu.exe
node scripts/verify-learning.mjs ..\docs\delivery\v2-home-students-20261111\JinxueZhifu\JinxueZhifu.exe
node scripts/verify-intake.mjs ..\docs\delivery\v2-home-students-20261111\JinxueZhifu\JinxueZhifu.exe
```

实际查看了打包版截图：

- `v2/.qa-temp/ux-home/1794399607994/01-home.png`：四科学科、可滚动学生名单和两个独立入口。
- `v2/.qa-temp/ux-home/1794399607994/03-settings.png`：点击才显示的设置弹窗。

## 交付与旧资料

新版便携包位于`docs/delivery/v2-home-students-20261111/`，完整解压后运行`JinxueZhifu/JinxueZhifu.exe`；不能单独拿走EXE。原包保留。

交付ZIP为`JinxueZhifu-2.0.0-preview.3-Windows-x64.zip`，183,527,074字节，SHA-256为`f75193e8954be45a2208ba57582c72ed0e17caebf9774042b010bce5da1c1d64`。归档后实际核验CRC、无重名条目、785个程序文件与已测目录/清单逐一哈希一致、手册一致，包中无资料库或环境密钥文件；结果已写入`RELEASE_CHECK.json`。

新版首次解压不会自动带入旧版学生。需要旧2.0资料时先在旧版备份，再在新版“本地资料与备份”中选择已有2.0资料目录为下次启动位置，完全退出重开。不要覆盖旧程序目录或删除`JinxueData`。无自动1.0迁移。

小白说明和自测手册分别为`v2/BEGINNER_GUIDE.md`、`v2/BEGINNER_SELF_TEST.md`；交付目录另提供记事本可打开的`USER_GUIDE.txt`、`SELF_TEST.txt`。压缩包完整性与文件哈希以交付目录`RELEASE_CHECK.json`为准。

## 明确未验证与未扩展

未测试最新真实模型、另一台干净Windows、教师使用效率或教学效果。拖图使用自动化DOM事件，系统目录对话框使用预设选项；不冒充真人操作验收。

UX-09的首页配置占位已处理；UX-13仅学生名单与直接点选部分已处理，完整聊天持久化仍未实现。已打开Agent的上下文同步、自动取回归档图片、长页面其他区块、双上传入口等未在本次修改。后续仍按“反馈→复现→方案→用户确认→修改→测试”迭代。
