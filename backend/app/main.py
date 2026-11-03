from contextlib import asynccontextmanager
import sqlite3
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import update
from app.core.config import Settings
from app.core.upload_limit import UploadLimit
from starlette.middleware.trustedhost import TrustedHostMiddleware
from app.db.session import initialize
from app.models import ExecutionRecord, now
from app.api.routes import routes


def create_app(settings=None):
    settings = settings or Settings.from_env()

    @asynccontextmanager
    async def lifespan(app):
        settings.prepare()
        engine, sessions = initialize(settings.home)
        with sqlite3.connect(settings.home / 'workspace.sqlite3') as conn:
            new_demo = not conn.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name='demo_sales'").fetchone()
            conn.execute('CREATE TABLE IF NOT EXISTS demo_sales (region TEXT, product TEXT, quantity INTEGER, revenue REAL)')
            if new_demo:
                conn.executemany('INSERT INTO demo_sales VALUES (?, ?, ?, ?)', [('North', 'Notebook', 3, 45.0), ('South', 'Desk lamp', 2, 70.0), ('West', 'Notebook', 5, 75.0)])
        # A single backend instance is supported. Reconcile interrupted requests honestly on restart.
        with sessions() as session:
            session.execute(update(ExecutionRecord).where(ExecutionRecord.status == 'running').values(status='failed', completed_at=now(), error='Backend stopped before execution completed'))
            session.commit()
        app.state.sessions = sessions
        app.state.engine = engine
        yield
        engine.dispose()

    app = FastAPI(title='DataForge Studio API', version='1.0.0', description='Single-user local Python, SQL and ETL workspace', lifespan=lifespan)
    app.add_middleware(UploadLimit, limit=settings.upload_limit + 1024 * 1024)
    app.add_middleware(TrustedHostMiddleware, allowed_hosts=['localhost', '127.0.0.1', 'testserver'])
    app.add_middleware(CORSMiddleware, allow_origins=['http://localhost:3001', 'http://127.0.0.1:3001'], allow_credentials=False,
                       allow_methods=['GET', 'POST', 'PUT', 'PATCH', 'DELETE'], allow_headers=['Content-Type'])

    @app.middleware('http')
    async def local_origin(request: Request, call_next):
        # Block browser cross-origin mutation, including simple multipart form POSTs.
        origin = request.headers.get('origin')
        if origin and origin not in ('http://localhost:3001', 'http://127.0.0.1:3001', 'http://localhost:8001', 'http://127.0.0.1:8001'):
            return JSONResponse({'detail': 'Origin is not permitted'}, status_code=403)
        return await call_next(request)

    @app.get('/')
    def root():
        return {'application': 'DataForge Studio', 'version': '1.0.0', 'status': 'running'}

    @app.get('/api/v1/health')
    def health():
        return {'status': 'healthy', 'service': 'dataforge-api'}

    def sessions():
        return app.state.sessions()

    app.include_router(routes(settings, sessions))
    return app


app = create_app()
