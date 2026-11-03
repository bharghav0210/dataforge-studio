import json
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker
from app.models import Base
from app.core.json_values import json_safe


def initialize(home):
    engine = create_engine(f'sqlite:///{home / "metadata.sqlite3"}', connect_args={'check_same_thread': False},
                           json_serializer=lambda value: json.dumps(json_safe(value), allow_nan=False))

    @event.listens_for(engine, 'connect')
    def pragmas(connection, _):
        connection.execute('PRAGMA foreign_keys=ON')
        connection.execute('PRAGMA journal_mode=WAL')

    Base.metadata.create_all(engine)
    return engine, sessionmaker(engine, expire_on_commit=False)
