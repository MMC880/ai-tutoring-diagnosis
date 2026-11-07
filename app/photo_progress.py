"""Read-only per-photo history; a saved transcription is not paper approval."""
import json


def photo_progress(store,paper_id):
    with store.lock,store.db() as db:
        paper=store._paper(db,paper_id)
        images=[];seen=set()
        for doc in paper['documents']:
            if doc['id'] in seen or doc.get('role','作业')!='作业' or doc['mime'] not in ('image/png','image/jpeg'):continue
            seen.add(doc['id'])
            images.append(dict(document_id=doc['id'],filename=doc['filename'],position=len(images)+1,job_count=0,latest=None,saved=None))
        indexed={row['document_id']:row for row in images};unlinked=0
        tables={r[0] for r in db.execute("SELECT name FROM sqlite_master WHERE type='table'")}
        if 'ai_jobs' in tables:
            review='transcription_reviews' in tables
            query='''SELECT j.id,j.status,j.paper_version,j.applied_version,j.created_at,j.metadata_json,'''+(
                'r.teacher_json,r.source_version,r.applied_version review_version FROM ai_jobs j LEFT JOIN transcription_reviews r ON r.job_id=j.id AND r.paper_id=j.paper_id'
                if review else 'NULL teacher_json,NULL source_version,NULL review_version FROM ai_jobs j')+''' WHERE j.paper_id=? AND j.mode='vision_transcribe' ORDER BY j.created_at DESC,j.rowid DESC'''
            for job in db.execute(query,(paper_id,)):
                try:meta=json.loads(job['metadata_json'])
                except (ValueError,TypeError):meta=None
                ident=meta.get('document_id') if isinstance(meta,dict) else None
                row=indexed.get(ident) if isinstance(ident,str) else None
                if row is None:unlinked+=1;continue
                target=meta.get('target_question_id','')
                brief={k:job[k] for k in ('id','status','paper_version','applied_version','created_at')}
                brief['target_question_id']=target[:40] if isinstance(target,str) else ''
                row['job_count']+=1
                if row['latest'] is None:row['latest']=brief
                if row['saved'] is not None or not job['teacher_json']:continue
                try:saved=json.loads(job['teacher_json'])
                except (ValueError,TypeError):continue
                if isinstance(saved,list):method='MODEL_REVIEW';questions=saved
                elif isinstance(saved,dict) and saved.get('source_method')=='MANUAL_FALLBACK':
                    method='MANUAL_FALLBACK';questions=saved.get('questions')
                else:continue
                if not isinstance(questions,list) or not questions:continue
                version=job['applied_version']
                if type(version) is not int or not 1<=version<=paper['version'] or version!=job['review_version'] or job['paper_version']!=job['source_version'] or version!=job['source_version']+1:continue
                if method=='MODEL_REVIEW' and job['status']!='APPLIED':continue
                row['saved']=brief|dict(source_method=method)
        count=sum(row['saved'] is not None for row in images)
        return dict(paper_id=paper_id,version=paper['version'],confirmed_version=paper['confirmed_version'],total_images=len(images),
                    images_with_saved_record=count,images_without_saved_record=len(images)-count,unlinked_jobs=unlinked,images=images)
