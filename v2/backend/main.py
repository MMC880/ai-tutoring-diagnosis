"""Local v2 archive and provider adapter. Never opens the 1.0 business database."""
import hashlib
import io
import json
import sqlite3
import warnings
from pathlib import Path

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.exceptions import RequestValidationError
from starlette.middleware.trustedhost import TrustedHostMiddleware
from pydantic import BaseModel, Field
from fastapi.responses import JSONResponse, StreamingResponse
from PIL import Image, UnidentifiedImageError
from skills_ref import read_properties, validate

from backend.archive import ArchiveStore, SUBJECTS
from backend.provider import ProviderConfig, ProviderError, ProviderService
from backend.intake import IntakeService, RequestConflict, inspect_file, analysis_image
from backend.learning import LearningService, LinkInput

ROOT = Path(__file__).resolve().parents[1]
SKILL = ROOT / 'skills' / 'math-error-review'
Image.MAX_IMAGE_PIXELS = 30_000_000


class HistoryTurn(BaseModel):
    role: str = Field(pattern='^(user|assistant)$')
    text: str = Field(max_length=8000)


class ChatInput(BaseModel):
    text: str = Field(min_length=1, max_length=8000)
    image_count: int = Field(default=0, ge=0, le=3)
    imported_summary: str = Field(default='', max_length=20000)
    images: list[str] = Field(default_factory=list, max_length=3)
    history: list[HistoryTurn] = Field(default_factory=list, max_length=10)
    student_id: str | None = Field(default=None, max_length=80)
    subject: str = Field(default='math', pattern='^(math|english|physics|chemistry)$')
    allow_save: bool = False


class StudentInput(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    confirm_new: bool = False
    class_name: str = Field(default='', max_length=80)


class ResolveInput(BaseModel):
    flow_id: str = Field(min_length=1, max_length=100)
    student_id: str | None = Field(default=None, max_length=80)
    confirm_create: bool = False
    instruction: str | None = Field(default=None, max_length=8000)


class QueryInput(BaseModel):
    text: str = Field(min_length=1, max_length=8000)
    student_id: str | None = Field(default=None, max_length=80)
    subject: str = Field(default='math', pattern='^(math|english|physics|chemistry)$')


def create_app(db_path: Path | None = None, archive_root: Path | None = None, provider_transport=None):
    app = FastAPI(title='晋学智辅2.0', docs_url=None, redoc_url=None)
    app.add_middleware(TrustedHostMiddleware, allowed_hosts=['127.0.0.1', 'localhost', 'testserver'])
    app.add_middleware(CORSMiddleware, allow_origins=['http://127.0.0.1:5179'],
                       allow_methods=['GET', 'POST'], allow_headers=['content-type'])
    database = db_path or ROOT / '.qa-temp' / 'environment.sqlite3'
    archive = ArchiveStore(archive_root or ROOT / '.local-data' / 'v2-archive')
    intake = IntakeService(archive)
    learning = LearningService(intake)
    provider = ProviderService(archive, SKILL / 'SKILL.md', provider_transport)

    @app.exception_handler(RequestValidationError)
    async def invalid_request(request, error):
        # Pydantic's default error includes submitted values, including credentials.
        return JSONResponse(status_code=422, content={'detail': '请求参数无效，请检查填写内容和附件限制'})

    @app.get('/health')
    def health():
        return {
            'status': 'ok',
            'mode': provider.settings()['mode'],
            'sqlite_version': sqlite3.sqlite_version,
            'archive_ready': True,
        }

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
        try:
            result = provider.chat(payload)
            if result is not None:
                return result
        except ValueError as error:
            raise HTTPException(422, str(error)) from None
        except KeyError:
            raise HTTPException(404, '当前学生不存在，请重新选择') from None
        except ProviderError as error:
            raise HTTPException(502, str(error)) from None
        imported = '已导入该生该科最新摘要，未附带全部原件。' if payload.imported_summary.strip() else '本次未导入历史摘要。'
        return {
            'mode': 'simulation',
            'text': (
                f'本地模拟回复：已接收“{payload.text}”，图片数量 {payload.image_count}。'
                f'{imported}仅验证通信，未进行判题或调用外部模型。'
            )
        }

    @app.get('/api/provider')
    def provider_settings():
        return provider.settings()

    @app.post('/api/provider')
    def configure_provider(payload: ProviderConfig):
        try:
            return provider.configure(payload)
        except ValueError as error:
            raise HTTPException(422, str(error)) from None

    @app.post('/api/provider/clear')
    def clear_provider():
        return provider.clear()

    @app.post('/api/provider/test')
    def test_provider():
        try:
            return provider.test()
        except ValueError as error:
            raise HTTPException(422, str(error)) from None
        except ProviderError as error:
            raise HTTPException(502, str(error)) from None

    @app.get('/api/students/{student_id}/subjects/{subject}/agent-notes')
    def agent_notes(student_id: str, subject: str):
        try:
            return {'notes': provider.notes(student_id, subject)}
        except KeyError:
            raise HTTPException(404, '找不到该学生或学科') from None

    @app.get('/api/subjects')
    def subjects():
        return {'subjects': archive.list_subjects()}

    @app.get('/api/students')
    def students():
        return {'students': archive.list_students()}

    @app.post('/api/students')
    def upsert_student(payload: StudentInput):
        try:
            return archive.resolve_student(payload.name, confirm_new=payload.confirm_new, class_name=payload.class_name)
        except ValueError as error:
            raise HTTPException(422, str(error)) from error

    @app.get('/api/students/{student_id}/subjects/{subject}/latest')
    def latest_summary(student_id: str, subject: str):
        try:
            archive.student(student_id)
            if subject not in SUBJECTS:
                raise KeyError('学科无效')
            current = intake.latest(student_id, subject)
            legacy = archive.latest(student_id, subject)
            if current and current['uploaded_at'] >= (legacy.get('updated_at') or ''):
                return {'exists': True, 'markdown': intake.markdown(current),
                        'updated_at': current['uploaded_at'], 'assignment_id': current['assignment_id'],
                        'files': current['files'], 'questions': current['questions']}
            return legacy
        except KeyError as error:
            raise HTTPException(404, str(error)) from error

    def intake_error(error):
        if isinstance(error, RequestConflict):
            return HTTPException(409, str(error))
        if isinstance(error, KeyError):
            return HTTPException(404, '找不到该学生或暂存流程')
        if isinstance(error, ValueError):
            return HTTPException(422, str(error))
        return HTTPException(503, '本地保存或回读失败，未确认归档成功。可重试同一请求；原件可能已经暂存，不要改动原件目录。')

    @app.post('/api/intake/inspect')
    async def inspect_material(file: UploadFile):
        try:
            raw = await file.read(15 * 1024 * 1024 + 1)
            return inspect_file(file.filename or 'unnamed', raw)
        except ValueError as error:
            raise HTTPException(422, str(error)) from None
        finally:
            await file.close()

    @app.post('/api/intake/analysis-image')
    async def model_image(file: UploadFile):
        try:
            return analysis_image(await file.read(15 * 1024 * 1024 + 1))
        except ValueError as error:
            raise HTTPException(422, str(error)) from None
        finally:
            await file.close()

    @app.post('/api/intake')
    async def intake_assignment(request_id: str = Form(), instruction: str = Form(),
                                student_id: str = Form(default=''), subject: str = Form(default='math'),
                                files: list[UploadFile] = File(default=[])):
        try:
            if len(files) > 12:
                raise ValueError('一次最多12份材料')
            payloads = [(upload.filename or 'unnamed', await upload.read(15 * 1024 * 1024 + 1)) for upload in files]
            return intake.submit(request_id, instruction, payloads, student_id or None, subject)
        except (ValueError, KeyError, OSError, sqlite3.Error) as error:
            raise intake_error(error) from None
        finally:
            for upload in files:
                await upload.close()

    @app.post('/api/intake/resolve')
    def resolve_intake(payload: ResolveInput):
        try:
            return intake.resolve(payload.flow_id, payload.student_id, payload.confirm_create, payload.instruction)
        except (ValueError, KeyError, OSError, sqlite3.Error) as error:
            raise intake_error(error) from None

    @app.post('/api/intake/query')
    def query_history(payload: QueryInput):
        try:
            return intake.history(payload.text, payload.student_id, payload.subject)
        except (ValueError, KeyError, OSError, sqlite3.Error) as error:
            raise intake_error(error) from None

    @app.get('/api/learning/workspace')
    def learning_workspace(student_id: str, subject: str):
        try:
            return learning.workspace(student_id, subject)
        except (ValueError, KeyError, OSError, sqlite3.Error) as error:
            raise intake_error(error) from None

    @app.post('/api/learning/link')
    def link_knowledge(payload: LinkInput):
        try:
            return learning.link(payload)
        except (ValueError, KeyError, OSError, sqlite3.Error) as error:
            raise intake_error(error) from None

    @app.get('/api/learning/original/{assignment_id}/{digest}')
    def learning_original(assignment_id: str, digest: str):
        from fastapi.responses import Response
        try:
            raw, item = learning.original(assignment_id, digest)
            return Response(raw, media_type='application/octet-stream', headers={
                'Content-Disposition': "attachment; filename=original" + ('.pdf' if item['original_name'].lower().endswith('.pdf') else '.jpg'),
                'X-Content-Type-Options': 'nosniff'})
        except (ValueError, KeyError, OSError, sqlite3.Error) as error:
            raise intake_error(error) from None

    @app.post('/api/students/{student_id}/subjects/{subject}/assignments')
    async def save_assignment(
        student_id: str,
        subject: str,
        teacher_note: str = Form(default=''),
        assignment_date: str = Form(default=''),
        files: list[UploadFile] = File(default=[]),
    ):
        if subject not in SUBJECTS:
            raise HTTPException(404, '学科必须是数学、英语、物理或化学')
        payloads: list[tuple[str, bytes]] = []
        try:
            for upload in files:
                data = await upload.read(15 * 1024 * 1024 + 1)
                await upload.close()
                payloads.append((upload.filename or '未命名文件', data))
            return archive.save_task(student_id, subject, payloads, teacher_note, assignment_date or None)
        except (KeyError, ValueError) as error:
            status = 404 if isinstance(error, KeyError) else 422
            raise HTTPException(status, str(error)) from error

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
