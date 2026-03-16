export {createChangelogTrigger} from './createChangelogTrigger';
export {DEFAULT_CHANGELOG_SCHEMA} from './config';
export {createBigQueryClient, parseCredentials} from './bigquery';
export {getWriteType, toSnakeCase, generateDefaultRow, pickTriggerData} from './utils';
export type {
  ChangelogTriggerConfig,
  CollectionConfig,
  DestinationConfig,
  Logger,
  ChangelogRow,
  WriteType,
  SchemaField,
  UpsertConfig,
  DestinationResult,
  FirestoreChange,
  FirestoreContext,
  FirestoreDocSnapshot,
  FirestoreEvent
} from './types';
