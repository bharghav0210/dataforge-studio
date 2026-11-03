import os
from pathlib import Path
from dataclasses import dataclass


@dataclass
class Settings:
    home: Path
    python_timeout: float = 10
    output_limit: int = 65536
    upload_limit: int = 10 * 1024 * 1024
    sql_timeout: float = 3
    row_limit: int = 500

    @classmethod
    def from_env(cls):
        return cls(Path(os.environ.get('DATAFORGE_HOME', Path(__file__).resolve().parents[2] / 'storage')).resolve())

    def prepare(self):
        for name in ('', 'uploads', 'outputs', 'sessions'):
            (self.home / name).mkdir(parents=True, exist_ok=True)
