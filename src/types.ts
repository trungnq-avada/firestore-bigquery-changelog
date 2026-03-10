export interface Logger {
  info: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
  warn?: (...args: unknown[]) => void;
  debug?: (...args: unknown[]) => void;
}

export interface ChangelogTriggerConfig {
  /** Application ID */
  appId: string;
  /** Firebase project ID. Default: 'avada-crm' */
  projectId?: string;
  /** API endpoint URL to send changelog data. Uses default from config if not provided. */
  apiUrl?: string;
  /** API key for authentication (sent as x-api-key header). */
  apiKey: string;
  /** Custom headers to include in API requests */
  headers?: Record<string, string>;
  /** Request timeout in milliseconds. Default: 10000 */
  timeout?: number;
  /** Optional logger for debugging. */
  logger?: Logger;
}

export interface DestinationConfig {
  /** Destination table name on BigQuery. */
  tableName: string;
  /** Fields to pick from the document and add as extra columns (auto snake_case). */
  pickKeys?: string[];
  /** camelCase key fields for upsert mode. When set, API will MERGE instead of INSERT. */
  upsertKeys?: string[];
  /** Custom transform function to modify the row before sending. */
  transformRow?: (row: ChangelogRow) => ChangelogRow | Promise<ChangelogRow>;
}

export interface CollectionConfig {
  /** Firestore collection ID (e.g. 'purchaseActivities') */
  collectionId: string;
  /** Destination tables to write to. Each destination can have its own pickKeys, upsertKeys, and transformRow.
   * Defaults to [{ tableName: collectionId }] if not provided. */
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
