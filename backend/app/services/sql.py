import sqlite3
import time
from app.core.json_values import json_safe


# Connection-layer authorizer: deny filesystem access, attaching databases,
# PRAGMAs, schema mutation and extension functions in both modes.
READ = {sqlite3.SQLITE_SELECT, sqlite3.SQLITE_READ, sqlite3.SQLITE_FUNCTION, sqlite3.SQLITE_RECURSIVE}
WRITE = {sqlite3.SQLITE_INSERT, sqlite3.SQLITE_UPDATE, sqlite3.SQLITE_DELETE, sqlite3.SQLITE_TRANSACTION}


def connect(home, allow_write=False, on_write=None):
    mode = 'rw' if allow_write else 'ro'
    conn = sqlite3.connect(f'file:{home / "workspace.sqlite3"}?mode={mode}', uri=True, timeout=2)
    conn.enable_load_extension(False)

    def authorize(action, arg1, arg2, database, trigger):
        if action == sqlite3.SQLITE_FUNCTION and str(arg2).lower() in ('load_extension', 'readfile', 'writefile'):
            return sqlite3.SQLITE_DENY
        if action in READ or (allow_write and action in WRITE and not str(arg1).startswith('sqlite_')):
            if on_write and action in (sqlite3.SQLITE_INSERT, sqlite3.SQLITE_UPDATE, sqlite3.SQLITE_DELETE):
                on_write()
            return sqlite3.SQLITE_OK
        return sqlite3.SQLITE_DENY

    conn.set_authorizer(authorize)
    return conn


def execute(home, sql, allow_write, timeout, limit):
    writes = False

    def observe_write():
        nonlocal writes
        writes = True

    conn = connect(home, allow_write, observe_write)
    deadline = time.monotonic() + timeout
    conn.set_progress_handler(lambda: int(time.monotonic() > deadline), 1000)
    try:
        before_changes = conn.total_changes
        cursor = conn.execute(sql)
        columns = []
        for description in cursor.description or []:
            name = original = description[0]
            suffix = 2
            while name in columns:
                name = f'{original}_{suffix}'
                suffix += 1
            columns.append(name)
        data = cursor.fetchmany(limit + 1) if columns else []
        if columns and writes:
            # RETURNING must finish before commit. Drain in bounded batches, retaining only the UI cap.
            while cursor.fetchmany(512):
                pass
        rows = [{c: json_safe(v.hex() if isinstance(v, bytes) else v) for c, v in zip(columns, row)} for row in data[:limit]]
        affected = max(cursor.rowcount, conn.total_changes - before_changes, 0) if writes else 0
        cursor.close()
        conn.commit()
        return {'columns': columns, 'rows': rows, 'row_count': len(rows), 'truncated': len(data) > limit, 'affected_rows': affected}
    finally:
        conn.close()


def schema(home):
    with sqlite3.connect(f'file:{home / "workspace.sqlite3"}?mode=ro', uri=True) as conn:
        tables = conn.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").fetchall()
        return [{'name': name, 'columns': [{'name': c[1], 'type': c[2]} for c in conn.execute('PRAGMA table_info("' + name.replace('"', '""') + '")')]} for (name,) in tables]
