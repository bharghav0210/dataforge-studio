from datetime import datetime, timezone
from uuid import uuid4
from sqlalchemy import String, Text, JSON, ForeignKey, Integer, Float
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


def uid():
    return str(uuid4())


def now():
    return datetime.now(timezone.utc).isoformat()


class Base(DeclarativeBase):
    pass


class Resource:
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    name: Mapped[str] = mapped_column(String(160))
    created_at: Mapped[str] = mapped_column(default=now)
    updated_at: Mapped[str] = mapped_column(default=now, onupdate=now)


class Notebook(Resource, Base):
    __tablename__ = 'notebooks'
    cells: Mapped[list['NotebookCell']] = relationship(cascade='all, delete-orphan', order_by='NotebookCell.position')


class NotebookCell(Base):
    __tablename__ = 'notebook_cells'
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    notebook_id: Mapped[str] = mapped_column(ForeignKey('notebooks.id', ondelete='CASCADE'), index=True)
    position: Mapped[int] = mapped_column(Integer)
    source: Mapped[str] = mapped_column(Text, default='')


class Dataset(Resource, Base):
    __tablename__ = 'datasets'
    filename: Mapped[str]
    original_name: Mapped[str]
    size: Mapped[int]
    rows: Mapped[int]
    columns: Mapped[list] = mapped_column(JSON)


class SavedQuery(Resource, Base):
    __tablename__ = 'saved_queries'
    sql: Mapped[str] = mapped_column(Text)


class Pipeline(Resource, Base):
    __tablename__ = 'pipelines'
    dataset_id: Mapped[str] = mapped_column(ForeignKey('datasets.id'), index=True)
    definition: Mapped[dict] = mapped_column(JSON)


class ExecutionRecord(Base):
    __tablename__ = 'execution_records'
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    kind: Mapped[str] = mapped_column(index=True)
    resource_id: Mapped[str | None]
    resource_name: Mapped[str]
    started_at: Mapped[str] = mapped_column(default=now, index=True)
    completed_at: Mapped[str | None]
    duration_ms: Mapped[float | None] = mapped_column(Float)
    status: Mapped[str] = mapped_column(default='running', index=True)
    error: Mapped[str | None] = mapped_column(Text)
    result: Mapped[dict | None] = mapped_column(JSON)
    output_reference: Mapped[str | None]


class PipelineRun(Base):
    __tablename__ = 'pipeline_runs'
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    pipeline_id: Mapped[str] = mapped_column(ForeignKey('pipelines.id', ondelete='CASCADE'), index=True)
    execution_id: Mapped[str] = mapped_column(ForeignKey('execution_records.id'), unique=True)
    input_rows: Mapped[int]
    output_rows: Mapped[int | None]
