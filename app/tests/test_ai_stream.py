import json
from pathlib import Path
import sys
import unittest
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
try:
    import ai_stream
except ImportError:
    ai_stream=None


class ByteResponse:
    def __init__(self,chunks): self.chunks=iter(chunks)
    def read1(self,size):
        value=next(self.chunks,b'')
        if isinstance(value,Exception): raise value
        return value


def event(value):
    return ('data: '+json.dumps(value,ensure_ascii=False)+'\n\n').encode()


def chunk(text=None,finish=None,**delta):
    if text is not None: delta['content']=text
    return {'id':'test-stream','choices':[{'index':0,'delta':delta,'finish_reason':finish}]}


class StreamTests(unittest.TestCase):
    def setUp(self): self.assertIsNotNone(ai_stream,'分段响应解析尚未实现')

    def test_utf8_split_and_heartbeats_merge_only_final_content(self):
        raw=b': heartbeat\n\n'+event(chunk(reasoning_content='DO-NOT-KEEP-SECRET-THOUGHT'))+event(chunk('顶点'))+event(chunk('(-2,3)','stop'))+event({'choices':[],'usage':{'total_tokens':31}})+b'data: [DONE]\n\n'
        result=ai_stream.read_sse(ByteResponse([raw[i:i+1] for i in range(len(raw))]))
        self.assertEqual(result['choices'][0]['message']['content'],'顶点(-2,3)')
        self.assertEqual(result['usage'],{'total_tokens':31})
        self.assertNotIn('DO-NOT-KEEP',json.dumps(result))

    def test_multiline_data_and_crlf_frames(self):
        value=json.dumps(chunk('x=2','stop'),indent=1)
        raw=('\r\n'.join('data: '+line for line in value.splitlines())+'\r\n\r\ndata: [DONE]\r\n\r\n').encode()
        self.assertEqual(ai_stream.read_sse(ByteResponse([raw]))['choices'][0]['message']['content'],'x=2')

    def test_missing_done_keeps_usage_but_has_no_usable_final_result(self):
        raw=event(chunk('{"complete":true}','stop'))+event({'choices':[],'usage':{'total_tokens':27}})
        with self.assertRaises(ai_stream.IncompleteResponse) as caught: ai_stream.read_sse(ByteResponse([raw]))
        self.assertEqual(caught.exception.usage,{'total_tokens':27})

    def test_done_without_terminal_finish_is_not_success(self):
        with self.assertRaises(ai_stream.IncompleteResponse):
            ai_stream.read_sse(ByteResponse([event(chunk('{}'))+b'data: [DONE]\n\n']))

    def test_length_finish_remains_length_for_existing_validation(self):
        raw=event(chunk('{}','length'))+b'data: [DONE]\n\n'
        self.assertEqual(ai_stream.read_sse(ByteResponse([raw]))['choices'][0]['finish_reason'],'length')

    def test_connection_timeout_retains_already_received_usage(self):
        raw=event({'choices':[],'usage':{'total_tokens':42}})
        with self.assertRaises(ai_stream.IncompleteResponse) as caught:
            ai_stream.read_sse(ByteResponse([raw,TimeoutError('MUST-NOT-STORE-RAW-ERROR')]))
        self.assertEqual(caught.exception.usage,{'total_tokens':42})
        self.assertNotIn('MUST-NOT',str(caught.exception))

    def test_tool_deltas_are_not_accepted_or_executed(self):
        raw=event(chunk(tool_calls=[{'function':{'name':'read_archive','arguments':'secret'}}]))
        with self.assertRaises(ai_stream.IncompleteResponse): ai_stream.read_sse(ByteResponse([raw]))

    def test_other_choice_is_not_merged_into_first_answer(self):
        value=chunk('other','stop'); value['choices'][0]['index']=1
        with self.assertRaises(ai_stream.IncompleteResponse): ai_stream.read_sse(ByteResponse([event(value),b'data: [DONE]\n\n']))

    def test_malformed_event_is_not_ignored_as_success(self):
        with self.assertRaises(ai_stream.IncompleteResponse):
            ai_stream.read_sse(ByteResponse([b'data: broken-json\n\n'+event(chunk('{}','stop'))+b'data: [DONE]\n\n']))

    def test_content_after_terminal_is_rejected(self):
        raw=event(chunk('{}','stop'))+event(chunk('injected'))+b'data: [DONE]\n\n'
        with self.assertRaises(ai_stream.IncompleteResponse): ai_stream.read_sse(ByteResponse([raw]))

    def test_line_and_total_bytes_are_bounded(self):
        for chunks in [[b':'+b'x'*262145],[b':'+b'x'*200000+b'\n\n']*6]:
            with self.subTest(size=sum(map(len,chunks))):
                with self.assertRaises(ai_stream.IncompleteResponse): ai_stream.read_sse(ByteResponse(chunks))

    def test_final_content_is_bounded(self):
        with self.assertRaises(ai_stream.IncompleteResponse):
            ai_stream.read_sse(ByteResponse([event(chunk('x'*100001,'stop')),b'data: [DONE]\n\n']))

    def test_stream_heartbeats_cannot_extend_total_time_indefinitely(self):
        times=iter([0,0,121,122])
        with self.assertRaises(ai_stream.IncompleteResponse):
            ai_stream.read_sse(ByteResponse([b': heartbeat\n\n']*3),clock=lambda:next(times))

    def test_empty_later_usage_does_not_erase_known_count_on_disconnect(self):
        raw=event({'choices':[],'usage':{'total_tokens':42}})+event({'choices':[],'usage':{}})
        with self.assertRaises(ai_stream.IncompleteResponse) as caught: ai_stream.read_sse(ByteResponse([raw]))
        self.assertEqual(caught.exception.usage,{'total_tokens':42})

    def test_done_keeps_known_usage_when_later_fields_are_empty_or_invalid(self):
        raw=event({'choices':[],'usage':{'total_tokens':42,'prompt_tokens':30}})+event(chunk('{}','stop'))+event({'choices':[],'usage':{'total_tokens':True,'prompt_tokens':-1,'completion_tokens':12}})+b'data: [DONE]\n\n'
        result=ai_stream.read_sse(ByteResponse([raw]))
        self.assertEqual(result['usage'],{'total_tokens':42,'prompt_tokens':30,'completion_tokens':12})
