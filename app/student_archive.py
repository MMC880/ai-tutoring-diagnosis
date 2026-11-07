"""Read-only per-student archive counts; no mastery inference or database writes."""
from store import RESULTS


def summarize(events, latest, analysis, papers):
    included = set(analysis.get('evidence_event_ids', []))
    current = [event for event in latest if event['id'] in included]
    counts = {result: sum(event['result'] == result for event in current) for result in RESULTS}
    return dict(current_evidence=current, archive_summary=dict(
        counts=counts, history_events=len(events), current_records=len(current),
        duplicate_count=analysis.get('duplicate_count', 0),
        confirmed_papers=len({event['paper_id'] for event in latest}),
        pending_papers=sum(p['version'] != p['confirmed_version'] for p in papers)))
