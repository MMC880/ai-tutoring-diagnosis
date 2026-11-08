"""THROWAWAY UI preview: three fixed assets; no app server or Store.
Run: python app/preview_teacher_ui.py
Alternatively double-click app/web/index.html.
"""
import argparse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit

WEB = Path(__file__).resolve().parent / 'web'
ASSETS = {
    '/': ('index.html', 'text/html; charset=utf-8'),
    '/index.html': ('index.html', 'text/html; charset=utf-8'),
    '/teacher-prototype.js': ('teacher-prototype.js', 'text/javascript; charset=utf-8'),
    '/teacher-prototype.css': ('teacher-prototype.css', 'text/css; charset=utf-8'),
}


class Preview(BaseHTTPRequestHandler):
    def do_GET(self):
        asset = ASSETS.get(urlsplit(self.path).path)
        if not asset:
            self.send_error(404, 'Prototype assets only')
            return
        filename, mime = asset
        content = (WEB / filename).read_bytes()
        self.send_response(200)
        self.send_header('Content-Type', mime)
        self.send_header('Content-Length', str(len(content)))
        self.send_header('Cache-Control', 'no-store')
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.end_headers()
        self.wfile.write(content)

    def log_message(self, *_):
        pass


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--port', type=int, default=8766)
    args = parser.parse_args()
    try:
        server = ThreadingHTTPServer(('127.0.0.1', args.port), Preview)
    except OSError:
        server = ThreadingHTTPServer(('127.0.0.1', 0), Preview)
    print(f'PROTOTYPE_URL=http://127.0.0.1:{server.server_address[1]}/?variant=A#profile', flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
