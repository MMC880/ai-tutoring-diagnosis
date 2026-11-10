"""Frozen backend + production assets; no developer tools required at runtime."""
import os
import sys
import threading
from pathlib import Path

import uvicorn
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from starlette.middleware.trustedhost import TrustedHostMiddleware


def main():
    resources = Path(getattr(sys, '_MEIPASS', Path(__file__).resolve().parents[1]))
    os.environ['PYTHONUTF8'] = '1'
    from backend.main import create_app
    site = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)
    site.add_middleware(TrustedHostMiddleware, allowed_hosts=['127.0.0.1'])
    site.mount('/', StaticFiles(directory=resources / 'web', html=True), name='web')
    config = dict(host='127.0.0.1', access_log=False, log_config=None)
    web = uvicorn.Server(uvicorn.Config(site, port=5179, **config))
    threading.Thread(target=web.run, daemon=True).start()
    uvicorn.run(create_app(), port=8019, **config)


if __name__ == '__main__':
    main()
