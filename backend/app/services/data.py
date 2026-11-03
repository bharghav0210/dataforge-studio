import csv
import re
import sqlite3
import zipfile
import pandas as pd


def normalize_columns(df):
    """Keep parser-assigned names and disambiguate collisions after string conversion."""
    labels = [str(label) for label in df.columns]
    reserved, used, normalized = set(labels), set(), []
    for original in labels:
        name, suffix = original, 2
        if name in used:
            while True:
                name = f'{original}_{suffix}'
                suffix += 1
                if name not in used and name not in reserved:
                    break
        used.add(name)
        normalized.append(name)
    df.columns = normalized
    return df


def validate_csv_width(path):
    with open(path, encoding='utf-8-sig', newline='') as handle:
        physical_lines = []
        def tracked_lines():
            for line in handle:
                physical_lines.append(line)
                yield line
        reader = csv.reader(tracked_lines(), strict=True)
        width = None
        count = 0
        for row in reader:
            # Match ordinary CSV blank-line handling without treating missing fields as blanks.
            blank = not ''.join(physical_lines).strip()
            physical_lines.clear()
            if blank:
                continue
            if width is None:
                width = len(row)
                if width > 100:
                    raise ValueError('Dataset is limited to 100 columns')
                continue
            if len(row) != width:
                raise ValueError(f'CSV row at line {reader.line_num} has {len(row)} fields; expected {width} from the header')
            count += 1
            if count > 100000:
                raise ValueError('Dataset is limited to 100,000 rows')


def frame(path):
    if str(path).lower().endswith('.xlsx'):
        with zipfile.ZipFile(path) as archive:
            if sum(info.file_size for info in archive.infolist()) > 50 * 1024 * 1024:
                raise ValueError('Excel expanded content exceeds 50 MB')
        return normalize_columns(pd.read_excel(path))
    validate_csv_width(path)
    return normalize_columns(pd.read_csv(path, encoding='utf-8-sig', on_bad_lines='error', index_col=False))


def validate_frame(df):
    if df.empty or not len(df.columns):
        raise ValueError('Dataset must contain headers and at least one data row')
    if len(df) > 100000 or len(df.columns) > 100:
        raise ValueError('Dataset is limited to 100,000 rows and 100 columns')
    if any(str(c).startswith('Unnamed:') or '\x00' in str(c) for c in df.columns):
        raise ValueError('Dataset contains empty or invalid column names')


def preview(df, limit=100):
    # Pandas JSON normalizes missing values, timestamps and numpy scalars.
    import json
    return {'columns': [str(c) for c in df.columns], 'rows': json.loads(df.head(limit).to_json(orient='records', date_format='iso')), 'row_count': len(df), 'truncated': len(df) > limit}


def describe(df):
    return [{'name': str(c), 'dtype': str(df[c].dtype), 'missing': int(df[c].isna().sum())} for c in df.columns]


def table_name(name):
    if not re.fullmatch(r'[A-Za-z][A-Za-z0-9_]{0,62}', name) or name.lower().startswith('sqlite_'):
        raise ValueError('Use a table name starting with a letter, followed by letters, digits or underscores')
    return name


def import_table(home, df, name):
    table_name(name)
    with sqlite3.connect(home / 'workspace.sqlite3', timeout=3) as conn:
        # Fail on collisions so imports and pipelines never overwrite existing data.
        df.to_sql(name, conn, index=False, if_exists='fail')


def transform(df, steps):
    df = df.copy()
    for step in steps:
        op = step.op
        referenced = step.columns + list(step.mapping) + ([step.column] if step.column else [])
        unknown = set(referenced) - set(df.columns)
        if unknown:
            raise ValueError(f'Unknown columns: {", ".join(sorted(unknown))}')
        if op == 'drop_duplicates':
            df = df.drop_duplicates(subset=step.columns or None)
        elif op == 'select':
            df = df[step.columns]
        elif op == 'rename':
            df = df.rename(columns=step.mapping)
            if not df.columns.is_unique:
                raise ValueError('Rename would create duplicate columns')
        elif op == 'fill_missing':
            df[step.column] = df[step.column].fillna(step.value)
        elif op == 'drop_missing':
            df = df.dropna(subset=step.columns or None)
        elif op == 'filter':
            column, value = df[step.column], step.value
            methods = {'eq': column.eq, 'ne': column.ne, 'gt': column.gt, 'gte': column.ge, 'lt': column.lt, 'lte': column.le}
            mask = column.astype('string').str.contains(str(value), regex=False, na=False) if step.condition == 'contains' else methods[step.condition](value)
            df = df[mask.fillna(False)]
    return df
