"""Conservative local teacher instructions; no model output becomes teacher evidence."""
import re
import unicodedata
from datetime import date, timedelta
from zoneinfo import ZoneInfo
from datetime import datetime

SUBJECT_WORDS = {'数学': 'math', '英语': 'english', '物理': 'physics', '化学': 'chemistry'}
NUMBERS = r'[0-9]{1,3}(?:\s*[、,，和及]\s*(?:第)?[0-9]{1,3})*'


def detailed_question_evidence(text):
    confirmed, candidates, correct = [], [], []
    text = unicodedata.normalize('NFKC', text)
    # A separate verdict has a separate evidence span. Dates and scores never match.
    for sentence, ending in re.findall(r'([^。；;\n？！?!]+)([。；;\n？！?!]|$)', text):
        if ending in {'?', '？'}:
            continue
        source = 'teacher'
        for clause in re.split(r'[,，](?=\s*(?:第|疑似|AI|不是|不确定|老师|教师|学生|孩子|家长|同学))', sentence):
            if re.search(r'(?:学生|孩子|家长|同学|他|她)(?:说|认为|表示|反馈|觉得)', clause):
                source = 'reported'
            elif re.search(r'老师(?:明确)?确认|教师(?:明确)?确认', clause):
                source = 'teacher'
            elif re.search(r'AI|人工智能|推测|疑似|可能|红笔|识别|猜测', clause, re.I):
                source = 'ai'
            if re.search(r'不是|并非|不要|别记录|不能确定|不确定|是否|是不是|吗|假如|如果|例如|比如', clause) or source == 'reported':
                continue
            if source == 'teacher':
                for group in re.findall(r'第(' + NUMBERS + r')\s*题\s*(?:答|做|写|判)?(?:正确|对|没错|没有错|无错)', clause):
                    correct.extend(str(int(n)) for n in re.findall(r'\d+', group))
            if re.search(r'(?:没|无|不|非)(?:有)?错', clause):
                continue
            if not re.search(r'错题|题\s*(?:答|做|写|判)?错|题\s*不对', clause):
                continue
            found = re.findall(r'(?:错题(?:是|为|有|:|：)?\s*(?:第)?)(' + NUMBERS + r')\s*题?', clause)
            found += re.findall(r'第(' + NUMBERS + r')\s*题\s*(?:答|做|写|判)?错', clause)
            target = candidates if source == 'ai' else confirmed
            for group in found:
                for number in re.findall(r'\d+', group):
                    value = str(int(number))
                    if value != '0' and value not in target:
                        target.append(value)
    conflicts = [q for q in confirmed if q in correct]
    return {'questions': [q for q in confirmed[:30] if q not in conflicts],
            'candidate_questions': [q for q in candidates[:30] if q not in confirmed and q not in correct],
            'conflict_questions': conflicts[:30]}


def question_evidence(text):
    evidence = detailed_question_evidence(text)
    return evidence['questions'], evidence['candidate_questions']


def instruction_context(text, default_subject='math'):
    subjects = [v for k, v in SUBJECT_WORDS.items() if k in text]
    if len(subjects) > 1:
        raise ValueError('一次只处理一名学生的一科学习材料，请分开提交')
    classes = list(dict.fromkeys(re.findall(r'([一二三四五六七八九十0-9]+年级[一二三四五六七八九十0-9]+班)', text)))
    if len(classes) > 1:
        raise ValueError('出现多个班级，请明确本次是哪一个班级')
    names = re.findall(r'学生\s*(?!说|表示|认为|觉得|反馈)([A-Za-z\u4e00-\u9fff0-9·]{1,40}?)(?=\s|今天|昨天|前天|数学|英语|物理|化学|最近|近一个月|历史|错过|知识点|的|[，,。；;？！?]|$)', text)
    names = list(dict.fromkeys(names))
    if len(names) > 1:
        raise ValueError('检测到多个学生，请一次提交一名学生的作业')
    return {'name': names[0] if names else '', 'class_name': classes[0] if classes else '',
            'subject': subjects[0] if subjects else default_subject}


def parse_instruction(text, default_subject='math'):
    text = unicodedata.normalize('NFKC', text).strip()
    if not text or len(text) > 8000:
        raise ValueError('请用不超过8000字的文字交代本次作业')
    if not re.search(r'归档|存档|保存', text) or re.search(r'不要.{0,8}(?:归档|保存|存档)|不(?:用|必|要)?(?:归档|保存|存档)|别(?:归档|保存|存档)', text):
        raise ValueError('请明确说“帮我归档”；仅分析不会保存为教师记录')
    context = instruction_context(text, default_subject)
    today = datetime.now(ZoneInfo('Asia/Shanghai')).date()
    actual_date = '待补'
    dates = re.findall(r'(?<!\d)(20\d\d)[年/\-](\d{1,2})[月/\-](\d{1,2})日?', text)
    relative = [(word, delta) for word, delta in [('前天', 2), ('昨天', 1), ('今天', 0)] if word in text]
    if len(set(dates)) > 1 or len(relative) > 1 or dates and relative:
        raise ValueError('出现多个日期，请只说明本次作业的一个日期；未擅自选择')
    if dates:
        try:
            actual_date = date(*map(int, dates[0])).isoformat()
        except ValueError:
            raise ValueError('作业日期无效，请核对后重发；未以上传日期替代') from None
    else:
        if relative:
            actual_date = (today - timedelta(days=relative[0][1])).isoformat()
    batch = re.search(r'(?:作业批次|批次)(?:是|为|:|：)?\s*([^，,。；;\n]{1,80})', text)
    return {**context,
            'assignment_date': actual_date, 'batch': batch[1].strip() if batch else '',
            **detailed_question_evidence(text), 'teacher_instruction': text}
