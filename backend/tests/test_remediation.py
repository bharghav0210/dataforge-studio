"""Audit regressions. Every database and output belongs to pytest's temporary home."""
import io
import json
import os
import sqlite3

import pandas as pd
import pytest
from fastapi.testclient import TestClient

from app.core.config import Settings
from app.main import create_app
from app.services import data


@pytest.fixture
def client(tmp_path):
    with TestClient(create_app(Settings(tmp_path)), raise_server_exceptions=False) as client:
        client.home = tmp_path
        yield client


def upload(client, content, filename='repair.csv'):
    response = client.post('/api/v1/datasets', files={'file': (filename, content)})
    assert response.status_code == 201, response.text
    return response.json()


@pytest.mark.parametrize('literal,marker', [('1e999', '[non-finite: Infinity]'), ('-1e999', '[non-finite: -Infinity]')])
def test_h1_sql_nonfinite_is_explicit_and_all_read_endpoints_work(client, literal, marker):
    response = client.post('/api/v1/sql/run', json={'sql': f'SELECT {literal} AS unusual, 42.25 AS valid'})
    assert response.status_code == 200, response.text
    record = response.json()
    assert record['status'] == 'success'
    assert record['result']['rows'] == [{'unusual': marker, 'valid': 42.25}]
    for path in ['/executions', f'/executions/{record["id"]}', '/dashboard']:
        response = client.get('/api/v1' + path)
        assert response.status_code == 200, response.text
        json.loads(response.text, parse_constant=lambda value: pytest.fail(f'Invalid JSON number: {value}'))
    assert marker in client.get(f'/api/v1/executions/{record["id"]}/download').text


def test_h1_legacy_nan_and_infinity_history_is_readable_without_rewriting(client):
    record = client.post('/api/v1/sql/run', json={'sql': 'SELECT 7 AS valid'}).json()
    legacy = json.dumps({'columns': ['p', 'n', 'nan', 'valid'], 'rows': [{'p': float('inf'), 'n': -float('inf'), 'nan': float('nan'), 'valid': 7.25}], 'row_count': 1})
    with sqlite3.connect(client.home / 'metadata.sqlite3') as conn:
        conn.execute('UPDATE execution_records SET result=? WHERE id=?', (legacy, record['id']))
    for path in ['/executions', f'/executions/{record["id"]}', '/dashboard']:
        response = client.get('/api/v1' + path)
        assert response.status_code == 200
        assert '[non-finite: NaN]' in response.text and '[non-finite: Infinity]' in response.text
    detail = client.get(f'/api/v1/executions/{record["id"]}').json()
    assert detail['result']['rows'][0]['n'] == '[non-finite: -Infinity]'
    assert detail['result']['rows'][0]['valid'] == 7.25
    with sqlite3.connect(client.home / 'metadata.sqlite3') as conn:
        assert conn.execute('SELECT result FROM execution_records WHERE id=?', (record['id'],)).fetchone()[0] == legacy


@pytest.mark.parametrize('body', [b'a,b\n1,2,3\n4,5,6\n', b'a,b,c\n1,2\n', b'a,b\n""\n'])
def test_h2_malformed_csv_width_is_rejected_without_orphans(client, body):
    response = client.post('/api/v1/datasets', files={'file': ('bad.csv', body)})
    assert response.status_code == 400
    assert 'fields' in response.json()['detail'] and 'expected' in response.json()['detail']
    assert client.get('/api/v1/datasets').json() == []
    assert list((client.home / 'uploads').iterdir()) == []


def test_h2_valid_quoted_csv_preview_and_sql_values_agree(client):
    dataset = upload(client, b'\xef\xbb\xbf \r\norder_id,description,value\r\n1,"a,b",2.5\r\n2,"two\nlines",\r\n\r\n')
    preview = client.get('/api/v1/datasets/' + dataset['id']).json()['preview']
    assert preview['rows'] == [{'order_id': 1, 'description': 'a,b', 'value': 2.5}, {'order_id': 2, 'description': 'two\nlines', 'value': None}]
    assert client.post(f'/api/v1/datasets/{dataset["id"]}/import-sql', json={'table': 'valid_csv'}).status_code == 200
    query = client.post('/api/v1/sql/run', json={'sql': 'SELECT * FROM valid_csv ORDER BY order_id'}).json()
    assert query['result']['rows'] == preview['rows']


def test_m4_excel_numeric_and_colliding_headers_keep_all_values_and_select(client):
    buffer = io.BytesIO()
    pd.DataFrame([[10, 20, 30, 40]], columns=[1, '1', '1_2', 'note']).to_excel(buffer, index=False)
    dataset = upload(client, buffer.getvalue(), 'numbers.xlsx')
    detail = client.get('/api/v1/datasets/' + dataset['id']).json()
    names = [column['name'] for column in detail['columns']]
    assert names == ['1', '1_3', '1_2', 'note']
    assert len(detail['preview']['rows'][0]) == 4
    assert list(detail['preview']['rows'][0].values()) == [10, 20, 30, 40]
    definition = {'name': 'Numeric Excel', 'dataset_id': dataset['id'], 'steps': [{'op': 'select', 'columns': names}], 'destination': 'csv'}
    first = client.post('/api/v1/pipelines/preview', json=definition)
    assert first.status_code == 200, first.text
    assert first.json()['columns'] == names
    assert client.post('/api/v1/pipelines/preview', json=definition).json() == first.json()
    assert client.post(f'/api/v1/datasets/{dataset["id"]}/import-sql', json={'table': 'excel_numbers'}).status_code == 200
    assert client.post('/api/v1/sql/run', json={'sql': 'SELECT * FROM excel_numbers'}).json()['result']['rows'] == first.json()['rows']


def test_m5_large_returning_commits_all_changes_with_capped_output(client):
    with sqlite3.connect(client.home / 'workspace.sqlite3') as conn:
        conn.execute('CREATE TABLE returning_rows (x INTEGER)')
        conn.executemany('INSERT INTO returning_rows VALUES (?)', [(i,) for i in range(700)])
    run = client.post('/api/v1/sql/run', json={'sql': 'UPDATE returning_rows SET x=x+1000 RETURNING x', 'allow_write': True}).json()
    assert run['status'] == 'success', run
    assert run['result']['row_count'] == 500 and run['result']['truncated'] is True
    assert run['result']['affected_rows'] == 700
    with sqlite3.connect(client.home / 'workspace.sqlite3') as conn:
        assert conn.execute('SELECT min(x), max(x), count(*) FROM returning_rows').fetchone() == (1000, 1699, 700)
    # A read query in write mode still stops at its display cap; no unbounded drain.
    read = client.post('/api/v1/sql/run', json={'sql': 'WITH RECURSIVE c(x) AS (SELECT 1 UNION ALL SELECT x+1 FROM c) SELECT x FROM c', 'allow_write': True}).json()
    assert read['status'] == 'success' and read['result']['truncated']
    assert client.post('/api/v1/sql/run', json={'sql': 'DELETE FROM returning_rows'}).json()['status'] == 'failed'
    assert client.post('/api/v1/sql/run', json={'sql': "ATTACH DATABASE ':memory:' AS other", 'allow_write': True}).json()['status'] == 'failed'


@pytest.mark.parametrize('failure', ['duplicate_columns', 'destination_error', 'csv_write_error', 'publish_error', 'metadata_error'])
def test_l1_failed_etl_leaves_no_owned_csv_and_preserves_other_outputs(client, monkeypatch, failure):
    dataset = upload(client, b'region,quantity\nNorth,1\nSouth,2\n')
    base = {'name': 'Artifact ownership', 'dataset_id': dataset['id'], 'steps': [], 'destination': 'csv'}
    pipeline = client.post('/api/v1/pipelines', json=base).json()
    successful = client.post(f'/api/v1/pipelines/{pipeline["id"]}/run').json()
    assert successful['status'] == 'success'
    original_path = client.home / 'outputs' / successful['output_reference']
    original = original_path.read_bytes()
    user_file = client.home / 'outputs' / 'user-created.csv'
    user_file.write_text('keep me')
    before = {p.name for p in (client.home / 'outputs').iterdir()}
    if failure == 'duplicate_columns':
        base['steps'] = [{'op': 'select', 'columns': ['region', 'region']}]
    elif failure == 'destination_error':
        base['destination'] = 'sqlite'
        def fail_destination(*args, **kwargs):
            raise ValueError('Injected destination failure')
        monkeypatch.setattr(data, 'import_table', fail_destination)
    elif failure == 'csv_write_error':
        def fail_write(handle, *args, **kwargs):
            handle.write('partial output')
            raise ValueError('Injected CSV write failure')
        monkeypatch.setattr(pd.DataFrame, 'to_csv', lambda self, handle, **kwargs: fail_write(handle))
    elif failure == 'publish_error':
        def fail_publish(*args, **kwargs):
            raise OSError('Injected publication failure')
        monkeypatch.setattr(os, 'link', fail_publish)
    elif failure == 'metadata_error':
        from sqlalchemy import event
        from sqlalchemy.orm import Session
        from app.models import ExecutionRecord
        def fail_success_commit(session):
            if any(isinstance(item, ExecutionRecord) and item.status == 'success' for item in session.dirty):
                raise ValueError('Injected metadata commit failure')
        event.listen(Session, 'before_commit', fail_success_commit)
        # Always remove this test's listener, including if an assertion fails.
        monkeypatch.setattr(client, '_remove_commit_listener', lambda: event.remove(Session, 'before_commit', fail_success_commit), raising=False)
    client.put(f'/api/v1/pipelines/{pipeline["id"]}', json=base)
    try:
        failed = client.post(f'/api/v1/pipelines/{pipeline["id"]}/run').json()
    finally:
        if failure == 'metadata_error':
            client._remove_commit_listener()
    assert failed['status'] == 'failed'
    assert failed['output_reference'] is None
    assert {p.name for p in (client.home / 'outputs').iterdir()} == before
    assert original_path.read_bytes() == original and user_file.read_text() == 'keep me'
    assert client.get(f'/api/v1/executions/{successful["id"]}/download').content == original


def test_l1_publication_never_overwrites_an_existing_user_file(client):
    from sqlalchemy import event
    from sqlalchemy.orm import Session
    from app.models import ExecutionRecord
    dataset = upload(client, b'a\n1\n')
    pipeline = client.post('/api/v1/pipelines', json={'name': 'Collision safety', 'dataset_id': dataset['id'], 'steps': []}).json()
    collision = []
    def create_user_file(session, flush_context):
        for item in session.new:
            if isinstance(item, ExecutionRecord) and item.kind == 'etl':
                path = client.home / 'outputs' / f'{item.id}.csv'
                path.write_text('existing user output')
                collision.append(path)
    event.listen(Session, 'after_flush', create_user_file)
    try:
        failed = client.post(f'/api/v1/pipelines/{pipeline["id"]}/run').json()
    finally:
        event.remove(Session, 'after_flush', create_user_file)
    assert failed['status'] == 'failed' and failed['output_reference'] is None
    assert len(collision) == 1 and collision[0].read_text() == 'existing user output'
    assert list((client.home / 'outputs').iterdir()) == collision
