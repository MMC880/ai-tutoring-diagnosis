"""Read-only, request-scoped bridge to existing assignments and knowledge links."""
import hashlib
import json
import re
from datetime import datetime, timezone

from pydantic import BaseModel, ConfigDict, Field

from backend.intake import analysis_image


class Arguments(BaseModel):
    model_config = ConfigDict(extra='forbid', strict=True)


class Search(Arguments):
    query: str = Field(default='', max_length=100)
    offset: int = Field(default=0, ge=0, le=10000)


class Read(Arguments):
    assignment_id: str = Field(min_length=1, max_length=100)
    number: str | None = Field(default=None, pattern=r'^\d{1,3}(?:[.（(]\d{1,2}[）)]?)?$')


class ReadImage(Arguments):
    assignment_id: str = Field(min_length=1, max_length=100)
    sha256: str = Field(pattern='^[a-f0-9]{64}$')


class AgentHistory:
    NAMES = {'search_student_history', 'read_assignment', 'read_assignment_image'}

    def __init__(self, learning, payload):
        self.learning, self.payload = learning, payload
        self.sources = []
        self.image_count = len(payload.images)
        self.student = learning.archive.student(payload.student_id) if payload.student_id else None
        self.names = [self.student.get(k, '') for k in ('name', 'class_name')] if self.student else []
        if payload.assignment_id:
            self.assignment(payload.assignment_id)  # Validate context BEFORE any external request.

    def assignment(self, ident):
        if not self.student:
            raise ValueError('未选择学生')
        with self.learning.connect() as db:
            return self.learning.assignment(db, ident, self.payload.student_id, self.payload.subject)

    def tools(self):
        definitions = []
        if self.student and self.payload.allow_history:
            definitions.extend([
                ('search_student_history', '仅搜索当前授权学生当前学科的作业、错题和知识点摘要；每页最多10份，不读取照片。', Search),
                ('read_assignment', '读取指定作业的当前有效错题、知识点证据与材料索引；number可只读一道题。不等于识别了原图。', Read),
            ])
        if self.student and self.payload.allow_originals:
            definitions.append(('read_assignment_image', '按作业编号与SHA-256读取一张授权原图的分析副本；总计最多3张。PDF/损坏文件明确返回未识别。', ReadImage))
        return [{'type': 'function', 'function': {'name': n, 'description': d, 'parameters': a.model_json_schema()}}
                for n, d, a in definitions]

    def clean(self, value):
        if isinstance(value, str):
            for name in self.names:
                if name:
                    value = value.replace(name, '学生A' if name == self.student['name'] else '当前班级')
            return value
        if isinstance(value, list):
            return [self.clean(v) for v in value]
        if isinstance(value, dict):
            return {k: self.clean(v) for k, v in value.items()}
        return value

    def snapshot(self, record, links, number=None, brief=False):
        active = set(record['questions'] + record['candidate_questions'])
        selected = [l for l in links if l['assignment_id'] == record['assignment_id'] and (number is None or l['number'] == number)]
        result = {'assignment_id': record['assignment_id'], 'assignment_date': record['assignment_date'],
                  'correction_revision': record.get('correction_revision', 0),
                  'questions': [q for q in record['questions'] if number is None or q == number],
                  'question_source': '教师明确提供',
                  'candidate_questions': [q for q in record['candidate_questions'] if number is None or q == number],
                  'candidate_source': 'AI或手工候选／待教师确认',
                  'knowledge_links': [{k: l[k] for k in ('number', 'tag', 'status', 'revision', 'source', 'evidence_hash', 'page')}
                                      | {'quote': l['quote'][:400 if brief else 2000], 'question_current': l['number'] in active}
                                      for l in selected[:20]],
                  'knowledge_links_total': len(selected), 'knowledge_links_truncated': len(selected) > 20,
                  'materials': [{'sha256': f['sha256'], 'pages': f['pages'], 'warning': f.get('warning', '')}
                                for f in record['files']],
                  'pending': record.get('pending', [])[:10],
                  'notice': '仅结构化记录；未识别原图。已确认知识点不等于已核实错因；撤销题号的旧关联仅为历史。'}
        if number is not None and number not in active and not selected:
            result['notice'] += ' 该题尚无已登记的错题或知识点，不能凭记录补造作答。'
        return self.clean(result)

    def remember(self, tool, result):
        source = {'tool': tool, 'read_at': datetime.now(timezone.utc).isoformat(), **result}
        source['result_sha256'] = hashlib.sha256(json.dumps(result, ensure_ascii=False, sort_keys=True).encode()).hexdigest()
        self.sources.append(source)

    def execute(self, name, args):
        advertised = {t['function']['name'] for t in self.tools()}
        if name not in advertised:
            raise ValueError('未授权')
        if name == 'search_student_history':
            item = Search.model_validate(args)
            workspace = self.learning.workspace(self.payload.student_id, self.payload.subject)
            records = [self.snapshot(a, workspace['links'], brief=True) for a in workspace['assignments']]
            terms = [t for t in re.split(r'\s+', item.query.strip()) if t]
            matches = [r for r in records if all(t.casefold() in json.dumps(r, ensure_ascii=False).casefold() for t in terms)]
            result = {'status': 'READ', 'records': matches[item.offset:item.offset + 10], 'matched': len(matches),
                      'next_offset': item.offset + 10 if len(matches) > item.offset + 10 else None,
                      'legacy_unreadable': len(workspace['legacy_unreadable']),
                      'notice': '只读结构化索引，非语义检索；无命中不代表从未出现。未续接旧记录未搜索，未读任何历史照片。'}
            self.remember(name, result)
            return result, None
        if name == 'read_assignment':
            item = Read.model_validate(args)
            record = self.assignment(item.assignment_id)
            workspace = self.learning.workspace(self.payload.student_id, self.payload.subject)
            result = {'status': 'READ', 'record': self.snapshot(record, workspace['links'], item.number)}
            self.remember(name, result)
            return result, None
        item = ReadImage.model_validate(args)
        if not self.payload.allow_history and item.assignment_id != self.payload.assignment_id:
            raise ValueError('未授权历史')
        self.assignment(item.assignment_id)  # original() itself is not scoped; always validate first.
        if self.image_count >= 3:
            raise ValueError('图片读取额度已用完')
        try:
            raw, _ = self.learning.original(item.assignment_id, item.sha256)
            image = analysis_image(raw)
        except (ValueError, OSError):
            result = {'status': 'UNREADABLE', 'assignment_id': item.assignment_id, 'sha256': item.sha256,
                      'notice': '原图未识别：文件缺失、校验失败、损坏或不支持的格式（PDF未渲染）。不能据此断言学生作答。'}
            self.remember(name, result)
            return result, None
        self.image_count += 1
        result = {'status': 'READ_IMAGE', 'assignment_id': item.assignment_id, 'sha256': item.sha256,
                  'width': image['width'], 'height': image['height'], 'warning': image['warning'],
                  'notice': '原图分析副本已生成，随下一次模型请求提供；传输失败时不能声称模型已看到。未读取其他页，文字识别及红笔归属须核对。'}
        self.remember(name, result)
        return result, image['image']

    def provenance(self):
        return ('\n\n## 实际读取来源（软件生成）\n\n以下为实际工具回执，不是AI对材料真实性或识别正确性的认证。'
                'READ为结构化记录，READ_IMAGE为原图分析副本，UNREADABLE为未识别，REJECTED为未获读取。\n\n```json\n'
                + json.dumps(self.sources, ensure_ascii=False, indent=2) + '\n```\n')
