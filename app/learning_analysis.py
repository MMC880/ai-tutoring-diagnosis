"""Read-only learning evidence. Counts are observations, never mastery diagnoses."""
import hashlib
import json
from store import RESULTS


def _label(value): return ' '.join(value.split()) if isinstance(value,str) else ''


def build_learning_analysis(latest,papers):
    by_paper={p['id']:p for p in papers}
    seen={}; unique=[]; duplicates=[]; photo_papers={}; source_units={}
    for event in sorted(latest,key=lambda e:e['id'],reverse=True):
        paper=by_paper[event['paper_id']]
        photos=tuple(sorted({d['sha256'] for d in paper.get('documents',[])
            if d.get('role','作业')=='作业' and d.get('mime') in (
                'image/png','image/jpeg','application/pdf',
                'application/vnd.openxmlformats-officedocument.wordprocessingml.document')}))
        unit=('documents',photos) if photos else ('paper',paper['id'])
        source_units[event['id']]=hashlib.sha256(json.dumps(unit).encode()).hexdigest()
        if photos:photo_papers.setdefault(photos,set()).add(paper['id'])
        identity=(unit,event['question_id'])
        if identity in seen:
            duplicates.append(dict(paper_id=paper['id'],question_id=event['question_id'],kept_paper_id=seen[identity]))
            continue
        seen[identity]=paper['id'];unique.append(event)
    groups={};unclassified=0
    for event in unique:
        q=event['question'];paper=by_paper[event['paper_id']]
        knowledge=_label(q.get('knowledge',''));kind=_label(q.get('question_type',''))
        if not knowledge and not kind:
            unclassified+=1;continue
        reference=q.get('teaching_ref')
        # The teacher-selected entry is stable across approved source versions.
        # Text-only records keep their legacy grouping and never join it by name.
        key=('teaching-entry',reference['material_id'],reference['entry_id']) if reference else (knowledge,kind)
        if key not in groups:
            ident=hashlib.sha256(json.dumps(key,ensure_ascii=False).encode()).hexdigest()
            groups[key]=dict(id=ident,knowledge=knowledge,question_type=kind,counts={k:0 for k in RESULTS},
                wrong_count=0,wrong_paper_count=0,paper_count=0,evidence=[],practice_source=None,review_source=None,
                signal='NO_CURRENT_ERROR',last_event_id=event['id'],
                basis='TEACHING_ENTRY' if reference else 'LABEL_ONLY',
                teaching_entry={k:reference[k] for k in ('material_id','entry_id')} if reference else None,
                knowledge_names=[],question_types=[])
        group=groups[key];group['counts'][event['result']]+=1
        if knowledge and knowledge not in group['knowledge_names']:group['knowledge_names'].append(knowledge)
        if kind and kind not in group['question_types']:group['question_types'].append(kind)
        source=dict(paper_id=paper['id'],question_id=event['question_id'],revision=event['revision'])
        ready=paper['version']==paper['confirmed_version']==event['revision']
        group['evidence'].append(source|dict(event_id=event['id'],batch_id=event['batch_id'],title=paper['title'],
            result=event['result'],stem=q['stem'],answer=q['answer'],cause=q.get('cause',''),created_at=event['created_at'],
            knowledge=knowledge,question_type=kind,teaching_ref=dict(reference) if reference else None,
            current_version=paper['version'],source_ready=ready,assignment_key=source_units[event['id']]))
        if event['result'] in ('INCORRECT','PARTIAL'):
            group['wrong_count']+=1
            if group['review_source'] is None:group['review_source']=source
            if ready and group['practice_source'] is None:group['practice_source']=source
    for group in groups.values():
        group['paper_count']=len({e['assignment_key'] for e in group['evidence']})
        group['wrong_paper_count']=len({e['assignment_key'] for e in group['evidence'] if e['result'] in ('INCORRECT','PARTIAL')})
        if group['wrong_paper_count']>=2:group['signal']='REPEATED_ACROSS_PAPERS'
        elif group['wrong_count']>=2:group['signal']='MULTIPLE_IN_PAPER'
        elif group['wrong_count']:group['signal']='ONE_ERROR'
    return dict(evidence_event_ids=[e['id'] for e in unique],groups=sorted(groups.values(),key=lambda g:(-g['wrong_paper_count'],-g['wrong_count'],-g['last_event_id'])),
                unclassified_count=unclassified,duplicate_count=len(duplicates),duplicate_evidence=duplicates,
                reused_source_paper_count=sum(len(ids)-1 for ids in photo_papers.values()),
                reused_photo_paper_count=sum(len(ids)-1 for ids in photo_papers.values()))
