from typing import Literal, Annotated
from pydantic import BaseModel, Field, ConfigDict, model_validator, StringConstraints


Name = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=160)]


class Strict(BaseModel):
    model_config = ConfigDict(extra='forbid')


class Cell(Strict):
    source: str = Field(default='', max_length=100000)


class NotebookInput(Strict):
    name: Name
    cells: list[Cell] = Field(default_factory=lambda: [Cell()], max_length=100)


class PythonInput(Strict):
    notebook_id: str
    cell_index: int | None = Field(default=None, ge=0)


class QueryInput(Strict):
    sql: str = Field(min_length=1, max_length=50000)
    allow_write: bool = False


class SavedQueryInput(Strict):
    name: Name
    sql: str = Field(min_length=1, max_length=50000)


class TableInput(Strict):
    table: str = Field(pattern=r'^[A-Za-z][A-Za-z0-9_]{0,62}$')


class Transform(Strict):
    op: Literal['drop_duplicates', 'select', 'rename', 'fill_missing', 'drop_missing', 'filter']
    columns: list[str] = Field(default_factory=list, max_length=100)
    mapping: dict[str, str] = Field(default_factory=dict)
    column: str | None = None
    value: str | float | int | bool | None = None
    condition: Literal['eq', 'ne', 'gt', 'gte', 'lt', 'lte', 'contains'] = 'eq'

    @model_validator(mode='after')
    def required_fields(self):
        if self.op == 'select' and not self.columns:
            raise ValueError('Select requires columns')
        if self.op == 'rename' and (not self.mapping or any(not v.strip() for v in self.mapping.values())):
            raise ValueError('Rename requires nonempty column names')
        if self.op in ('filter', 'fill_missing') and (not self.column or self.value is None):
            raise ValueError('Filter/fill requires a column and value')
        return self


class PipelineInput(TableInput):
    name: Name
    dataset_id: str
    steps: list[Transform] = Field(default_factory=list, max_length=30)
    destination: Literal['csv', 'sqlite'] = 'csv'
    table: str = Field(default='processed_sales', pattern=r'^[A-Za-z][A-Za-z0-9_]{0,62}$')
