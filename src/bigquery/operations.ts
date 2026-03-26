import {BigQuery} from '@google-cloud/bigquery';
import {DEFAULT_CHANGELOG_SCHEMA} from '../config';
import type {SchemaField, TimePartitioning} from '../types';

function resolveTimePartitioning(
  tp?: boolean | TimePartitioning
): {type: string; field?: string; expirationMs?: string} | undefined {
  if (!tp) return undefined;
  if (tp === true) return {type: 'DAY', field: 'timestamp'};
  return {type: tp.type ?? 'DAY', field: tp.field ?? 'timestamp', ...(tp.expirationMs && {expirationMs: tp.expirationMs})};
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function ensureTableSchema(
  bigquery: BigQuery,
  datasetId: string,
  tableName: string,
  columns: string[],
  timePartitioning?: boolean | TimePartitioning
): Promise<void> {
  const dataset = bigquery.dataset(datasetId);
  const table = dataset.table(tableName);

  const [exists] = await table.exists();
  if (!exists) {
    const schema = columns.map(col => ({name: col, type: 'STRING'}));
    const options: Record<string, unknown> = {schema: {fields: schema}};
    const tp = resolveTimePartitioning(timePartitioning);
    if (tp) options.timePartitioning = tp;
    await dataset.createTable(tableName, options);
    return;
  }

  const [metadata] = await table.getMetadata();
  const existingFields = metadata.schema?.fields ?? [];
  const existingNames = new Set(existingFields.map((f: {name: string}) => f.name));
  const missingCols = columns.filter(col => !existingNames.has(col));

  if (!existingFields.length) {
    metadata.schema = {fields: columns.map(col => ({name: col, type: 'STRING'}))};
    await table.setMetadata(metadata);
  } else if (missingCols.length) {
    metadata.schema = {
      fields: [...existingFields, ...missingCols.map(col => ({name: col, type: 'STRING'}))]
    };
    await table.setMetadata(metadata);
  }
}

export async function insertRow(
  bigquery: BigQuery,
  datasetId: string,
  tableName: string,
  row: Record<string, unknown>,
  schema: SchemaField[] = DEFAULT_CHANGELOG_SCHEMA,
  timePartitioning?: boolean | TimePartitioning
): Promise<void> {
  const dataset = bigquery.dataset(datasetId);
  const table = dataset.table(tableName);

  const [tableExists] = await table.exists();
  if (!tableExists) {
    const options: Record<string, unknown> = {schema: {fields: schema}};
    const tp = resolveTimePartitioning(timePartitioning);
    if (tp) options.timePartitioning = tp;
    await dataset.createTable(tableName, options);
    await delay(3000);
  }

  const insertOpts = {ignoreUnknownValues: true, skipInvalidRows: false};
  try {
    await table.insert([row], insertOpts);
  } catch (err: unknown) {
    const bqErr = err as {errors?: Array<{reason: string}>};
    if (bqErr.errors?.some(e => e.reason === 'notFound')) {
      await delay(5000);
      await table.insert([row], insertOpts);
    } else {
      throw err;
    }
  }
}

export async function upsertRow(
  bigquery: BigQuery,
  datasetId: string,
  tableName: string,
  row: Record<string, unknown>,
  upsertKeys: string[],
  allColumns?: string[],
  timePartitioning?: boolean | TimePartitioning
): Promise<void> {
  for (const key of upsertKeys) {
    if (row[key] == null) {
      throw new Error(`upsertKey "${key}" not found in row`);
    }
  }

  row.updated_at = new Date().toISOString();
  const columns = Object.keys(row);

  const schemaColumns = allColumns ?? columns;
  await ensureTableSchema(bigquery, datasetId, tableName, schemaColumns, timePartitioning);

  const bt = (col: string) => `\`${col}\``;
  const onCondition = upsertKeys.map(key => `T.${bt(key)} = S.${bt(key)}`).join(' AND ');
  const updateSet = columns
    .filter(col => !upsertKeys.includes(col))
    .map(col => `T.${bt(col)} = S.${bt(col)}`)
    .join(', ');
  const insertCols = columns.map(bt).join(', ');
  const insertVals = columns.map(col => `S.${bt(col)}`).join(', ');

  const query = `
    MERGE \`${datasetId}.${tableName}\` T
    USING (SELECT ${columns.map(col => `@${col} AS ${bt(col)}`).join(', ')}) S
    ON ${onCondition}
    WHEN MATCHED THEN
      UPDATE SET ${updateSet}
    WHEN NOT MATCHED THEN
      INSERT (${insertCols}) VALUES (${insertVals})
  `;

  const params: Record<string, string | null> = {};
  const types: Record<string, string> = {};
  for (const col of columns) {
    const value = row[col] ?? null;
    params[col] = value == null ? null : String(value);
    types[col] = 'STRING';
  }

  await bigquery.query({query, params, types});
}
