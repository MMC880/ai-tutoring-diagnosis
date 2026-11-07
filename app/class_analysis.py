"""Read-only class knowledge evidence, deduplicated separately for each student."""
from learning_analysis import build_learning_analysis
from store import RESULTS


def build_class_analysis(latest, papers, event_documents):
    groups = {}
    unclassified = duplicates = 0
    students = {}
    for event in latest:
        students.setdefault(event['student_id'], []).append(event)
    for student_id, events in students.items():
        student = dict(student_id=student_id, student_ref=events[0]['student_ref'],
                       student_name=events[0]['student_name'])
        analysis = build_learning_analysis(events, papers, event_documents)
        unclassified += analysis['unclassified_count']
        duplicates += analysis['duplicate_count']
        for source in analysis['groups']:
            group = groups.setdefault(source['id'], dict(
                id=source['id'], knowledge=source['knowledge'], basis=source['basis'],
                teaching_entry=source['teaching_entry'], knowledge_names=[], question_types=[],
                counts={k: 0 for k in RESULTS}, wrong_count=0,
                affected_students=[], affected_student_count=0, evidence=[]))
            for field in ('knowledge_names', 'question_types'):
                for value in source[field]:
                    if value not in group[field]:
                        group[field].append(value)
            for result, count in source['counts'].items():
                group['counts'][result] += count
            group['wrong_count'] += source['wrong_count']
            if source['wrong_count']:
                group['affected_students'].append(student.copy())
            group['evidence'].extend(e | student for e in source['evidence'])
    for group in groups.values():
        group['affected_students'].sort(key=lambda s: (s['student_ref'], s['student_id']))
        group['affected_student_count'] = len(group['affected_students'])
        group['evidence'].sort(key=lambda e: (e['student_ref'], e['question_id'], -e['event_id']))
    return dict(groups=sorted(groups.values(), key=lambda g: (
        -g['affected_student_count'], -g['wrong_count'], g['id'])),
        unclassified_count=unclassified, duplicate_count=duplicates)
