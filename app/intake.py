"""Read-only received-paper overview; attachments do not prove completeness."""
import json
from collections import defaultdict
import grading


def intake_overview(store):
    batches = {}
    # One consistent snapshot of existing local rows; no files or external calls.
    with store.lock, store.db() as db:
        rows = db.execute('''SELECT p.id,p.batch_id,p.title,p.student_id,p.version,
            p.confirmed_version,p.questions_json,p.documents_json,s.ref,s.name
            FROM papers p JOIN students s ON s.id=p.student_id
            ORDER BY p.batch_id,s.ref,p.id''').fetchall()
    for source in rows:
        batch = batches.setdefault(source['batch_id'], dict(batch_id=source['batch_id'],
            expected_students=None, paper_count=0, confirmed_papers=0,
            waiting_papers=0, issue_papers=0, papers=[]))
        questions = json.loads(source['questions_json'])
        documents = json.loads(source['documents_json'])
        assignments = [d for d in documents if d.get('role', '作业') == '作业']
        photos = [d for d in assignments if d.get('mime') in ('image/png','image/jpeg','image/webp')]
        identities = [d.get('sha256') or d['id'] for d in assignments]
        current = source['version'] == source['confirmed_version']
        paper = {k:source[k] for k in ('id','batch_id','title','student_id','version','confirmed_version')}
        paper.update(student_ref=source['ref'], student_name=source['name'], expected_pages=None,
            review_state='CONFIRMED' if current else 'REVISED' if source['confirmed_version'] else 'DRAFT',
            question_count=len(questions), pending_questions=sum(q['result']=='PENDING' for q in questions),
            missing_questions=sum(q['result']=='MISSING' for q in questions),
            recognition_questions=sum(q.get('recognition_resolved',not bool(q.get('recognition_notes') or q.get('recognition_notice'))) is False for q in questions),
            grading_questions=sum(grading.needs_resolution(q) for q in questions),
            assignment_attachments=len(assignments), photo_count=len(photos),
            reference_attachments=len(documents)-len(assignments),
            duplicate_attachments=len(identities)-len(set(identities)), shared_photos=[],
            _photo_hashes={d['sha256'] for d in photos if d.get('sha256')})
        batch['papers'].append(paper)
        batch['paper_count'] += 1
        batch['confirmed_papers'] += int(current)
        batch['waiting_papers'] += int(not current)
    for batch in batches.values():
        photo_index = defaultdict(list)
        for paper in batch['papers']:
            for digest in paper['_photo_hashes']:photo_index[digest].append(paper)
        for paper in batch['papers']:
            peers = {other['id']:other for digest in paper['_photo_hashes'] for other in photo_index[digest]
                     if other['student_id'] != paper['student_id']}
            paper['shared_photos'] = [{k:other[k] for k in ('id','student_id','student_ref')}
                                     for other in sorted(peers.values(),key=lambda p:(p['student_ref'],p['id']))]
            del paper['_photo_hashes']
            paper['has_issues'] = bool(paper['pending_questions'] or paper['missing_questions'] or
                paper['recognition_questions'] or paper['grading_questions'] or
                paper['duplicate_attachments'] or paper['shared_photos'] or not paper['assignment_attachments'])
            batch['issue_papers'] += int(paper['has_issues'])
    return dict(batches=list(batches.values()))
