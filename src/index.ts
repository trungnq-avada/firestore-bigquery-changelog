export {createChangelogTrigger} from './createChangelogTrigger';
export {DEFAULT_API_URL, DEFAULT_TIMEOUT} from './config';
export {getWriteType, toSnakeCase, generateDefaultRow, pickTriggerData} from './utils';
export type {
  ChangelogTriggerConfig,
  CollectionConfig,
  ChangelogRow,
  WriteType,
  FirestoreChange,
  FirestoreContext,
  FirestoreDocSnapshot,
  FirestoreEvent
} from './types';
