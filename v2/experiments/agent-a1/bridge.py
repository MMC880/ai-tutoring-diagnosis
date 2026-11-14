"""Isolated A1 proof only: reuse business services; never loads provider credentials."""
import hashlib
import io
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from PIL import Image, ImageDraw
from backend.archive import ArchiveStore
from backend.intake import IntakeService
from backend.learning import LearningService, LinkInput
from backend.agent_history import AgentHistory
from backend.main import ChatInput, SKILL
from backend.provider import ProviderService

root = Path(sys.argv[1]).resolve()
archive = ArchiveStore(root / 'archive')
intake = IntakeService(archive)
learning = LearningService(intake)
provider = ProviderService(archive, SKILL, learning=learning)  # No credential store / model.


def seed():
    student = archive.resolve_student('合成学生A', True)['student']
    other = archive.resolve_student('合成学生B', True)['student']
    receipts = []
    for sid, subject, day, number, text in [
        (student['id'], 'math', '2026-11-01', '3', 'Q3: y=(x+2)^2-1; student vertex (2,-1)'),
        (student['id'], 'math', '2026-11-12', '5', 'Q5: y=-(x-2)^2+3; student vertex (-2,3)'),
        (other['id'], 'math', '2026-11-02', '9', 'OTHER STUDENT - OUT OF SCOPE'),
        (student['id'], 'english', '2026-11-03', '7', 'OTHER SUBJECT - OUT OF SCOPE'),
    ]:
        image = Image.new('RGB', (1000, 200), 'white')
        ImageDraw.Draw(image).text((10, 60), text, fill='black', font_size=25)
        out = io.BytesIO()
        image.save(out, 'PNG')
        receipt = intake.save_selected(sid, subject, [('synthetic.png', out.getvalue())],
                                      f'第{number}题错', day)
        receipts.append(receipt)
        if sid == student['id'] and subject == 'math':
            learning.link(LinkInput(student_id=sid, subject=subject, assignment_id=receipt['assignment_id'],
                number=number, tag='二次函数顶点式', status='CONFIRMED', expected_revision=0,
                evidence_hash=receipt['files'][0]['sha256'], page=1,
                quote=f'合成材料第{number}题：{text}；教师预置知识点关联，错因待核实'))
    fixture = {'student_id': student['id'], 'old': receipts[0], 'current': receipts[1],
               'foreign': receipts[2], 'english': receipts[3]}
    (root / 'fixture.json').write_text(json.dumps(fixture, ensure_ascii=False, indent=2), encoding='utf-8')
    return fixture


if '--seed' in sys.argv:
    print(json.dumps(seed(), ensure_ascii=False))
    raise SystemExit

fixture = json.loads((root / 'fixture.json').read_text(encoding='utf-8'))
history = AgentHistory(learning, ChatInput(text='A1合成验证', student_id=fixture['student_id'],
    subject='math', assignment_id=fixture['current']['assignment_id'], allow_history=True,
    allow_originals=True, allow_save=True))
receipts = {}


def call(name, args):
    if name in AgentHistory.NAMES:
        result, image = history.execute(name, args)
        content = [{'type': 'text', 'text': json.dumps(result, ensure_ascii=False)}]
        if image:
            prefix, data = image.split(',', 1)
            content.append({'type': 'image', 'data': data, 'mimeType': prefix[5:].split(';')[0]})
        return {'content': content}
    if name == 'save_pending_note':
        if set(args) != {'request_id', 'markdown'} or not history.sources:
            raise ValueError('仅允许保存已读取来源的待确认稿')
        fingerprint = hashlib.sha256(args['markdown'].encode()).hexdigest()
        key = args['request_id']
        if key in receipts:
            if receipts[key][0] != fingerprint:
                raise ValueError('同一请求内容改变')
            receipt = dict(receipts[key][1], replayed=True)
        else:
            receipt = provider._save_note(fixture['student_id'], 'math',
                args['markdown'] + history.provenance(), 'A1_LOCAL_DETERMINISTIC_MOCK')
            receipts[key] = (fingerprint, receipt)
        return {'content': [{'type': 'text', 'text': json.dumps(receipt, ensure_ascii=False)}]}
    if name == 'read_pending_note':
        notes = provider.notes(fixture['student_id'], 'math')
        note = next((n for n in notes if n['id'] == args['note_id']), None)
        if not note:
            raise ValueError('当前范围内没有该笔记')
        return {'content': [{'type': 'text', 'text': json.dumps(note, ensure_ascii=False)}]}
    raise ValueError('未授权工具')


for line in sys.stdin:
    try:
        request = json.loads(line)
        result = call(request['name'], request.get('args', {}))
        safe = {'id': request['id'], 'name': request['name'], 'args': request.get('args', {}),
                'isError': False, 'content_types': [c['type'] for c in result['content']],
                'text': [c['text'] for c in result['content'] if c['type'] == 'text']}
    except Exception as error:
        result = {'isError': True, 'content': [{'type': 'text', 'text': 'REJECTED: ' + str(error)}]}
        safe = {'id': request.get('id'), 'name': request.get('name'), 'isError': True, 'error': str(error)}
    with (root / 'tool-calls.jsonl').open('a', encoding='utf-8') as log:
        log.write(json.dumps(safe, ensure_ascii=False) + '\n')
    print(json.dumps({'id': request.get('id'), 'result': result}, ensure_ascii=False), flush=True)
