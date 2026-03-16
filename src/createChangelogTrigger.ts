import {createBigQueryClient, createDestinationProcessor} from './bigquery';
import {generateAppPrefix, generateDefaultRow, pickTriggerData} from './utils';
import type {
  ChangelogTriggerConfig,
  CollectionConfig,
  FirestoreChange,
  FirestoreContext,
  FirestoreEvent,
  DestinationResult
} from './types';

export const createChangelogTrigger = (inputConfig: ChangelogTriggerConfig) => {
  const appPrefix = inputConfig.appPrefix ?? generateAppPrefix(inputConfig.appId);
  const datasetId = inputConfig.datasetId ?? 'churn_prediction';
  const config = {...inputConfig, projectId: inputConfig.projectId ?? 'avada-crm', appPrefix, datasetId};
  const logger = config.logger;

  const bigquery = createBigQueryClient(config.credentials);
  const processor = createDestinationProcessor({
    bigquery,
    datasetId: config.datasetId,
    appPrefix: config.appPrefix,
    changelogSchema: config.changelogSchema,
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

  const onWriteV2 = (collectionConfig: CollectionConfig) => {
    const handler = onWrite(collectionConfig);

    return async (event: FirestoreEvent): Promise<DestinationResult[] | false> => {
      if (!event.data) return false;
      return handler(event.data, {timestamp: event.time, eventId: event.id});
    };
  };

  const onWriteMany = (collectionConfigs: CollectionConfig[]) => {
    return collectionConfigs.map(cfg => ({
      collectionId: cfg.collectionId,
      handler: onWrite(cfg)
    }));
  };

  const onWriteManyV2 = (collectionConfigs: CollectionConfig[]) => {
    return collectionConfigs.map(cfg => ({
      collectionId: cfg.collectionId,
      handler: onWriteV2(cfg)
    }));
  };

  return {onWrite, onWriteV2, onWriteMany, onWriteManyV2};
};
