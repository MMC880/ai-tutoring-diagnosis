"""Synthetic environment probes only. Never opens the 1.0 business database."""
import hashlib
import io
import json
import os
import sqlite3
import warnings
from pathlib import Path

from fastapi import FastAPI, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.trustedhost import TrustedHostMiddleware
from pydantic import BaseModel, Field
from fastapi.responses import StreamingResponse
from PIL import Image, UnidentifiedImageError
from skills_ref import read_properties, validate

ROOT = Path(__file__).resolve().parents[1]
SKILL = ROOT / 'skills' / 'math-error-review'
Image.MAX_IMAGE_PIXELS = 30_000_000


class ChatInput(BaseModel):
    text: str = Field(min_length=1, max_length=8000)
    image_count: int = Field(default=0, ge=0, le=3)


def create_app(db_path: Path | None = None):
    app = FastAPI(title='晋学智辅2.0环境探针', docs_url=None, redoc_url=None)
    app.add_middleware(TrustedHostMiddleware, allowed_hosts=['127.0.0.1', 'localhost', 'testserver'])
    app.add_middleware(CORSMiddleware, allow_origins=['http://127.0.0.1:5179'],
                       allow_methods=['GET', 'POST'], allow_headers=['content-type'])
    database = db_path or ROOT / '.qa-temp' / 'environment.sqlite3'

    @app.get('/health')
    def health():
        return {'status': 'ok', 'mode': 'synthetic-only', 'sqlite_version': sqlite3.sqlite_version}

    @app.post('/api/sqlite-probe')
    def sqlite_probe():
        database.parent.mkdir(parents=True, exist_ok=True)
        with sqlite3.connect(database) as db:
            db.execute('CREATE TABLE IF NOT EXISTS environment_probe(id INTEGER PRIMARY KEY, value TEXT NOT NULL)')
            db.execute('INSERT INTO environment_probe(value) VALUES (?)', ('中文读写验证',))
            value = db.execute('SELECT value FROM environment_probe ORDER BY id DESC LIMIT 1').fetchone()[0]
        return {'value': value}

    @app.get('/api/skill')
    def read_skill():
        errors = validate(SKILL)
        if errors:
            raise HTTPException(500, detail=errors)
        properties = read_properties(SKILL)
        body = (SKILL / 'SKILL.md').read_text(encoding='utf-8').split('---', 2)[2].strip()
        return {'name': properties.name, 'display_name': properties.metadata['display-name'],
                'description': properties.description, 'instructions': body}

    @app.post('/api/chat')
    def chat(payload: ChatInput):
        return {'text': f'本地模拟回复：已接收“{payload.text}”，图片数量 {payload.image_count}。仅验证通信，未进行判题或调用外部模型。'}

    @app.post('/api/copilot-agent')
    async def copilot_agent(payload: dict):
        # AG-UI synthetic server: exercises CopilotKit's actual frontend tool dispatch.
        thread, run = payload.get('threadId', ''), payload.get('runId', '')
        messages = payload.get('messages', [])
        completed = any(m.get('role') == 'tool' for m in messages)
        events = [{'type': 'RUN_STARTED', 'threadId': thread, 'runId': run}]
        if not completed:
            events += [
                {'type': 'TOOL_CALL_START', 'toolCallId': 'environment-tool-1', 'toolCallName': 'updateDemoStatus', 'parentMessageId': 'environment-message'},
                {'type': 'TOOL_CALL_ARGS', 'toolCallId': 'environment-tool-1', 'delta': '{}'},
                {'type': 'TOOL_CALL_END', 'toolCallId': 'environment-tool-1'},
            ]
        else:
            events += [
                {'type': 'TEXT_MESSAGE_START', 'messageId': 'environment-finished', 'role': 'assistant'},
                {'type': 'TEXT_MESSAGE_CONTENT', 'messageId': 'environment-finished', 'delta': '本地模拟Agent完成工具调用；没有修改学生资料。'},
                {'type': 'TEXT_MESSAGE_END', 'messageId': 'environment-finished'},
            ]
        events.append({'type': 'RUN_FINISHED', 'threadId': thread, 'runId': run})
        async def stream():
            for event in events:
                yield 'data: ' + json.dumps(event, ensure_ascii=False) + '\n\n'
        return StreamingResponse(stream(), media_type='text/event-stream')

    @app.post('/api/images')
    async def image(file: UploadFile):
        raw = await file.read(2 * 1024 * 1024 + 1)
        await file.close()
        if len(raw) > 2 * 1024 * 1024:
            raise HTTPException(413, '环境测试图片不能超过2MB')
        try:
            with warnings.catch_warnings():
                warnings.simplefilter('error', Image.DecompressionBombWarning)
                with Image.open(io.BytesIO(raw)) as pic:
                    if pic.format not in {'PNG', 'JPEG', 'WEBP', 'MPO'}:
                        raise ValueError('不支持的图片编码')
                    pic.seek(0)
                    pic.load()
                    width, height, fmt = pic.width, pic.height, pic.format
        except (UnidentifiedImageError, ValueError, OSError, Image.DecompressionBombError, Image.DecompressionBombWarning):
            raise HTTPException(422, '无法解码图片，请提供清晰的PNG/JPEG/WebP主图')
        return {'format': fmt, 'width': width, 'height': height, 'sha256': hashlib.sha256(raw).hexdigest(), 'stored': False}

    return app


app = create_app()
