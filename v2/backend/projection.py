"""Read current teacher decisions without rewriting immutable intake receipts."""
import json


def effective(db, record):
    exists = db.execute("SELECT 1 FROM sqlite_master WHERE name='learning_events'").fetchone()
    if not exists:
        return record
    row = db.execute("SELECT payload,revision FROM learning_events WHERE kind='CORRECTION' AND entity=? ORDER BY revision DESC LIMIT 1",
                     (record['assignment_id'],)).fetchone()
    if not row:
        return record
    change = json.loads(row['payload'])
    pending = [p for p in record['pending'] if not p.startswith(('作业日期待补', '尚无教师明确提供'))]
    if change['assignment_date'] == '待补':
        pending.append('作业日期待补，上传时间另外保留')
    pending.extend(change['missing_pages'])
    return dict(record, original_questions=record['questions'], questions=change['questions'],
                assignment_date=change['assignment_date'], missing_pages=change['missing_pages'],
                correction_revision=row['revision'], correction_reason=change['reason'], pending=pending)
