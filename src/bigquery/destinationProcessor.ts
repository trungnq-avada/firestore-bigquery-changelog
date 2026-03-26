import type {BigQuery} from '@google-cloud/bigquery';
import {insertRow, upsertRow} from './operations';
import {withUpsertLock} from './upsertLock';
import {DEFAULT_CHANGELOG_SCHEMA} from '../config';
import {toSnakeCase} from '../utils';
import type {SchemaField, UpsertConfig, Logger, DestinationResult, TimePartitioning} from '../types';

export interface ProcessedDestination {
  tableName: string;
  row: Record<string, unknown>;
  upsertKeys?: string[];
  upsertConfig?: UpsertConfig;
}

function pickFieldsFromData(
  data: string | Record<string, unknown> | null,
  pickKeys: string[],
  fieldAliases?: Record<string, string[]>
): Record<string, unknown> {
  if (!data) return {};

  const parsed = typeof data === 'string' ? JSON.parse(data) : data;
  const result: Record<string, unknown> = {};

  for (const key of pickKeys) {
    if (key in parsed) {
      result[toSnakeCase(key)] = parsed[key];
    } else if (fieldAliases?.[key]) {
      const alias = fieldAliases[key].find(a => a in parsed);
      if (alias) {
        result[toSnakeCase(key)] = parsed[alias];
      }
    }
  }

  return result;
}

interface UpsertFields {
  pickedFields: Record<string, unknown>;
  snakeKeys: string[];
  allColumns: string[];
}

function buildFromUpsertConfig(row: Record<string, unknown>, upsertConfig: UpsertConfig): UpsertFields {
  const pickedFields = pickFieldsFromData(
    row.data as string | null,
    upsertConfig.pickKeys,
    upsertConfig.fieldAliases
  );
  for (const key of upsertConfig.pickKeys) {
    const snakeKey = toSnakeCase(key);
    if (!(snakeKey in pickedFields) && key in row) {
      pickedFields[snakeKey] = row[key];
    }
  }
  return {
    pickedFields,
    snakeKeys: upsertConfig.upsertKeys.map(toSnakeCase),
    allColumns: [...upsertConfig.pickKeys.map(toSnakeCase), 'updated_at']
  };
}

function buildFromSchema(
  row: Record<string, unknown>,
  upsertKeys: string[],
  changelogSchema: SchemaField[]
): UpsertFields {
  const {old_data: _, operation: __, ...upsertRowData} = row;
  const excludeFields = new Set(['old_data', 'operation']);
  const upsertSchemaFields = changelogSchema.filter(f => !excludeFields.has(f.name));
  return {
    pickedFields: upsertRowData,
    snakeKeys: upsertKeys.map(toSnakeCase),
    allColumns: [...upsertSchemaFields.map(f => f.name), 'updated_at']
  };
}

function buildUpsertFields(
  row: Record<string, unknown>,
  upsertKeys: string[],
  changelogSchema: SchemaField[],
  upsertConfig?: UpsertConfig
): UpsertFields {
  if (upsertConfig) {
    return buildFromUpsertConfig(row, upsertConfig);
  }
  return buildFromSchema(row, upsertKeys, changelogSchema);
}

export function createDestinationProcessor(config: {
  bigquery: BigQuery;
  datasetId: string;
  appPrefix: string;
  changelogSchema?: SchemaField[];
  timePartitioning?: boolean | TimePartitioning;
  logger?: Logger;
}) {
  const {bigquery, datasetId, appPrefix, logger, timePartitioning} = config;
  const changelogSchema = config.changelogSchema ?? DEFAULT_CHANGELOG_SCHEMA;

  function resolveTableName(collectionId: string, tableName?: string): string {
    if (tableName) return tableName;
    return `${appPrefix}_${collectionId}_changelog`;
  }

  async function processUpsertDestination(
    tableName: string,
    row: Record<string, unknown>,
    upsertKeys: string[],
    upsertConfig?: UpsertConfig
  ): Promise<DestinationResult> {
    if (row.operation === 'DELETE' || !row.data) {
      return {table: tableName, skipped: true};
    }

    const {pickedFields, snakeKeys, allColumns} = buildUpsertFields(
      row,
      upsertKeys,
      changelogSchema,
      upsertConfig
    );

    const missingKey = snakeKeys.find(key => pickedFields[key] == null);
    if (missingKey) {
      return {table: tableName, skipped: true};
    }

    const lockKey = snakeKeys.map(k => pickedFields[k]).join('::');
    await withUpsertLock(lockKey, () =>
      upsertRow(bigquery, datasetId, tableName, pickedFields, snakeKeys, allColumns, timePartitioning)
    );

    return {table: tableName};
  }

  async function processDestination(
    dest: ProcessedDestination,
    collectionId: string
  ): Promise<DestinationResult> {
    const tableName = resolveTableName(collectionId, dest.tableName);
    const {upsertKeys, row, upsertConfig} = dest;

    if (!row) {
      return {table: tableName, error: 'Missing row data'};
    }

    if (upsertKeys?.length) {
      return processUpsertDestination(tableName, row, upsertKeys, upsertConfig);
    }

    await insertRow(bigquery, datasetId, tableName, row, changelogSchema, timePartitioning);
    return {table: tableName};
  }

  async function processDestinations(
    collectionId: string,
    destinations: ProcessedDestination[]
  ): Promise<DestinationResult[]> {
    const results: DestinationResult[] = [];

    for (const dest of destinations) {
      try {
        const result = await processDestination(dest, collectionId);
        results.push(result);
      } catch (err: unknown) {
        const error = err instanceof Error ? err.message : String(err);
        logger?.error?.(`[changelog] BigQuery error for destination:`, error);
        results.push({table: dest.tableName || 'unknown', error});
      }
    }

    return results;
  }

  return {processDestinations, resolveTableName};
}
