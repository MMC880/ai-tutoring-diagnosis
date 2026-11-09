# 0.2.1：JPG实际为MPO的导入修复

2026-11-09，基线7f73e6d。用户截图已显示“图片实际类型为MPO”，定位为文件格式允许清单遗漏，与WebP兼容属于两个不同问题。未读取或覆盖真实学生档案。

先用Pillow12.3.0生成真正双帧MPO，命名为wechat-photo.jpg；旧版稳定复现同样报错。增加回归后修复：现有图片上传分支接受MPO、按image/jpeg呈现，先实际解码第0帧，原件字节不变，记录帧数并显示警告。保留15MB、3000万像素限制，最多100帧；其他帧保留在原件中，不自动视为试卷页，也不声称已核验。没有升级Pillow或新增依赖。

框选、遮挡和模型图片继续使用重建像素的PNG，不传原MPO内的元数据或辅助帧。MPO符合JPEG主图读取方式，参考[Pillow官方格式说明](https://pillow.readthedocs.io/en/stable/handbook/image-file-formats.html#mpo)；实际实现以本机固定12.3.0源码与实测为准。

验证：新增2项测试先失败后通过；Python完整452项通过。包含原字节保留、主图颜色、标准化PNG、照片统计、备份恢复和截断主图拒绝。最终EXE摘要见app/.qa-temp/windows-package/verification.json：真实六张MPO的JPG文件通过登记作业界面一起创建，每份比较原件字节、标准化预览尺寸与主图颜色，重启后再检查六份文件内容。所有样本为合成图，尚未取得截图中的实际原文件，不能宣称该六份真实文件已实测。

交付：docs/delivery/windows-desktop-0.2.1/晋学智辅-Windows-x64-0.2.1.zip；准确大小与SHA-256见同目录build-summary.json。保留旧包和资料位置，退出旧版后解压完整新版运行。仅兼容现有允许扩展名下的MPO编码，未新增.mpo扩展名入口。实际系统文件选择器点击、另一台电脑和教师现场资料仍待试用。

最终冻结EXE30项通过，运行目录E:\GPT\jinxue-student-first\app\.qa-temp\windows-package\native-932qn1u6。交付ZIP与实际测试包逐文件清单一致；315文件、29,561,576字节，SHA-256 42b3a1868d1580d39fb3f8dd3819630b3d76e802986d7ff815c27c8d7d63d318。
