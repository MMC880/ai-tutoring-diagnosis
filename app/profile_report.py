"""Read-only teacher report tied to a coherent student archive snapshot."""
import hashlib
import hmac
import json
import re
from learning_journey import retest_observation
from store import ValidationError, ConflictError

RESULT_LABELS = dict(CORRECT='正确', INCORRECT='错误', PARTIAL='部分正确', PENDING='待核实', MISSING='缺材料')
OBSERVATIONS = dict(WAITING_APPROVAL='等待教师审批', WAITING_RETEST='等待复测',
    RETEST_UNRESOLVED='复测材料或判定待核实', CONDITION_UNCONFIRMED='完成条件待核实',
    NEEDS_REVIEW='仍需讲解与补齐', NEEDS_INDEPENDENT_RETEST='有提示，仍需独立复测',
    INDEPENDENT_CORRECT_OBSERVE='独立答对，仍需后续观察')


def build_profile_report(store, student_id):
    if not isinstance(student_id, str) or not re.fullmatch(r'[a-f0-9]{32}', student_id):
        raise ValidationError('学生编号无效')
    # RLock also covers profile's nested read: a same-app write cannot interleave.
    with store.lock:
        profile = store.profile(student_id)
        if not profile['student'] or profile['student']['id'] != student_id:
            raise ValidationError('学生档案不存在')
        with store.db() as db:
            papers = [dict(r) for r in db.execute('''SELECT id,title,batch_id,version,confirmed_version
                FROM papers WHERE student_id=? ORDER BY id''', (student_id,))]
    snapshot = dict(profile=profile, papers=papers)
    fingerprint = hashlib.sha256(json.dumps(snapshot, ensure_ascii=False, sort_keys=True,
        separators=(',', ':')).encode('utf-8')).hexdigest()
    student, summary = profile['student'], profile['archive_summary']
    title = '个人学情报告 · 教师核对稿'
    blocks = [('text', f"学生：{student['name']} · 本地编号：{student['ref']}"),
        ('text', '仅供教师核对，含学生本地学习记录；不自动发给学生或家长。'),
        ('text', '统计依据为去重后的当前确认记录，完整历史保留；缺材料不记为不会，待核实不计为错误。记录时间不等于实际考试日期。'),
        ('text', f"当前原卷记录：{summary['current_records']}项；确认历史：{summary['history_events']}条；同原件同题去重：{summary['duplicate_count']}项；有待审内容的卷：{summary['pending_papers']}份。"),
        ('text', ' / '.join(f'{label}：{summary["counts"][result]}' for result, label in RESULT_LABELS.items())),
        ('heading', '一、当前已确认原卷记录')]
    if not profile['current_evidence']:
        blocks.append(('text', '暂无已确认原卷记录；不推测薄弱点或掌握程度。'))
    by_paper = {p['id']:p for p in papers}
    for event in profile['current_evidence']:
        q = event['question']; p = by_paper[event['paper_id']]
        blocks.extend([('heading', f"{p['title']} · {event['batch_id']} / {event['question_id']} / R{event['revision']}"),
            ('text', f"确认记录#{event['id']} · 写入时间：{event['created_at']} · 判定：{RESULT_LABELS[event['result']]}"),
            ('text', '作业日期：' + (event.get('assignment_date') or '未提供')),
            ('math', q['stem']), ('math', '当次原答：' + (q['answer'] or '未录入')),
            ('text', f"知识点：{q.get('knowledge') or '待标注'}；题型：{q.get('question_type') or '待标注'}；错因记录：{q.get('cause') or '未认定'}")])
        if p['version'] != p['confirmed_version']:
            blocks.append(('text', '此卷另有待审修订；本报告保留最近确认内容，不采用未确认草稿。'))
    blocks.append(('heading', '二、知识问题线索'))
    for group in profile['learning_analysis']['groups']:
        blocks.append(('text', f"{group['knowledge'] or '知识点待核对'} · {group['question_type'] or '题型待标注'}：错误或部分正确{group['wrong_count']}项，涉及{group['wrong_paper_count']}份去重来源；仅为作答线索，不认定长期薄弱。"))
    if not profile['learning_analysis']['groups']:
        blocks.append(('text', '暂无已关联知识线索；请老师核对关联，不自动补标签。'))
    blocks.append(('heading', '三、补练与复测（与原卷分开）'))
    for journey in profile['learning_journeys']:
        exercise, source = journey['exercise'], journey['source']
        current_retests = [r for r in journey['retests'] if r['version'] == exercise['version']]
        observation = retest_observation(current_retests, exercise['status'] == 'APPROVED')
        blocks.append(('heading', f"{exercise['question_id']} · {exercise['level']} · 练习{exercise['id']}"))
        if source:
            blocks.extend([('text', f"固定原题确认#{source['id']} / R{source['revision']}；建立时知识：{source['question'].get('knowledge') or '待标注'}"),
                ('text', '原题当次作业日期：' + (source.get('assignment_date') or '未提供')),
                ('math', source['question']['stem'])])
        else:
            blocks.append(('text', '固定原题来源待核实；不以当前关联倒推历史。'))
        blocks.append(('text', f"当前版本V{exercise['version']}：{OBSERVATIONS[observation]}；{'已批准题面' if exercise['status']=='APPROVED' else '当前题面待审'}，批准不等于已发放或已完成。"))
        for version in journey['versions']:
            blocks.extend([('text', f"练习V{version['version']} · {'已批准' if version['status']=='APPROVED' else '待审'} · {'当前题面' if version['version']==exercise['version'] else '历史题面'}"),
                ('math', version['stem'])])
        for r in journey['retests']:
            blocks.extend([('text', f"历史复测V{r['version']} · 记录#{r['id']} · {r['condition']} · {RESULT_LABELS[r['result']]} · 写入时间：{r['created_at']}"),
                ('math', '本次题面：' + r['exercise_snapshot']['stem']),
                ('math', '本次作答：' + (r['answer'] or '未录入／待核实'))])
    if not profile['learning_journeys']:
        blocks.append(('text', '暂无补练与复测记录；不自动创建训练或填写作答。'))
    blocks.append(('text', '一次答对不代表已经掌握；原错题与确认历史保留，后续结合独立复测继续观察。本报告不包含心理档案。'))
    return dict(student_id=student_id, title=title, fingerprint=fingerprint, blocks=blocks,
        record_count=summary['current_records'], history_count=summary['history_events'], summary_counts=summary['counts'])


def report_content(store, student_id, fingerprint, audience='teacher'):
    if audience != 'teacher':
        raise ValidationError('学情报告仅提供教师核对稿')
    if not isinstance(fingerprint, str) or not re.fullmatch(r'[a-f0-9]{64}', fingerprint):
        raise ValidationError('请先预览并核对当前报告')
    report = build_profile_report(store, student_id)
    if not hmac.compare_digest(fingerprint, report['fingerprint']):
        raise ConflictError('学生档案已更新，请重新预览核对后导出')
    return report['title'], report['blocks']
