export type Row = Record<string, string | number | boolean | null>;
export interface Preview {
  columns: string[];
  rows: Row[];
  row_count: number;
  truncated?: boolean;
  input_rows?: number;
  output_rows?: number;
  table?: string | null;
}
export interface Execution {
  id: string;
  kind: "python" | "sql" | "etl";
  resource_id: string | null;
  resource_name: string;
  status: string;
  started_at: string;
  completed_at: string | null;
  duration_ms: number | null;
  error: string | null;
  output_reference: string | null;
  result:
    | (Partial<Preview> & {
        stdout?: string;
        stderr?: string;
        replayed_cells?: number;
        sql?: string;
      })
    | null;
}
export interface Notebook {
  id: string;
  name: string;
  cells: { source: string }[];
  updated_at: string;
}
export interface Dataset {
  id: string;
  name: string;
  filename: string;
  original_name: string;
  size: number;
  rows: number;
  columns: { name: string; dtype: string; missing: number }[];
  created_at: string;
  preview?: Preview;
}
export type Operation =
  | "drop_duplicates"
  | "select"
  | "rename"
  | "fill_missing"
  | "drop_missing"
  | "filter";
export interface Transform {
  op: Operation;
  columns?: string[];
  mapping?: Record<string, string>;
  column?: string;
  value?: string | number;
  condition?: "eq" | "ne" | "gt" | "gte" | "lt" | "lte" | "contains";
}
export interface PipelineDefinition {
  name: string;
  dataset_id: string;
  destination: "csv" | "sqlite";
  table: string;
  steps: Transform[];
}
export interface Pipeline {
  id: string;
  name: string;
  definition: PipelineDefinition;
}
export interface SavedQuery {
  id: string;
  name: string;
  sql: string;
}
export interface SchemaTable {
  name: string;
  columns: { name: string; type: string }[];
}
export interface Dashboard {
  counts: Record<string, number>;
  recent: Execution[];
}
export interface Settings {
  version: string;
  backend: string;
  workspace_database: string;
  execution_mode: string;
  python_timeout_seconds: number;
  output_limit_bytes: number;
  memory_limit_mb: number;
  sql_timeout_seconds: number;
  upload_limit_bytes: number;
  result_row_limit: number;
  storage_location: string;
  security: string;
}
