"""Read-only next-action clues, one row per exercise; no scheduler or diagnosis."""
import json
import learning_journey

ACTIONS = ('SOURCE_UNVERIFIED','REVIEW_DRAFT','WAITING_RETEST','RETEST_UNRESOLVED',
           'CONDITION_UNCONFIRMED','NEEDS_REVIEW','NEEDS_INDEPENDENT_RETEST','OBSERVE')


def practice_queue_overview(store):
    with store.lock, store.db() as db:
        papers = {r['id']: dict(r) for r in db.execute('''SELECT p.id,p.title,p.batch_id,p.student_id,
            p.version,p.confirmed_version,s.ref student_ref,s.name student_name
            FROM papers p JOIN students s ON s.id=p.student_id''')}
        items = []
        for student in db.execute('SELECT id FROM students ORDER BY ref').fetchall():
            events = []
            for row in db.execute('SELECT * FROM review_events WHERE student_id=? ORDER BY id',(student['id'],)):
                event = dict(row); event['question'] = json.loads(event.pop('body_json')); events.append(event)
            for journey in learning_journey.build(store,db,student['id'],events):
                exercise, source, retests = journey['exercise'], journey['source'], journey['retests']
                paper = papers[exercise['paper_id']]
                observation = journey['observation']
                current_retests = [r for r in retests if r['version']==exercise['version']]
                current_observation = learning_journey.retest_observation(current_retests,exercise['status']=='APPROVED')
                current_last = current_retests[-1] if current_retests else None
                action = ('SOURCE_UNVERIFIED' if source is None else 'REVIEW_DRAFT' if journey['current_draft']
                          else 'OBSERVE' if current_observation == 'INDEPENDENT_CORRECT_OBSERVE' else current_observation)
                if action not in ACTIONS: action = 'RETEST_UNRESOLVED'
                last = retests[-1] if retests else None
                items.append(dict(
                    id=exercise['id'], version=exercise['version'], status=exercise['status'], level=exercise['level'],
                    student_id=paper['student_id'], student_ref=paper['student_ref'], student_name=paper['student_name'],
                    paper_id=paper['id'], title=paper['title'], batch_id=paper['batch_id'],
                    paper_version=paper['version'], confirmed_version=paper['confirmed_version'], question_id=exercise['question_id'],
                    source_event_id=source['id'] if source else None, source_revision=source['revision'] if source else None,
                    source_has_later_confirmation=journey['source_has_later_confirmation'],
                    knowledge=source['question'].get('knowledge','') if source else '',
                    approved_versions=[v['version'] for v in journey['versions'] if v['status']=='APPROVED'],
                    retest_count=len(retests), latest_retest_id=last['id'] if last else None,
                    last_retest={key:last[key] for key in ('id','version','result','condition','created_at')} if last else None,
                    observation=observation, current_observation=current_observation,
                    current_retest_count=len(current_retests),current_retest_id=current_last['id'] if current_last else None,
                    current_last_retest={key:current_last[key] for key in ('id','version','result','condition','created_at')} if current_last else None,
                    action=action))
        items.sort(key=lambda row:(ACTIONS.index(row['action']),row['student_ref'],row['batch_id'],row['id']))
        return dict(batches=sorted({p['batch_id'] for p in papers.values()}),items=items,
                    counts={action:sum(row['action']==action for row in items) for action in ACTIONS})
