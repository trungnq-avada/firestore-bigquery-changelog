import type {FirestoreChange, FirestoreContext, WriteType, ChangelogRow} from './types';

export const toSnakeCase = (str: string): string =>
  str.replace(/([A-Z])/g, '_$1').replace(/^_/, '').toLowerCase();

export const getWriteType = (change: FirestoreChange): WriteType | undefined => {
  const before = change.before.exists;
  const after = change.after.exists;

  if (!before && after) return 'CREATE';
  if (before && after) return 'UPDATE';
  if (before && !after) return 'DELETE';
  return undefined;
};

export const generateDefaultRow = ({
  change,
  context,
  collectionId,
  projectId,
  appId
}: {
  change: FirestoreChange;
  context: FirestoreContext;
  collectionId: string;
  projectId: string;
  appId: string;
}): ChangelogRow => {
  const writeType = getWriteType(change);
  const currentData = change.after.data() || {};
  const beforeData = change.before.data() || {};
  const documentId = change.after.id;

  const isEmpty = (obj: Record<string, unknown>) => Object.keys(obj).length === 0;

  return {
    timestamp: context.timestamp,
    event_id: context?.eventId || '',
    document_name: `projects/${projectId}/databases/(default)/documents/${collectionId}/${documentId}`,
    operation: writeType,
    data: isEmpty(currentData) ? null : JSON.stringify(currentData),
    old_data: isEmpty(beforeData) ? null : JSON.stringify(beforeData),
    document_id: documentId,
    app_id: appId
  };
};

export const pickTriggerData = ({
  change,
  keys
}: {
  change: FirestoreChange;
  keys: string[];
}): Record<string, unknown> => {
  const afterData = (change.after.data() || {}) as Record<string, unknown>;
  const beforeData = (change.before.data() || {}) as Record<string, unknown>;

  return keys.reduce<Record<string, unknown>>((acc, key) => {
    acc[toSnakeCase(key)] = afterData[key] ?? beforeData[key] ?? null;
    return acc;
  }, {});
};
