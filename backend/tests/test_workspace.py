import io
import json
import sqlite3
import pandas as pd
import pytest
from fastapi.testclient import TestClient
from app.main import create_app
from app.core.config import Settings


@pytest.fixture
def client(tmp_path):
    settings = Settings(tmp_path, python_timeout=1.5, upload_limit=20000, sql_timeout=0.05)
    with TestClient(create_app(settings)) as c:
        c.settings = settings
        yield c


def upload(c, content=b'region,quantity,price\nNorth,2,10\nSouth,,20\nNorth,2,10\nWest,5,30\n', name='sales.csv'):
    response = c.post('/api/v1/datasets', files={'file': (name, content, 'text/csv')})
    assert response.status_code == 201, response.text
    return response.json()


def notebook(c, cells):
    return c.post('/api/v1/notebooks', json={'name': 'Analysis', 'cells': [{'source': s} for s in cells]}).json()


def test_health_and_origin(client):
    assert client.get('/api/v1/health').json()['status'] == 'healthy'
    assert client.get('/').json()['application'] == 'DataForge Studio'
    assert client.post('/api/v1/notebooks', headers={'Origin': 'https://evil.example'}, json={'name': 'bad'}).status_code == 403
    assert client.get('/api/v1/settings').json()['workspace_database'] == 'ok'


def test_notebook_crud_import_export(client):
    n = notebook(client, ['x = 6', 'print(x * 7)'])
    assert client.get('/api/v1/notebooks/' + n['id']).json()['cells'][1]['source'] == 'print(x * 7)'
    assert client.put('/api/v1/notebooks/' + n['id'], json={'name': 'Renamed', 'cells': [{'source': 'print(3)'}]}).json()['name'] == 'Renamed'
    export = client.get('/api/v1/notebooks/' + n['id'] + '/export')
    imported = client.post('/api/v1/notebooks/import', files={'file': ('copy.ipynb', export.content)})
    assert imported.status_code == 201
    assert imported.json()['cells'] == [{'source': 'print(3)'}]
    assert client.post('/api/v1/notebooks/import', files={'file': ('bad.ipynb', b'[]')}).status_code == 400
    assert client.delete('/api/v1/notebooks/' + n['id']).status_code == 204
    assert client.get('/api/v1/notebooks/' + n['id']).status_code == 404


def test_python_state_output_error_timeout_and_limits(client):
    n = notebook(client, ['x = 6', 'print(x * 7)'])
    r = client.post('/api/v1/python/run', json={'notebook_id': n['id'], 'cell_index': 1}).json()
    assert r['status'] == 'success', r
    assert r['result']['stdout'].strip() == '42'
    assert r['result']['replayed_cells'] == 2
    for source, message in [('raise ValueError("intentional")', 'intentional'), ('while True: pass', 'timed out'), ('print("x" * 100000)', 'Output limit')]:
        n = notebook(client, [source])
        r = client.post('/api/v1/python/run', json={'notebook_id': n['id']}).json()
        assert r['status'] == 'failed'
        assert message in r['error']
        assert len(r['result'].get('stdout', '').encode()) <= client.settings.output_limit
    assert not list((client.settings.home / 'sessions').iterdir())


def test_python_pandas_environment_and_datasets(client, monkeypatch):
    monkeypatch.setenv('DATAFORGE_TEST_SECRET', 'must-not-leak')
    d = upload(client)
    n = notebook(client, [f'import pandas as pd, numpy as np, os\ndf = pd.read_csv(DATASET_DIR + "/{d["filename"]}")\nprint(len(df), np.sum([1, 2]))\nprint(os.getenv("DATAFORGE_TEST_SECRET"))'])
    r = client.post('/api/v1/python/run', json={'notebook_id': n['id']}).json()
    assert r['status'] == 'success', r
    assert '4 3' in r['result']['stdout']
    assert 'None' in r['result']['stdout']


def test_dataset_validation_inspection_and_import(client):
    for name, content, status in [('bad.exe', b'test', 400), ('../escape.csv', b'a\n1', 400), ('empty.csv', b'a,b\n', 400), ('binary.csv', b'a\x00b', 400), ('huge.csv', b'x' * 20001, 413), ('bad.csv', b'a,b\n"unterminated', 400)]:
        assert client.post('/api/v1/datasets', files={'file': (name, content)}).status_code == status
    # Multipart normalizes Windows client paths; storage still uses a server UUID.
    normalized = upload(client, b'a\n1', 'C:\\bad.csv')
    assert normalized['original_name'] == 'bad.csv'
    assert (client.settings.home / 'uploads' / normalized['filename']).is_file()
    d = upload(client)
    detail = client.get('/api/v1/datasets/' + d['id']).json()
    assert detail['rows'] == 4
    assert detail['columns'][1]['missing'] == 1
    assert len(detail['preview']['rows']) == 4
    assert client.get('/api/v1/datasets/' + d['id'] + '/download').content.startswith(b'region,')
    assert client.post('/api/v1/datasets/' + d['id'] + '/import-sql', json={'table': '../bad'}).status_code == 422
    assert client.post('/api/v1/datasets/' + d['id'] + '/import-sql', json={'table': 'sales'}).status_code == 200
    assert client.post('/api/v1/datasets/' + d['id'] + '/import-sql', json={'table': 'sales'}).status_code == 400
    assert client.delete('/api/v1/datasets/' + d['id']).status_code == 204


def test_excel(client):
    buffer = io.BytesIO()
    pd.DataFrame({'a': [1, 2]}).to_excel(buffer, index=False)
    d = upload(client, buffer.getvalue(), 'sample.xlsx')
    assert d['rows'] == 2


def test_sql_modes_restrictions_timeout_and_history(client):
    def run(query, write=False):
        return client.post('/api/v1/sql/run', json={'sql': query, 'allow_write': write}).json()
    r = run('SELECT region, SUM(revenue) AS total FROM demo_sales GROUP BY region')
    assert r['status'] == 'success'
    assert len(r['result']['rows']) == 3
    assert client.get('/api/v1/executions/' + r['id'] + '/download').status_code == 200
    for statement in ["ATTACH DATABASE ':memory:' AS other", "ATTACH DATABASE 'metadata.sqlite3' AS meta", 'PRAGMA database_list', 'SELECT * FROM notebooks', 'SELECT load_extension("bad")', 'DROP TABLE demo_sales', "SELECT * FROM readfile('/etc/passwd')"]:
        assert run(statement)['status'] == 'failed', statement
        assert run(statement, True)['status'] == 'failed', statement
    assert run('DELETE FROM demo_sales')['status'] == 'failed'
    assert run("INSERT INTO demo_sales VALUES ('East', 'Pen', 1, 5)", True)['status'] == 'success'
    assert run('SELECT 1; SELECT 2')['status'] == 'failed'
    assert run('THIS IS NOT SQL')['status'] == 'failed'
    assert run('WITH RECURSIVE c(x) AS (SELECT 1 UNION ALL SELECT x+1 FROM c) SELECT SUM(x) FROM c')['status'] == 'failed'
    limited = run('WITH RECURSIVE c(x) AS (SELECT 1 UNION ALL SELECT x+1 FROM c WHERE x<700) SELECT x FROM c')
    assert limited['result']['truncated']
    assert len(limited['result']['rows']) == 500
    q = client.post('/api/v1/sql/queries', json={'name': 'total', 'sql': 'SELECT 1'}).json()
    assert len(client.get('/api/v1/sql/queries').json()) == 1
    assert client.delete('/api/v1/sql/queries/' + q['id']).status_code == 204
    assert all(e['kind'] == 'sql' for e in client.get('/api/v1/executions?kind=sql&status=failed').json())


def test_pipeline_transformations_reruns_and_failure(client):
    d = upload(client)
    body = {'name': 'Clean retail', 'dataset_id': d['id'], 'destination': 'sqlite', 'table': 'clean_sales', 'steps': [
        {'op': 'drop_duplicates'}, {'op': 'fill_missing', 'column': 'quantity', 'value': 0},
        {'op': 'filter', 'column': 'quantity', 'condition': 'gte', 'value': 2},
        {'op': 'rename', 'mapping': {'price': 'unit_price'}}, {'op': 'select', 'columns': ['region', 'unit_price']}]}
    preview = client.post('/api/v1/pipelines/preview', json=body)
    assert preview.status_code == 200, preview.text
    assert preview.json()['row_count'] == 2
    assert preview.json()['columns'] == ['region', 'unit_price']
    p = client.post('/api/v1/pipelines', json=body).json()
    tables = []
    for _ in range(2):
        run = client.post('/api/v1/pipelines/' + p['id'] + '/run').json()
        assert run['status'] == 'success', run
        assert run['result']['input_rows'] == 4
        assert run['result']['output_rows'] == 2
        tables.append(run['result']['table'])
        assert client.get('/api/v1/executions/' + run['id'] + '/download').content.startswith(b'region,unit_price')
    assert tables[0] != tables[1]
    assert client.delete('/api/v1/datasets/' + d['id']).status_code == 409
    body['steps'] = [{'op': 'drop_missing', 'columns': ['quantity']}]
    assert client.post('/api/v1/pipelines/preview', json=body).json()['row_count'] == 3
    body['steps'] = [{'op': 'filter', 'column': 'region', 'condition': 'contains', 'value': 'North'}]
    assert client.post('/api/v1/pipelines/preview', json=body).json()['row_count'] == 2
    body['steps'] = [{'op': 'select', 'columns': ['absent']}]
    assert client.post('/api/v1/pipelines/preview', json=body).status_code == 400
    client.put('/api/v1/pipelines/' + p['id'], json=body)
    failed = client.post('/api/v1/pipelines/' + p['id'] + '/run').json()
    assert failed['status'] == 'failed' and 'Unknown columns' in failed['error']
    for step in [{'op': 'eval', 'value': 'bad'}, {'op': 'filter'}, {'op': 'select'}, {'op': 'rename', 'mapping': {'a': ''}}]:
        body['steps'] = [step]
        assert client.post('/api/v1/pipelines', json=body).status_code == 422
    assert client.delete('/api/v1/pipelines/' + p['id']).status_code == 204
    assert client.delete('/api/v1/datasets/' + d['id']).status_code == 204


def test_restart_persistence_and_dashboard(tmp_path):
    settings = Settings(tmp_path)
    with TestClient(create_app(settings)) as c:
        n = notebook(c, ['print("persisted")'])
        upload(c)
        p = c.post('/api/v1/python/run', json={'notebook_id': n['id']}).json()
        assert p['status'] == 'success'
    with TestClient(create_app(settings)) as c:
        assert c.get('/api/v1/notebooks/' + n['id']).json()['name'] == 'Analysis'
        assert c.get('/api/v1/executions/' + p['id']).json()['status'] == 'success'
        counts = c.get('/api/v1/dashboard').json()['counts']
        assert counts == {'notebooks': 1, 'datasets': 1, 'queries': 0, 'pipelines': 0, 'success': 1, 'failed': 0}


def test_preserve_code_and_reconcile_interrupted_execution(tmp_path):
    from app.models import ExecutionRecord
    settings = Settings(tmp_path)
    source = '\n# keep leading/trailing newlines\nprint(7)\n'
    with TestClient(create_app(settings)) as c:
        n = notebook(c, [source])
        assert n['cells'][0]['source'] == source
        with c.app.state.sessions() as s:
            interrupted = ExecutionRecord(kind='python', resource_id=n['id'], resource_name=n['name'])
            s.add(interrupted)
            s.commit()
            identifier = interrupted.id
        assert c.post('/api/v1/sql/run', json={'sql': 'DELETE FROM demo_sales', 'allow_write': True}).json()['status'] == 'success'
    with TestClient(create_app(settings)) as c:
        r = c.get('/api/v1/executions/' + identifier).json()
        assert r['status'] == 'failed' and 'stopped' in r['error']
        # User deletions in the demo table are preserved, not silently reseeded.
        rows = c.post('/api/v1/sql/run', json={'sql': 'SELECT * FROM demo_sales'}).json()
        assert rows['result']['rows'] == []


def test_request_limit_duplicate_sql_labels_and_whitespace_names(client):
    assert client.post('/api/v1/datasets', content=b'a' * (client.settings.upload_limit + 1024 * 1024 + 1), headers={'Content-Type': 'application/octet-stream'}).status_code == 413
    assert client.get('/api/v1/health', headers={'Host': 'evil.example'}).status_code == 400
    assert client.post('/api/v1/notebooks', json={'name': '   '}).status_code == 422
    r = client.post('/api/v1/sql/run', json={'sql': 'SELECT 1 AS a, 2 AS a'}).json()
    assert r['result']['columns'] == ['a', 'a_2']
    assert r['result']['rows'] == [{'a': 1, 'a_2': 2}]
