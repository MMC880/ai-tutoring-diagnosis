"""Loopback-only, single-user trial. Not a public hosting server."""
import argparse
import base64
import binascii
import hmac
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import mimetypes
from pathlib import Path
import re
import secrets
import sys
from urllib.parse import urlsplit, parse_qs, quote
from files import save_document, get_document
from store import Store, ValidationError, ConflictError
from exporting import export_content, word_bytes, print_html
from ai_service import AIService
import vision
import teaching
import pilot

HERE = Path(__file__).resolve().parent
MAX_REQUEST = 22 * 1024 * 1024


class Handler(BaseHTTPRequestHandler):
    server_version = 'JinxueLocal/0.1'

    def log_message(self, fmt, *args):
        # Avoid student contents and query details in access logs.
        pass

    @property
    def store(self): return self.server.store

    def send(self, status, data, mime='application/json; charset=utf-8', filename=None):
        if isinstance(data, (dict, list)):
            data = json.dumps(data, ensure_ascii=False).encode('utf-8')
        elif isinstance(data, str): data = data.encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', mime); self.send_header('Content-Length', str(len(data)))
        self.send_header('Cache-Control', 'no-store'); self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('Referrer-Policy', 'no-referrer')
        self.send_header('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; frame-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'")
        if filename: self.send_header('Content-Disposition', "attachment; filename*=UTF-8''" + quote(filename))
        self.end_headers(); self.wfile.write(data)

    def guard(self, write=False):
        port = self.server.server_address[1]
        hosts = {f'127.0.0.1:{port}', f'localhost:{port}'}
        if self.headers.get('Host') not in hosts:
            self.send(403, {'error': '仅允许本机入口'}); return False
        origin = self.headers.get('Origin')
        if (origin and origin not in {'http://' + h for h in hosts}) or self.headers.get('Sec-Fetch-Site') == 'cross-site':
            self.send(403, {'error': '拒绝跨站访问'}); return False
        if write:
            if not hmac.compare_digest(self.headers.get('X-Jinxue-Token', ''), self.server.token):
                self.send(403, {'error': '本地会话令牌无效，请刷新页面'}); return False
            if self.headers.get_content_type() != 'application/json':
                self.send(415, {'error': '写入只接受 JSON'}); return False
        return True

    def do_GET(self): self.dispatch(False)
    def do_POST(self): self.dispatch(True)
    def do_OPTIONS(self): self.send(405, {'error': '不支持跨站调用'})

    def dispatch(self, write):
        if not self.guard(write): return
        try:
            url = urlsplit(self.path); route = url.path; query = parse_qs(url.query)
            payload = {}
            if write:
                length = int(self.headers.get('Content-Length', '0'))
                if length <= 0 or length > MAX_REQUEST:
                    self.send(413, {'error': '请求体为空或超过上限'}); return
                payload = json.loads(self.rfile.read(length))
                if not isinstance(payload, dict): raise ValidationError('请求须为对象')
            result = self.post(route, payload) if write else self.get(route, query)
            if result is not None: self.send(200, result)
        except ConflictError as e: self.send(409, {'error': str(e)})
        except (ValidationError, ValueError, TypeError, KeyError, binascii.Error) as e: self.send(400, {'error': str(e)[:250]})
        except (BrokenPipeError, ConnectionResetError): pass
        except Exception as e:
            print('本地请求失败：' + type(e).__name__, file=sys.stderr)
            self.send(500, {'error': '本地处理失败，未确认成功；请保留材料并重试或查看运行窗口'})

    def get(self, route, query):
        if route == '/api/launch-info': return dict(application_directory=str(HERE.resolve()),data_directory=str(self.store.root))
        if route == '/api/health': return dict(status='ok', mode='LOCAL_STORE_EXPLICIT_AI', version='0.26.0')
        if route == '/api/bootstrap': return self.store.bootstrap() | {'csrf_token': self.server.token}
        if route == '/api/intake':
            from intake import intake_overview
            return intake_overview(self.store)
        if route == '/api/practice-queue':
            from practice_queue import practice_queue_overview
            return practice_queue_overview(self.store)
        if route == '/api/backups': return self.store.backups()
        if route == '/api/ai/settings': return self.server.ai.settings()
        if route == '/api/ai/jobs': return self.server.ai.jobs()
        if route == '/api/summary': return self.store.summary(query.get('batch', [''])[0])
        if route == '/api/pilot/runs':return pilot.Pilot(self.store).list()
        m=re.fullmatch(r'/api/pilot/runs/([a-f0-9]{32})(?:/versions/([1-9][0-9]{0,5}))?',route)
        if m:return pilot.Pilot(self.store).get(m[1],int(m[2]) if m[2] else None)
        if route == '/api/teaching/materials': return teaching.Library(self.store).list()
        if route == '/api/teaching/catalog': return teaching.Library(self.store).catalog()
        m=re.fullmatch(r'/api/teaching/materials/([a-f0-9]{32})(?:/versions/([1-9][0-9]{0,5}))?',route)
        if m:return teaching.Library(self.store).get(m[1],int(m[2]) if m[2] else None)
        m = re.fullmatch(r'/api/papers/([a-f0-9]{32})', route)
        if m: return self.store.get_paper(m[1])
        m=re.fullmatch(r'/api/papers/([a-f0-9]{32})/teaching-links',route)
        if m:return teaching.Library(self.store).paper_links(m[1])
        m = re.fullmatch(r'/api/papers/([a-f0-9]{32})/photo-progress',route)
        if m:
            from photo_progress import photo_progress
            return photo_progress(self.store,m[1])
        m = re.fullmatch(r'/api/papers/([a-f0-9]{32})/image/([a-f0-9]{32})',route)
        if m:
            paper=self.store.get_paper(m[1])
            if not any(d['id']==m[2] and d.get('role','作业')=='作业' for d in paper['documents']):
                raise ValidationError('此图片不是当前学生本卷的作业附件')
            self.send(200,vision.preview_document(self.store.root,m[2]),'image/png'); return
        m = re.fullmatch(r'/api/profiles/([a-f0-9]{32})/report', route)
        if m:
            from profile_report import build_profile_report
            return build_profile_report(self.store, m[1])
        m = re.fullmatch(r'/(api/export|print)/profile/([a-f0-9]{32})(\.docx)?', route)
        if m:
            from profile_report import report_content
            title, blocks = report_content(self.store, m[2], query.get('fingerprint', [''])[0], query.get('audience', ['teacher'])[0])
            if m[1] == 'api/export' and m[3]:
                self.send(200, word_bytes(title, blocks), 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', title + '.docx')
            elif m[1] == 'print' and not m[3]: self.send(200, print_html(title, blocks), 'text/html; charset=utf-8')
            else: self.send(404, {'error': '路径不存在'})
            return
        m = re.fullmatch(r'/api/profiles/([a-f0-9]{32})', route)
        if m: return self.store.profile(m[1])
        m = re.fullmatch(r'/api/profiles/([a-f0-9]{32})/evidence/([1-9][0-9]{0,18})', route)
        if m: return self.store.student_evidence(m[1],int(m[2]))
        m = re.fullmatch(r'/api/exercises/([a-f0-9]{32})/versions',route)
        if m: return self.store.exercise_versions(m[1])
        m = re.fullmatch(r'/api/ai/jobs/([a-f0-9]{32})',route)
        if m: return self.server.ai.get_job(m[1])
        m = re.fullmatch(r'/api/files/([a-f0-9]{32})', route)
        if m:
            meta, p = get_document(self.store.root, m[1])
            self.send(200, p.read_bytes(), meta['mime'], meta['filename'] if p.suffix == '.docx' else None); return
        m = re.fullmatch(r'/api/backups/(backup-[A-Za-z0-9-]+\.zip)', route)
        if m:
            p = self.store.backup_path(m[1]); self.send(200, p.read_bytes(), 'application/zip', p.name); return
        m = re.fullmatch(r'/(api/export|print)/(paper|exercise)/([a-f0-9]{32})(\.docx)?', route)
        if m:
            version = int(query.get('version', ['0'])[0])
            title, blocks = export_content(self.store, m[2], m[3], query.get('audience', ['teacher'])[0], version)
            if m[1] == 'api/export' and m[4]:
                self.send(200, word_bytes(title, blocks), 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', title + '.docx')
            elif m[1] == 'print' and not m[4]: self.send(200, print_html(title, blocks), 'text/html; charset=utf-8')
            else: self.send(404, {'error': '路径不存在'})
            return
        allowed = {'/': 'index.html', '/app.js': 'app.js', '/registration-panel.js':'registration-panel.js', '/workspace-navigation.js':'workspace-navigation.js', '/ai-panel.js':'ai-panel.js', '/vision-panel.js':'vision-panel.js','/learning-panel.js':'learning-panel.js','/tutoring-panel.js':'tutoring-panel.js','/photo-panel.js':'photo-panel.js','/continuation-panel.js':'continuation-panel.js','/grading-panel.js':'grading-panel.js','/archive-panel.js':'archive-panel.js','/report-panel.js':'report-panel.js','/date-panel.js':'date-panel.js','/question-navigation.js':'question-navigation.js','/pilot-panel.js':'pilot-panel.js','/intake-panel.js':'intake-panel.js','/materials-panel.js':'materials-panel.js','/review-flow.js':'review-flow.js','/class-panel.js':'class-panel.js','/followup-panel.js':'followup-panel.js','/queue-panel.js':'queue-panel.js','/teaching-panel.js':'teaching-panel.js','/teaching-catalog.js':'teaching-catalog.js', '/styles.css': 'styles.css', '/print.js': 'print.js', '/assets/synthetic-homework.png': 'assets/synthetic-homework.png'}
        if route in allowed:
            p = HERE / 'web' / allowed[route]
            if p.is_file():
                self.send(200, p.read_bytes(), (mimetypes.guess_type(p.name)[0] or 'application/octet-stream') + ('; charset=utf-8' if p.suffix in ('.html', '.js', '.css') else '')); return
        self.send(404, {'error': '路径不存在'})

    def post(self, route, p):
        m=re.fullmatch(r'/api/papers/([a-f0-9]{32})/assignment-date',route)
        if m:
            import assignment_dates
            return assignment_dates.update(self.store,m[1],p)
        m=re.fullmatch(r'/api/papers/([a-f0-9]{32})/documents',route)
        if m:
            from paper_materials import update_documents
            return update_documents(self.store,m[1],p)
        if route == '/api/pilot/runs':return pilot.Pilot(self.store).create(p)
        m=re.fullmatch(r'/api/pilot/runs/([a-f0-9]{32})',route)
        if m:return pilot.Pilot(self.store).save(m[1],p.get('version'),p)
        if route == '/api/teaching/materials':return teaching.Library(self.store).create(p)
        m=re.fullmatch(r'/api/teaching/materials/([a-f0-9]{32})(/approve)?',route)
        if m:
            library=teaching.Library(self.store)
            return library.approve(m[1],p.get('version'),p.get('consent')) if m[2] else library.save(m[1],p.get('version'),p)
        if route == '/api/papers': return self.store.create_paper(p)
        if route == '/api/documents':
            encoded = p.get('data', '')
            if not isinstance(encoded, str): raise ValidationError('附件内容须为 base64')
            with self.store.lock:
                return save_document(self.store.root, p.get('filename'), base64.b64decode(encoded, validate=True))
        if route == '/api/exercises': return self.store.create_exercise(p)
        if route == '/api/retests': return self.store.record_retest(p)
        if route == '/api/backups': return self.store.backup()
        if route == '/api/restore':
            with self.server.ai.lock:
                result=self.store.restore(p.get('id'),p.get('confirmation'))
                self.server.ai.reset_after_restore()
                return result
        if route == '/api/ai/settings': return self.server.ai.configure(p)
        if route == '/api/ai/clear-key': return self.server.ai.clear_key()
        if route == '/api/ai/prepare': return self.server.ai.prepare(p)
        m = re.fullmatch(r'/api/ai/jobs/([a-f0-9]{32})/practice',route)
        if m: return self.server.ai.apply_tutoring(m[1],p.get('level'),p.get('consent'))
        m = re.fullmatch(r'/api/ai/jobs/([a-f0-9]{32})/manual-transcription',route)
        if m: return self.server.ai.apply_manual_transcription(m[1],p.get('questions'),p.get('consent'),p.get('transcription_ack',False))
        m = re.fullmatch(r'/api/ai/jobs/([a-f0-9]{32})/(send|apply)',route)
        if m:
            return self.server.ai.send(m[1],p.get('consent')) if m[2]=='send' else self.server.ai.apply(m[1],p.get('consent'),questions=p.get('questions'),transcription_ack=p.get('transcription_ack',False))
        if route == '/api/seed':
            from seed import seed_paper
            return seed_paper(self.store)
        m = re.fullmatch(r'/api/papers/([a-f0-9]{32})/(draft|confirm)', route)
        if m:
            return self.store.save_paper(m[1], p) if m[2] == 'draft' else self.store.confirm(m[1], p.get('version'), p.get('consent'))
        m = re.fullmatch(r'/api/exercises/([a-f0-9]{32})/(update|approve)', route)
        if m:
            return self.store.update_exercise(m[1], p) if m[2] == 'update' else self.store.approve_exercise(m[1], p.get('version'), p.get('consent'))
        self.send(404, {'error': '路径不存在'})


def make_server(store, port=8765):
    server = ThreadingHTTPServer(('127.0.0.1', port), Handler)
    server.daemon_threads = True
    server.store, server.token = store, secrets.token_hex(32)
    server.ai = AIService(store)
    return server


def main():
    parser = argparse.ArgumentParser(description='晋学智辅本地单用户试用版（AI需本机设置与逐次授权）')
    parser.add_argument('--data-dir', default=str(HERE / '.local-data'))
    parser.add_argument('--port', type=int, default=8765)
    parser.add_argument('--open', action='store_true')
    args = parser.parse_args()
    store = Store(args.data_dir)
    # One process owns a data directory; cross-process optimistic updates alone are insufficient.
    lock_file = (store.root / 'server.lock').open('a+b')
    lock_file.seek(0); lock_file.write(b'0'); lock_file.flush(); lock_file.seek(0)
    try:
        if sys.platform == 'win32':
            import msvcrt
            msvcrt.locking(lock_file.fileno(), msvcrt.LK_NBLCK, 1)
        else:
            import fcntl
            fcntl.flock(lock_file.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
    except OSError:
        parser.exit(1, '这个资料目录已有本地服务运行，请打开原入口。\n')
    try:
        server = make_server(store, args.port)
        address = 'http://127.0.0.1:' + str(server.server_address[1])
        (store.root / 'server.json').write_text(json.dumps(dict(url=address, mode='LOCAL_STORE_EXPLICIT_AI')), encoding='utf-8')
        print('晋学智辅：' + address + '\n数据目录：' + str(store.root) + '\n仅本机单用户；AI须本机输入密钥并逐次授权。按 Ctrl+C 停止。', flush=True)
        if args.open:
            import webbrowser
            webbrowser.open(address)
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        if 'server' in locals(): server.server_close()
        lock_file.close()


if __name__ == '__main__': main()
