"""Attach exact-source exercise observations; never change grades or infer mastery."""
from learning_analysis import knowledge_group_id


def attach_followup(analysis, journeys):
    groups = {group['id']: group for group in analysis['groups']}
    for group in groups.values():
        group['followup'] = dict(exercise_count=0, retest_count=0, observations={}, items=[])
    analysis['unmatched_followup_count'] = 0
    for journey in journeys:
        source = journey['source']
        ident = knowledge_group_id(source['question']) if source else None
        group = groups.get(ident)
        if group is None:
            analysis['unmatched_followup_count'] += 1
            continue
        exercise, retests = journey['exercise'], journey['retests']
        last = retests[-1] if retests else None
        progress = group['followup']
        observation = journey['observation']
        progress['exercise_count'] += 1
        progress['retest_count'] += len(retests)
        progress['observations'][observation] = progress['observations'].get(observation, 0) + 1
        progress['items'].append(dict(
            exercise_id=exercise['id'], level=exercise['level'],
            source_event_id=source['id'], source_revision=source['revision'],
            source_has_later_confirmation=journey['source_has_later_confirmation'],
            current_version=exercise['version'], current_draft=journey['current_draft'],
            approved_version_count=sum(v['status']=='APPROVED' for v in journey['versions']),
            retest_count=len(retests), observation=observation,
            last_retest={key: last[key] for key in ('id','version','condition','result','created_at')} if last else None))
