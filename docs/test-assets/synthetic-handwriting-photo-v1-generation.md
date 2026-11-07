# 合成手写照片 v1：生成与检查记录

日期：2026-11-04。用户暂无真实手写样本，明确要求生成一张照片转交 WorkBuddy。使用内置 image_gen，未使用 API CLI，无真实学生资料。生成图片已逐项视觉查看，复制到本目录，原始生成文件保留。

图片：synthetic-handwriting-photo-v1.png。图上明确标“合成测试样例 · 非真实学生作业”和“AI 生成图像，仅用于流程测试”。四题印刷题干与蓝色模拟手写可辨。它比真实潦草字迹清晰，只可验证合成图片转写与业务流程，不证明真实学生 OCR 准确率。

## 人工视觉检查后的对照（不要提前发给识别任务）

1. 顶点式 y=−(x−2)²+3。模拟原答为顶点 (−2,3)、对称轴 x=−2；预设符号错误保留，正确结果是 (2,3)、x=2。
2. x²−5x+6=0。模拟原答为 (x−2)(x−3)=0，x=2 或 x=3，结果正确。
3. 化简 (x²−1)/(x−1) 并写限制。模拟原答写因式分解约分得 x+1，未写 x≠1；是否部分正确需教师口径，不能自动给步骤分。
4. 平均数：6、8、10、12。模拟原答写和除以4，再写 36/4=8；错误结果保留，正确平均数为9。

以上是对生成图片的本次目视核对，不是 WorkBuddy 的识别结果。下一次交给 WorkBuddy 时只给图片，先要求忠实转写，不给本对照；单独运行 SYN-IMAGE-001，不改原 62 条事件。

## 实际使用的完整生成提示词

```text
Use case: photorealistic-natural / scientific-educational. Create ONE high-resolution portrait smartphone photograph of a fictional Chinese junior-middle-school mathematics homework sheet lying on a plain light wood desk. The goal is a synthetic test image for transcription, not a teaching infographic. Entire single A4-like page visible, almost overhead view with only a slight 3-degree tilt, subtle natural afternoon lighting and paper texture, no glare, no fingers, no people, no names, no school, no QR codes. Keep all math and text legible at full resolution. Printed problem statements in black, student answers in realistic slightly untidy blue ballpoint handwriting, with natural uneven baselines and ordinary teenage handwriting, not a handwriting font. Four generously spaced numbered questions with handwritten working below each. Preserve the EXACT mathematical mistakes below. Do not correct them, do not add correct answers, no red teacher marks or right/wrong annotations. Use proper superscript 2 and horizontal fraction bars where appropriate.

At top clearly print: "数学作业"
Immediately below in smaller clean print: "合成测试样例 · 非真实学生作业"
Small footer: "AI 生成图像，仅用于流程测试"

QUESTION 1 printed:
"1. 求抛物线 y=−(x−2)²+3 的顶点坐标和对称轴。"
Handwritten student's answer EXACTLY:
"顶点坐标：(−2，3)"
"对称轴：x=−2"
Both minus signs before the student's 2 must remain visible. One pen stroke may be a little light, but do not erase the mathematical meaning.

QUESTION 2 printed:
"2. 解方程：x²−5x+6=0。"
Handwritten student's work EXACTLY:
"(x−2)(x−3)=0"
"x=2 或 x=3"

QUESTION 3 printed:
"3. 化简 (x²−1)/(x−1)，并写出 x 的取值限制。"
Render the printed rational expression as a clear horizontal fraction.
Handwritten student's work EXACTLY, with horizontal fraction:
"[(x−1)(x+1)]/(x−1)=x+1"
There is NO restriction written by the student. Leave the rest of the answer area blank. Do NOT add x≠1.

QUESTION 4 printed:
"4. 求数据 6、8、10、12 的平均数。"
Handwritten student's work EXACTLY, with horizontal fractions:
"平均数=(6+8+10+12)/4"
"=36/4=8"
The student's last answer MUST be 8 (deliberately wrong), never 9.

Natural ink line weight, clear separation between printed questions and blue handwritten answers. Minimal scene, realistic photograph, no additional exercises, no answer key, no decorative graphics. Ensure all four questions and all specified handwritten lines are completely inside frame.
```
