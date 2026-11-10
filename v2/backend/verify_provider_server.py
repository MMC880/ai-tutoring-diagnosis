from pathlib import Path
import os
import json
import sys
import uvicorn
import httpx

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from backend.main import create_app

def deterministic_transport(request):
    """Explicit mocked transport for local UI regressions; never contacts a provider."""
    data = json.loads(request.content)
    messages = data['messages']
    last = messages[-1]
    calls = []
    text = ''
    if last['role'] == 'tool':
        result = json.loads(last['content'])
        text = '正确结果5；本次不认定长期掌握。' if result['status'] == 'READ' else '已按本地工具回执保存AI待确认笔记。'
    else:
        content = last['content']
        prompt = content if isinstance(content, str) else content[0]['text']
        if '晋学智辅连接成功' in prompt:
            text = '晋学智辅连接成功。'
        elif 'save_learning_note' in prompt:
            calls = [{'id': 'mock-save', 'type': 'function', 'function': {'name': 'save_learning_note',
                      'arguments': json.dumps({'markdown': '合成题y=2x+1；x=2时y=5。虚构答案4，单次错误待教师复核。'})}}]
        elif 'read_selected_summary' in prompt:
            calls = [{'id': 'mock-read', 'type': 'function', 'function': {'name': 'read_selected_summary', 'arguments': '{}'}}]
        elif isinstance(content, list) and len(content) > 1:
            text = '683917'
        elif '桌面连接成功' in prompt:
            text = '桌面连接成功。'
        else:
            text = '青禾（本地确定性测试回复）'
    return httpx.Response(200, json={'model': data['model'], 'choices': [{'message': {
        'role': 'assistant', 'content': text, 'tool_calls': calls}}], 'usage': {'total_tokens': 0}})

if __name__ == '__main__':
    output = ROOT / '.qa-temp' / 'provider-test' / 'live-run'
    transport = httpx.MockTransport(deterministic_transport) if os.environ.get('JINXUE_VERIFY_MOCK') == '1' else None
    app = create_app(output / 'probe.sqlite3', output / ('mock-archive' if transport else 'archive'), provider_transport=transport)
    uvicorn.run(app, host='127.0.0.1', port=8019, access_log=False)
