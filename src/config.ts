import type {SchemaField} from './types';

export const DEFAULT_CHANGELOG_SCHEMA: SchemaField[] = [
  {name: 'timestamp', type: 'TIMESTAMP'},
  {name: 'event_id', type: 'STRING'},
  {name: 'document_name', type: 'STRING'},
  {name: 'operation', type: 'STRING'},
  {name: 'data', type: 'STRING'},
  {name: 'old_data', type: 'STRING'},
  {name: 'document_id', type: 'STRING'},
  {name: 'app_id', type: 'STRING'}
];
