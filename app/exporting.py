"""Word via python-docx; printable HTML via the local browser."""
import html
import io
import re
from docx import Document
from docx.shared import Cm, Pt
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from store import ValidationError, ConflictError
import grading


LABELS = dict(CORRECT='正确', INCORRECT='错误', PARTIAL='部分正确', PENDING='待核对', MISSING='缺材料')


def export_content(store, kind, ident, audience, version=None):
    if audience not in ('teacher', 'student'):
        raise ValidationError('导出对象须为教师或学生')
    if kind == 'paper':
        if audience != 'teacher':
            raise ValidationError('整卷审核报告仅供教师查看；学生请使用审批后的补练版')
        p = store.get_paper(ident)
        if version is not None and version != p['version']:
            raise ConflictError('导出版本已变化，请重新打开导出')
        state = '已确认' if p['confirmed_version'] == p['version'] else '待审草稿'
        blocks = [('text', f'{p["student_name"]} · {p["batch_id"]} · V{p["version"]} · {state} · 教师专用')]
        for q in p['questions']:
            blocks.extend([('heading', q['id'] + ' · ' + LABELS[q['result']]), ('math', q['stem']),
                           ('text', '学生作答／转写：' + (q['answer'] or '未录入')), ('text', '核对答案：' + (q['correct_answer'] or '无参考')),
                           ('text', '知识点：' + (q['knowledge'] or '待标注')), ('text', '错因：' + (q['cause'] or '未认定'))])
            if 'recognition_resolved' in q or q.get('recognition_notes'):
                blocks.append(('text','识别核对：'+('已核清' if q.get('recognition_resolved') else '待核清')))
                blocks.append(('text','识别疑点（不是学生错因）：'+(q.get('recognition_notes') or '未补充疑点文字')))
                if q.get('recognition_notice') and q['recognition_notice'] not in q.get('recognition_notes',''):
                    blocks.append(('text','识别过程补充：'+q['recognition_notice']))
            if q.get('question_type'):blocks.append(('text','题型：'+q['question_type']))
            if grading.has_evidence(q):
                blocks.extend([('text','老师原批改：'+LABELS.get(q.get('teacher_result'),'未录入／不清楚')),
                               ('text','老师原批注：'+(q.get('teacher_mark') or '未录入')),
                               ('text','AI候选判定：'+LABELS.get(q.get('ai_result'),'未提供')),
                               ('text','批改核对说明：'+(q.get('grading_note') or '未补充'))])
                if grading.has_conflict(q):
                    blocks.append(('text','批改分歧：'+('老师已填写说明并核清' if q.get('grading_resolved') and q.get('grading_note') else '待老师核清，不作为确定结论')))
            if q.get('teaching_ref'):
                from teaching import Library
                source=Library(store).reference(q['teaching_ref'])
                blocks.append(('text',f"教学依据：{source['source_title']} · V{source['source_version']} · {source['locator']}"))
                blocks.append(('text','教学内容摘要：'+source['content']))
        return p['title'] + ' · 整卷核对', blocks
    if kind != 'exercise':
        raise ValidationError('导出类型无效')
    e = store.get_exercise(ident, version)
    if version != e['version']:
        raise ConflictError('练习导出须指定确切版本')
    if audience == 'student' and e['status'] != 'APPROVED':
        raise ValidationError('该版本练习尚未获得教师批准')
    blocks = [('text', f'{e["student_name"]} · {e["level"]} · V{e["version"]} · ' + ('学生练习版' if audience == 'student' else '教师答案版／请勿发给学生')),
              ('math', e['stem'])]
    if audience == 'teacher':
        blocks.extend([('text', '答案：' + e['answer']), ('text', '讲解：' + e['explanation']),
                       ('text', '审批状态：' + e['status'])])
    else:
        blocks.extend([('line', '')] * 5)
    return '针对性补练', blocks


def math_paragraph(doc, text):
    # Local editable OMML text runs. This is not a general LaTeX converter.
    p = doc.add_paragraph()
    math = OxmlElement('m:oMath')
    for chunk in re.split(r'([A-Za-z][²³])', text):
        if re.fullmatch(r'[A-Za-z][²³]', chunk or ''):
            sup = OxmlElement('m:sSup')
            for tag, value in [('m:e', chunk[0]), ('m:sup', '2' if chunk[1] == '²' else '3')]:
                node = OxmlElement(tag); run = OxmlElement('m:r'); t = OxmlElement('m:t'); t.text = value
                run.append(t); node.append(run); sup.append(node)
            math.append(sup)
        elif chunk:
            run = OxmlElement('m:r'); t = OxmlElement('m:t'); t.set(qn('xml:space'), 'preserve'); t.text = chunk
            run.append(t); math.append(run)
    p._p.append(math)


def word_bytes(title, blocks):
    doc = Document()
    sec = doc.sections[0]
    sec.page_width, sec.page_height = Cm(21), Cm(29.7)
    sec.top_margin = sec.bottom_margin = sec.left_margin = sec.right_margin = Cm(2)
    style = doc.styles['Normal']
    style.font.name = 'Microsoft YaHei'; style.font.size = Pt(11)
    style.element.rPr.rFonts.set(qn('w:eastAsia'), 'Microsoft YaHei')
    doc.add_heading(title, 0)
    for kind, text in blocks:
        if kind == 'math':
            math_paragraph(doc, text)
        elif kind == 'heading':
            doc.add_heading(text, 2)
        elif kind == 'line':
            p = doc.add_paragraph(' ')
            p.paragraph_format.space_before = Pt(10)
            p.paragraph_format.space_after = Pt(10)
            props = p._p.get_or_add_pPr(); border = OxmlElement('w:pBdr'); bottom = OxmlElement('w:bottom')
            for k, v in [('val', 'single'), ('sz', '4'), ('space', '1'), ('color', '9AA8AA')]: bottom.set(qn('w:' + k), v)
            border.append(bottom); props.append(border)
            doc.add_paragraph(' ')
        else:
            doc.add_paragraph(text)
    output = io.BytesIO(); doc.save(output)
    return output.getvalue()


def print_html(title, blocks):
    esc = html.escape
    body = ''
    for kind, text in blocks:
        if kind == 'line': body += '<div class="writing-line"></div>'
        elif kind == 'heading': body += '<h2>' + esc(text) + '</h2>'
        else: body += '<p class="' + ('formula' if kind == 'math' else 'text') + '">' + esc(text) + '</p>'
    return '''<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>''' + esc(title) + '''</title>
    <style>@page{size:A4;margin:20mm}*{box-sizing:border-box}body{font:12pt/1.8 "Microsoft YaHei",sans-serif;color:#172f32;margin:0 auto;max-width:170mm;padding:20px}
    h1{font-size:22pt;margin:10px 0 20px}h2{font-size:15pt;break-after:avoid}p{white-space:pre-wrap;overflow-wrap:anywhere;margin:12px 0}.formula{font-family:"Cambria Math","Microsoft YaHei",serif;font-size:14pt}.writing-line{height:18mm;border-bottom:1px solid #9aa8aa}
    .toolbar{padding:12px;background:#edf4f3;font-size:11pt}button{padding:8px 20px;cursor:pointer}@media print{body{padding:0;max-width:none}.toolbar{display:none}}</style>
    <div class="toolbar"><button id="print-button">打印 / 另存为 PDF</button> 在打印窗口选择“另存为 PDF”。这是本地打印页，请核对公式与分页。</div><h1>''' + esc(title) + '</h1>' + body + '<script src="/print.js"></script></html>'
