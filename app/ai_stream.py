"""Bounded Chat Completions SSE receipt; reasoning and tool data are never returned."""
import json
import time


class IncompleteResponse(Exception):
    def __init__(self,code,usage=None):
        super().__init__(code)
        self.code=code
        self.usage=usage


def read_sse(response,clock=None):
    clock=clock or time.monotonic
    started=clock(); buffer=b''; data=[]; text=[]; usage=None; finish=None; identity=None
    size=0; content_size=0; done=False; first_line=True

    def fail(code): raise IncompleteResponse(code,usage)

    def dispatch():
        nonlocal data,usage,finish,identity,content_size,done
        if not data: return
        value='\n'.join(data); data=[]
        if value.strip()=='[DONE]':
            if finish is None: fail('STREAM_TERMINAL_MISSING')
            done=True; return
        try: item=json.loads(value)
        except (ValueError,TypeError): fail('STREAM_INVALID_EVENT')
        if not isinstance(item,dict) or 'error' in item: fail('STREAM_INVALID_EVENT')
        if isinstance(item.get('usage'),dict):
            valid={k:v for k,v in item['usage'].items() if k in ('prompt_tokens','completion_tokens','total_tokens','prompt_cache_hit_tokens','prompt_cache_miss_tokens') and type(v) is int and v>=0}
            if valid: usage=(usage or {})|valid
        ident=item.get('id')
        if ident is not None:
            if identity is not None and ident!=identity: fail('STREAM_ID_CHANGED')
            identity=ident
        choices=item.get('choices')
        if not isinstance(choices,list) or len(choices)>1: fail('STREAM_INVALID_CHOICE')
        if not choices:
            if not isinstance(item.get('usage'),dict): fail('STREAM_INVALID_EVENT')
            return
        choice=choices[0]
        if not isinstance(choice,dict) or choice.get('index',0)!=0: fail('STREAM_INVALID_CHOICE')
        delta=choice.get('delta',{})
        if not isinstance(delta,dict) or delta.get('tool_calls') or delta.get('function_call'): fail('STREAM_TOOLS_BLOCKED')
        content=delta.get('content')
        reason=choice.get('finish_reason')
        if content is not None and not isinstance(content,str): fail('STREAM_INVALID_CONTENT')
        if finish is not None and (content or reason is not None): fail('STREAM_AFTER_TERMINAL')
        if content:
            content_size+=len(content)
            if content_size>100000: fail('STREAM_CONTENT_LIMIT')
            text.append(content)
        if reason is not None:
            if not isinstance(reason,str): fail('STREAM_INVALID_FINISH')
            finish=reason

    while not done:
        if clock()-started>120: fail('STREAM_TIME_LIMIT')
        try: raw=response.read1(65536)
        except Exception: fail('STREAM_INTERRUPTED')
        if clock()-started>120: fail('STREAM_TIME_LIMIT')
        if not raw: fail('STREAM_INCOMPLETE')
        size+=len(raw)
        if size>1024*1024: fail('STREAM_SIZE_LIMIT')
        buffer+=raw
        while b'\n' in buffer:
            line,buffer=buffer.split(b'\n',1)
            if len(line)>262144: fail('STREAM_LINE_LIMIT')
            try: line=line.rstrip(b'\r').decode('utf-8')
            except UnicodeError: fail('STREAM_INVALID_UTF8')
            if first_line: line=line.removeprefix('\ufeff'); first_line=False
            if not line:
                dispatch()
                if done: break
            elif line.startswith('data:'):
                value=line[5:]
                data.append(value[1:] if value.startswith(' ') else value)
            # Comments, event/id/retry fields are not model content.
        if len(buffer)>262144: fail('STREAM_LINE_LIMIT')
    return dict(choices=[dict(message=dict(content=''.join(text)),finish_reason=finish)],usage=usage)
