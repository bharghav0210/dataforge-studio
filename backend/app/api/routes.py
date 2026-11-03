import csv
import io
import json
import os
import sqlite3
import time
import tempfile
from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from fastapi.responses import FileResponse, Response
from pydantic import ValidationError
from sqlalchemy import select, func, delete
from sqlalchemy.orm import Session

from app.models import Notebook, NotebookCell, Dataset, SavedQuery, Pipeline, PipelineRun, ExecutionRecord, now
from app.schemas import NotebookInput, PythonInput, QueryInput, SavedQueryInput, TableInput, PipelineInput
from app.services import data, sql, python_runner
from app.core.json_values import json_safe


def serialize(obj):
    result = {c.name: getattr(obj, c.name) for c in obj.__table__.columns}
    if isinstance(obj, Notebook):
        result['cells'] = [{'source': c.source} for c in obj.cells]
    return json_safe(result)


def routes(settings, sessions):
    router = APIRouter(prefix='/api/v1')

    def db():
        with sessions() as session:
            yield session

    def get(session, model, identifier):
        obj = session.get(model, identifier)
        if obj is None:
            raise HTTPException(404, 'Resource not found')
        return obj

    def begin(session, kind, resource_id, name):
        record = ExecutionRecord(kind=kind, resource_id=resource_id, resource_name=name)
        session.add(record)
        session.commit()
        return record, time.perf_counter()

    def finish(session, record, started, result, error=None):
        record.completed_at = now()
        record.duration_ms = round((time.perf_counter() - started) * 1000, 2)
        record.status = 'failed' if error else 'success'
        record.error = str(error)[:8000] if error else None
        record.result = json_safe(result)
        session.commit()
        return serialize(record)

    @router.get('/dashboard')
    def dashboard(session: Session = Depends(db)):
        counts = {key: session.scalar(select(func.count()).select_from(model)) for key, model in [('notebooks', Notebook), ('datasets', Dataset), ('queries', SavedQuery), ('pipelines', Pipeline)]}
        for status in ('success', 'failed'):
            counts[status] = session.scalar(select(func.count()).select_from(ExecutionRecord).where(ExecutionRecord.status == status))
        records = session.scalars(select(ExecutionRecord).order_by(ExecutionRecord.started_at.desc()).limit(12)).all()
        return {'counts': counts, 'recent': [serialize(r) for r in records]}

    @router.get('/settings')
    def configuration():
        with sqlite3.connect(f'file:{settings.home / "workspace.sqlite3"}?mode=ro', uri=True) as conn:
            status = conn.execute('PRAGMA quick_check').fetchone()[0]
        return {'version': '1.0.0', 'backend': 'connected', 'workspace_database': status,
                'execution_mode': 'Trusted local subprocess; sequential replay of prior cells',
                'python_timeout_seconds': settings.python_timeout, 'output_limit_bytes': settings.output_limit,
                'memory_limit_mb': 1024, 'sql_timeout_seconds': settings.sql_timeout,
                'upload_limit_bytes': settings.upload_limit, 'result_row_limit': settings.row_limit,
                'storage_location': str(settings.home),
                'security': 'Single-user local MVP. Python can access files and network with your OS permissions. This is not a secure sandbox. Never execute untrusted code or expose this service publicly.'}

    @router.get('/notebooks')
    def notebooks(session: Session = Depends(db)):
        return [serialize(n) for n in session.scalars(select(Notebook).order_by(Notebook.updated_at.desc())).all()]

    @router.post('/notebooks', status_code=201)
    def create_notebook(body: NotebookInput, session: Session = Depends(db)):
        item = Notebook(name=body.name, cells=[NotebookCell(position=i, source=c.source) for i, c in enumerate(body.cells)])
        session.add(item)
        session.commit()
        return serialize(item)

    @router.post('/notebooks/import', status_code=201)
    def import_notebook(file: UploadFile = File(...), session: Session = Depends(db)):
        if not file.filename or Path(file.filename).name != file.filename or not file.filename.lower().endswith('.ipynb'):
            raise HTTPException(400, 'Upload a basic .ipynb notebook with a plain filename')
        raw = file.file.read(settings.upload_limit + 1)
        if len(raw) > settings.upload_limit:
            raise HTTPException(413, 'Notebook too large')
        try:
            content = json.loads(raw)
            if content.get('nbformat') != 4:
                raise ValueError('Only notebook format 4 is supported')
            cells = []
            for cell in content['cells']:
                if cell['cell_type'] == 'code':
                    source = cell.get('source', '')
                    cells.append({'source': ''.join(source) if isinstance(source, list) else source})
            body = NotebookInput(name=Path(file.filename).stem, cells=cells)
        except (ValueError, TypeError, KeyError, AttributeError) as exc:
            raise HTTPException(400, f'Invalid notebook: {exc}')
        return create_notebook(body, session)

    @router.get('/notebooks/{identifier}')
    def notebook(identifier: str, session: Session = Depends(db)):
        return serialize(get(session, Notebook, identifier))

    @router.put('/notebooks/{identifier}')
    def update_notebook(identifier: str, body: NotebookInput, session: Session = Depends(db)):
        item = get(session, Notebook, identifier)
        item.name = body.name
        item.updated_at = now()
        item.cells = [NotebookCell(position=i, source=c.source) for i, c in enumerate(body.cells)]
        session.commit()
        return serialize(item)

    @router.delete('/notebooks/{identifier}', status_code=204)
    def delete_notebook(identifier: str, session: Session = Depends(db)):
        session.delete(get(session, Notebook, identifier))
        session.commit()

    @router.get('/notebooks/{identifier}/export')
    def export_notebook(identifier: str, session: Session = Depends(db)):
        item = get(session, Notebook, identifier)
        content = {'nbformat': 4, 'nbformat_minor': 5, 'metadata': {'kernelspec': {'name': 'python3', 'display_name': 'Python 3', 'language': 'python'}},
                   'cells': [{'id': c.id, 'cell_type': 'code', 'metadata': {}, 'source': c.source.splitlines(keepends=True), 'execution_count': None, 'outputs': []} for c in item.cells]}
        return Response(json.dumps(content, indent=2), media_type='application/x-ipynb+json', headers={'Content-Disposition': 'attachment; filename="notebook.ipynb"'})

    @router.post('/python/run')
    def python_run(body: PythonInput, session: Session = Depends(db)):
        item = get(session, Notebook, body.notebook_id)
        if not item.cells or (body.cell_index is not None and body.cell_index >= len(item.cells)):
            raise HTTPException(400, 'Select an existing code cell')
        cells = item.cells if body.cell_index is None else item.cells[:body.cell_index + 1]
        record, started = begin(session, 'python', item.id, item.name)
        try:
            result = python_runner.run([c.source for c in cells], settings)
            result['replayed_cells'] = len(cells)
            return finish(session, record, started, result, result['error'])
        except Exception as exc:
            return finish(session, record, started, {}, str(exc))

    @router.get('/datasets')
    def datasets(session: Session = Depends(db)):
        items = []
        for item in session.scalars(select(Dataset).order_by(Dataset.created_at.desc())).all():
            payload = serialize(item)
            names = [column['name'] for column in item.columns]
            if len(names) != len(set(names)):
                # Legacy metadata may contain names which collided after string conversion.
                # Return canonical names without rewriting the user's stored record.
                payload['columns'] = data.describe(data.frame(settings.home / 'uploads' / item.filename))
            items.append(payload)
        return items

    @router.post('/datasets', status_code=201)
    def upload_dataset(file: UploadFile = File(...), session: Session = Depends(db)):
        filename = file.filename or ''
        ext = Path(filename).suffix.lower()
        if Path(filename).name != filename or '\\' in filename or ext not in ('.csv', '.xlsx'):
            raise HTTPException(400, 'Use a plain filename ending in .csv or .xlsx')
        content = file.file.read(settings.upload_limit + 1)
        if len(content) > settings.upload_limit:
            raise HTTPException(413, 'Dataset exceeds the upload size limit')
        if not content or (ext == '.csv' and b'\x00' in content):
            raise HTTPException(400, 'Empty or binary CSV content')
        path = settings.home / 'uploads' / (str(uuid4()) + ext)
        try:
            path.write_bytes(content)
            df = data.frame(path)
            data.validate_frame(df)
            item = Dataset(name=Path(filename).stem[:160], filename=path.name, original_name=filename[:200], size=len(content), rows=len(df), columns=data.describe(df))
            session.add(item)
            session.commit()
        except Exception as exc:
            session.rollback()
            path.unlink(missing_ok=True)
            raise HTTPException(400, f'Unable to read dataset: {str(exc)[:400]}')
        return serialize(item)

    @router.get('/datasets/{identifier}')
    def dataset(identifier: str, session: Session = Depends(db)):
        item = get(session, Dataset, identifier)
        try:
            df = data.frame(settings.home / 'uploads' / item.filename)
            return {**serialize(item), 'columns': data.describe(df), 'preview': data.preview(df)}
        except (ValueError, OSError) as exc:
            raise HTTPException(400, f'Unable to read dataset: {exc}')

    @router.get('/datasets/{identifier}/download')
    def download_dataset(identifier: str, session: Session = Depends(db)):
        item = get(session, Dataset, identifier)
        return FileResponse(settings.home / 'uploads' / item.filename, filename=item.original_name)

    @router.post('/datasets/{identifier}/import-sql')
    def import_dataset(identifier: str, body: TableInput, session: Session = Depends(db)):
        item = get(session, Dataset, identifier)
        try:
            data.import_table(settings.home, data.frame(settings.home / 'uploads' / item.filename), body.table)
        except Exception as exc:
            raise HTTPException(400, str(exc))
        return {'table': body.table, 'rows': item.rows}

    @router.delete('/datasets/{identifier}', status_code=204)
    def delete_dataset(identifier: str, session: Session = Depends(db)):
        item = get(session, Dataset, identifier)
        if session.scalar(select(func.count()).select_from(Pipeline).where(Pipeline.dataset_id == identifier)):
            raise HTTPException(409, 'Delete pipelines that reference this dataset first')
        path = settings.home / 'uploads' / item.filename
        session.delete(item)
        session.commit()
        path.unlink(missing_ok=True)

    @router.get('/sql/schema')
    def schema():
        return sql.schema(settings.home)

    @router.post('/sql/run')
    def query(body: QueryInput, session: Session = Depends(db)):
        record, started = begin(session, 'sql', None, body.sql[:100])
        try:
            result = sql.execute(settings.home, body.sql, body.allow_write, settings.sql_timeout, settings.row_limit)
            result['sql'] = body.sql
            result['allow_write'] = body.allow_write
            return finish(session, record, started, result)
        except Exception as exc:
            return finish(session, record, started, {'sql': body.sql}, str(exc))

    @router.get('/sql/queries')
    def saved_queries(session: Session = Depends(db)):
        return [serialize(q) for q in session.scalars(select(SavedQuery).order_by(SavedQuery.updated_at.desc())).all()]

    @router.post('/sql/queries', status_code=201)
    def save_query(body: SavedQueryInput, session: Session = Depends(db)):
        item = SavedQuery(**body.model_dump())
        session.add(item)
        session.commit()
        return serialize(item)

    @router.delete('/sql/queries/{identifier}', status_code=204)
    def delete_query(identifier: str, session: Session = Depends(db)):
        session.delete(get(session, SavedQuery, identifier))
        session.commit()

    @router.get('/pipelines')
    def pipelines(session: Session = Depends(db)):
        return [serialize(p) for p in session.scalars(select(Pipeline).order_by(Pipeline.updated_at.desc())).all()]

    def process(body, session):
        item = get(session, Dataset, body.dataset_id)
        original = data.frame(settings.home / 'uploads' / item.filename)
        return original, data.transform(original, body.steps)

    @router.post('/pipelines/preview')
    def preview_pipeline(body: PipelineInput, session: Session = Depends(db)):
        try:
            original, output = process(body, session)
            return {**data.preview(output), 'input_rows': len(original)}
        except HTTPException:
            raise
        except Exception as exc:
            raise HTTPException(400, str(exc))

    @router.post('/pipelines', status_code=201)
    def create_pipeline(body: PipelineInput, session: Session = Depends(db)):
        get(session, Dataset, body.dataset_id)
        item = Pipeline(name=body.name, dataset_id=body.dataset_id, definition=body.model_dump())
        session.add(item)
        session.commit()
        return serialize(item)

    @router.get('/pipelines/{identifier}')
    def pipeline(identifier: str, session: Session = Depends(db)):
        return serialize(get(session, Pipeline, identifier))

    @router.put('/pipelines/{identifier}')
    def update_pipeline(identifier: str, body: PipelineInput, session: Session = Depends(db)):
        item = get(session, Pipeline, identifier)
        get(session, Dataset, body.dataset_id)
        item.name, item.dataset_id, item.definition = body.name, body.dataset_id, body.model_dump()
        item.updated_at = now()
        session.commit()
        return serialize(item)

    @router.delete('/pipelines/{identifier}', status_code=204)
    def delete_pipeline(identifier: str, session: Session = Depends(db)):
        item = get(session, Pipeline, identifier)
        session.execute(delete(PipelineRun).where(PipelineRun.pipeline_id == identifier))
        session.delete(item)
        session.commit()

    @router.post('/pipelines/{identifier}/run')
    def run_pipeline(identifier: str, session: Session = Depends(db)):
        item = get(session, Pipeline, identifier)
        record, started = begin(session, 'etl', item.id, item.name)
        run = PipelineRun(pipeline_id=item.id, execution_id=record.id, input_rows=0)
        session.add(run)
        temporary = None
        final = settings.home / 'outputs' / f'{record.id}.csv'
        published = False
        try:
            body = PipelineInput(**item.definition)
            original, output = process(body, session)
            run.input_rows, run.output_rows = len(original), len(output)
            # Validate/serialize the preview before any destination side effects.
            result = {**data.preview(output), 'input_rows': len(original), 'output_rows': len(output), 'table': None}
            filename = record.id + '.csv'
            # Exclusive creation prevents collisions with existing files or symlinks.
            descriptor, name = tempfile.mkstemp(prefix=f'.{record.id}-', suffix='.tmp', dir=settings.home / 'outputs')
            temporary = Path(name)
            with os.fdopen(descriptor, 'w', encoding='utf-8', newline='') as handle:
                output.to_csv(handle, index=False)
            if body.destination == 'sqlite':
                table = body.table[:24] + '_' + record.id.replace('-', '')[:12]
                data.import_table(settings.home, output, table)
                result['table'] = table
            # Atomic, no-overwrite publication on the same local filesystem.
            # Keep the staging link until the success record commits, so a failure can
            # remove only the inode created by this execution, never a user's replacement.
            os.link(temporary, final)
            published = True
            record.output_reference = filename
            return finish(session, record, started, result)
        except Exception as exc:
            if published and temporary is not None and final.exists() and final.samefile(temporary):
                final.unlink()
            if not session.is_active:
                session.rollback()
                session.add(PipelineRun(pipeline_id=item.id, execution_id=record.id, input_rows=run.input_rows, output_rows=run.output_rows))
            record.output_reference = None
            return finish(session, record, started, {}, str(exc))
        finally:
            # Never scan or reap historical outputs; staging is exclusively owned by this execution.
            if temporary is not None:
                temporary.unlink(missing_ok=True)

    @router.get('/executions')
    def executions(kind: str | None = None, status: str | None = None, offset: int = Query(0, ge=0), limit: int = Query(50, ge=1, le=200), session: Session = Depends(db)):
        statement = select(ExecutionRecord)
        if kind:
            statement = statement.where(ExecutionRecord.kind == kind)
        if status:
            statement = statement.where(ExecutionRecord.status == status)
        return [serialize(e) for e in session.scalars(statement.order_by(ExecutionRecord.started_at.desc()).offset(offset).limit(limit)).all()]

    @router.get('/executions/{identifier}')
    def execution(identifier: str, session: Session = Depends(db)):
        return serialize(get(session, ExecutionRecord, identifier))

    @router.get('/executions/{identifier}/download')
    def output(identifier: str, session: Session = Depends(db)):
        item = get(session, ExecutionRecord, identifier)
        if item.status != 'success':
            raise HTTPException(400, 'Only successful executions have downloadable results')
        if item.output_reference:
            return FileResponse(settings.home / 'outputs' / item.output_reference, filename='processed.csv')
        result = item.result or {}
        if item.kind != 'sql' or not result.get('columns'):
            raise HTTPException(404, 'No tabular output')
        buffer = io.StringIO()
        writer = csv.DictWriter(buffer, fieldnames=result['columns'])
        writer.writeheader()
        writer.writerows(result['rows'])
        return Response(buffer.getvalue(), media_type='text/csv', headers={'Content-Disposition': 'attachment; filename="query-results.csv"'})

    return router
