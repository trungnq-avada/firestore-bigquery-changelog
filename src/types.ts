export interface Logger {
  info: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
  warn?: (...args: unknown[]) => void;
  debug?: (...args: unknown[]) => void;
}

export interface ChangelogTriggerConfig {
  /** Application ID */
  appId: string;
  /** Short prefix for auto-generating table names. E.g. 'ol' for orderLimit, 'cb' for cookieBar.
   * Auto-generated from appId if not provided (first char + each uppercase char, lowercased).
   * Default table name = `{appPrefix}_{collectionId}_changelog` */
  appPrefix?: string;
  /** Firebase project ID. Default: 'avada-crm' */
  projectId?: string;
  /** BigQuery dataset ID. Default: 'churn_prediction' */
  datasetId?: string;
  /** Service account credentials (auto-detected format). Accepts:
   * - JSON object: `require('./service-account.json')`
   * - JSON string: `'{"project_id": "...", "private_key": "...", ...}'`
   * - Base64-encoded string: base64 of the JSON above (e.g. from env vars or functions.config())
   */
  credentials: Record<string, unknown> | string;
  /** Custom schema for changelog tables */
  changelogSchema?: SchemaField[];
  /** Optional logger for debugging. */
  logger?: Logger;
}

export interface SchemaField {
  name: string;
  type: string;
}

export interface UpsertConfig {
  upsertKeys: string[];
  pickKeys: string[];
  fieldAliases?: Record<string, string[]>;
}

export interface DestinationConfig {
  /** Destination table name on BigQuery. Defaults to `{appPrefix}_{collectionId}_changelog` */
  tableName?: string;
  /** Fields to pick from the document and add as extra columns (auto snake_case). */
  pickKeys?: string[];
  /** camelCase key fields for upsert mode. When set, SDK will MERGE instead of INSERT. */
  upsertKeys?: string[];
  /** Upsert configuration with pickKeys, fieldAliases, etc. */
  upsertConfig?: UpsertConfig;
  /** Custom transform function to modify the row before writing. */
  transformRow?: (row: ChangelogRow) => ChangelogRow | Promise<ChangelogRow>;
}

export interface CollectionConfig {
  /** Firestore collection ID (e.g. 'purchaseActivities') */
  collectionId: string;
  /** Destination tables to write to. Each destination can have its own pickKeys, upsertKeys, and transformRow.
   * Defaults to a single append-only changelog table if not provided. */
  destinations?: DestinationConfig[];
}

export interface ChangelogRow {
  timestamp: string;
  event_id: string;
  document_name: string;
  operation: WriteType | undefined;
  data: string | null;
  old_data: string | null;
  document_id: string;
  app_id: string;
  [key: string]: unknown;
}

export type WriteType = 'CREATE' | 'UPDATE' | 'DELETE';

export interface FirestoreChange {
  before: FirestoreDocSnapshot;
  after: FirestoreDocSnapshot;
}

export interface FirestoreDocSnapshot {
  exists: boolean;
  id: string;
  data: () => Record<string, unknown> | undefined;
}

export interface FirestoreContext {
  timestamp: string;
  eventId?: string;
}

/** V2 FirestoreEvent shape (from firebase-functions/v2/firestore) */
export interface FirestoreEvent<T = FirestoreChange | undefined> {
  id: string;
  time: string;
  data: T;
  [key: string]: unknown;
}

export interface DestinationResult {
  table: string;
  skipped?: boolean;
  error?: string;
}
