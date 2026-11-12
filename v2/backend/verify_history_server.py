"""Synthetic Electron acceptance host. Only external model responses are scripted."""
import json
import sys
import tempfile
from pathlib import Path

import uvicorn

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from backend.test_agent_history import AgentHistoryTests


if __name__ == '__main__':
    output = Path(sys.argv[1])
    tempfile.tempdir = str(output)
    fixture = AgentHistoryTests()
    fixture.setUp()
    metadata = {'student': fixture.student, 'other': fixture.other, 'old': fixture.old, 'new': fixture.new,
                'foreign': fixture.foreign, 'english': fixture.english, 'archive': str(fixture.root / 'archive')}
    (output / 'fixtures.json').write_text(json.dumps(metadata, ensure_ascii=False, indent=2), encoding='utf-8')
    before = fixture.client.get('/api/learning/workspace', params={'student_id': fixture.student['id'], 'subject': 'math'}).json()
    (output / 'workspace-before.json').write_text(json.dumps(before, ensure_ascii=False, indent=2), encoding='utf-8')

    def turn(payload):
        (output / 'model-requests.json').write_text(json.dumps(fixture.requests, ensure_ascii=False, indent=2), encoding='utf-8')
        tools = {t['function']['name'] for t in payload['tools']}
        done = [m for m in payload['messages'] if m['role'] == 'tool']
        if 'search_student_history' not in tools:
            return {'content': '历史读取未授权，本次未查看历史。'}
        if not done:
            return {'tool_calls': [fixture.call('read_assignment', assignment_id=fixture.new['assignment_id'], number='5'),
                                   fixture.call('search_student_history', query='二次函数')]}
        names = [m['tool_call_id'] for m in done]
        if 'call-read_assignment_image' not in names:
            return {'tool_calls': [fixture.call('read_assignment', assignment_id=fixture.old['assignment_id'], number='3'),
                                   fixture.call('read_assignment_image', assignment_id=fixture.new['assignment_id'], sha256=fixture.new['files'][0]['sha256'])]}
        if 'call-save_learning_note' not in names:
            return {'tool_calls': [fixture.call('save_learning_note', markdown=(
                f"本地模拟分析（外部回复替身，未验证真实模型理解）：\n\n本次{fixture.new['assignment_id']}第5题与"
                f"2026-11-01作业{fixture.old['assignment_id']}第3题均关联教师确认的二次函数顶点式。"
                '依据为结构化知识点关联及页1证据摘录；仅本次原图分析副本已提供。历史原图未读取，'
                '是否同一错因仍待核实，不能认定长期薄弱。'))]}
        return {'content': f"已保存AI待确认笔记。本次第5题与2026-11-01第3题（{fixture.old['assignment_id']}）可能有关；错因待核实，历史原图未读取。仅合成传输测试。"}

    fixture.turn = turn
    uvicorn.run(fixture.client.app, host='127.0.0.1', port=18019, access_log=False)
