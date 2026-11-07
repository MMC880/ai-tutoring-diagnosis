"""Pure rules for local teacher evidence; no external requests or confirmations."""
EVALUATED = ('CORRECT', 'INCORRECT', 'PARTIAL')
TEACHER_FIELDS = ('teacher_result', 'teacher_mark', 'grading_note')
LOCAL_FIELDS = TEACHER_FIELDS + ('ai_result', 'grading_resolved', 'teaching_ref')
RECOGNITION_FIELDS = ('recognition_notes', 'recognition_notice', 'recognition_resolved')


def has_evidence(question):
    return any(question.get(field) for field in TEACHER_FIELDS + ('ai_result','teaching_ref'))


def merge_draft(previous, incoming, imported=False):
    if imported:
        # A file is data, never a teacher's new acknowledgement or original mark.
        revised = {k: v for k, v in incoming.items() if k not in LOCAL_FIELDS}
        revised.update({k: previous[k] for k in LOCAL_FIELDS if k in previous})
        if previous.get('teaching_ref'):
            revised['knowledge']=previous['knowledge']
        if any(k in previous for k in LOCAL_FIELDS):
            revised['grading_resolved'] = False
        # Imported text cannot erase doubts or authorize their resolution.
        for field in RECOGNITION_FIELDS[:2]:
            values = [v for v in (previous.get(field, ''), incoming.get(field, '')) if v]
            if values:
                revised[field] = '；'.join(dict.fromkeys(values))
        if any(revised.get(k) for k in RECOGNITION_FIELDS[:2]) or any(
                item.get('recognition_resolved') is False for item in (previous, incoming)):
            revised['recognition_resolved'] = False
            if revised['result'] != 'MISSING':
                revised['result'] = 'PENDING'
        return revised
    # Legacy/manual clients may omit optional fields; omission is not deletion.
    revised = {k: previous[k] for k in LOCAL_FIELDS + RECOGNITION_FIELDS if k in previous} | incoming
    if 'grading_resolved' not in incoming and has_evidence(previous) and any(
            previous.get(k) != v for k, v in incoming.items()):
        revised['grading_resolved'] = False
    return revised


def has_conflict(question):
    original = question.get('teacher_result', '')
    return original in EVALUATED and any(
        question.get(field) in EVALUATED and question[field] != original
        for field in ('result', 'ai_result'))


def needs_resolution(question):
    return question['result'] in EVALUATED and has_conflict(question) and not (
        question.get('grading_resolved') is True and question.get('grading_note', '').strip())


def merge_suggestion(question, suggestion):
    if not suggestion:
        return dict(question)
    fields = {k: suggestion[k] for k in ('result', 'correct_answer', 'knowledge', 'cause')}
    if suggestion.get('question_type'):
        fields['question_type'] = suggestion['question_type']
    revised = question | fields
    if question.get('teacher_result') in EVALUATED:
        # A new AI opinion must not replace the existing teacher final choice.
        revised['result'] = question['result']
        revised['cause'] = question.get('cause', '')
    revised['ai_result'] = suggestion['result']
    if question.get('teaching_ref'):
        revised['knowledge']=question['knowledge']
    revised['grading_resolved'] = False
    return revised


def preserve_teacher(previous, updated):
    """New transcription invalidates old AI opinion and conflict acknowledgement."""
    result = dict(updated)
    for field in TEACHER_FIELDS:
        if field in previous:
            result[field] = previous[field]
    if previous.get('teaching_ref'):
        result['teaching_ref']=previous['teaching_ref']
        result['knowledge']=previous['knowledge']
    result.pop('ai_result', None)
    if any(field in previous for field in TEACHER_FIELDS) or 'grading_resolved' in previous:
        result['grading_resolved'] = False
    return result
