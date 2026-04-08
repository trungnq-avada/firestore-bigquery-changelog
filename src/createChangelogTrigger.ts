import {createBigQueryClient, createDestinationProcessor} from './bigquery';
import {generateDefaultRow, pickTriggerData} from './utils';
// eslint-disable-next-line deprecation/deprecation
import {APP_ID_ALIASES} from './types';
import type {
  AppId,
  ChangelogTriggerConfig,
  CollectionConfig,
  FirestoreChange,
  FirestoreContext,
  FirestoreEvent,
  DestinationResult
} from './types';

const resolveAppId = (appId: AppId): Exclude<AppId, keyof typeof APP_ID_ALIASES> =>
  (APP_ID_ALIASES as Record<string, string>)[appId] as Exclude<AppId, keyof typeof APP_ID_ALIASES> ?? appId;

export const createChangelogTrigger = (inputConfig: ChangelogTriggerConfig) => {
  const appId = resolveAppId(inputConfig.appId);
  const appPrefix = inputConfig.appPrefix ?? appId;
  const datasetId = inputConfig.datasetId ?? 'product_data_analytics';
  const config = {...inputConfig, appId, projectId: inputConfig.projectId ?? 'avada-crm', appPrefix, datasetId};
  const logger = config.logger;

  const bigquery = createBigQueryClient(config.credentials);
  const processor = createDestinationProcessor({
    bigquery,
    datasetId: config.datasetId,
    appPrefix: config.appPrefix,
    changelogSchema: config.changelogSchema,
    timePartitioning: config.timePartitioning ?? true,
    logger
  });

  const onWrite = (collectionConfig: CollectionConfig) => {
    const {collectionId} = collectionConfig;
    const destinations = collectionConfig.destinations ?? [{}];

    return async (change: FirestoreChange, context: FirestoreContext): Promise<DestinationResult[]> => {
      const baseRow = generateDefaultRow({
        change,
        context,
        collectionId,
        projectId: config.projectId,
        appId: config.appId
      });

      const processedDestinations = await Promise.all(
        destinations.map(async (dest) => {
          const pickKeys = dest.pickKeys ?? [];
          let row = {
            ...baseRow,
            ...(pickKeys.length > 0 ? pickTriggerData({change, keys: pickKeys}) : {})
          };

          if (dest.transformRow) {
            row = await dest.transformRow(row);
          }

          return {
            tableName: dest.tableName ?? processor.resolveTableName(collectionId),
            upsertKeys: dest.upsertKeys,
            upsertConfig: dest.upsertConfig,
            row
          };
        })
      );

      logger?.debug?.(`[changelog] ${collectionId} → ${processedDestinations.map(d => d.tableName).join(', ')}`);
      const results = await processor.processDestinations(collectionId, processedDestinations);
      logger?.info?.(`[changelog] ${collectionId}: wrote ${results.length} destination(s)`);
      return results;
    };
  };

  /**
   * V2 handler — accepts both calling conventions:
   * 1. Raw V2 event:        onWriteV2()(event)           — from onDocumentWritten()
   * 2. Pre-wrapped V1 args: onWriteV2()(change, context) — from apps using a V2→V1 wrapper
   */
  const onWriteV2 = (collectionConfig: CollectionConfig) => {
    const handler = onWrite(collectionConfig);

    return async (eventOrChange: FirestoreEvent | FirestoreChange, context?: FirestoreContext): Promise<DestinationResult[] | false> => {
      // Already unwrapped by app-level wrapper → forward to V1 handler directly
      if (context && 'before' in eventOrChange && 'after' in eventOrChange) {
        return handler(eventOrChange as FirestoreChange, context);
      }
      // Raw V2 event → unwrap and forward
      const event = eventOrChange as FirestoreEvent;
      if (!event.data) return false;
      return handler(event.data, {timestamp: event.time, eventId: event.id});
    };
  };

  return {onWrite, onWriteV2};
};
