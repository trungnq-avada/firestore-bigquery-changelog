import {createApiClient} from './apiClient';
import {generateDefaultRow, pickTriggerData} from './utils';
import type {
  ChangelogTriggerConfig,
  CollectionConfig,
  FirestoreChange,
  FirestoreContext,
  FirestoreEvent
} from './types';

export const createChangelogTrigger = (inputConfig: ChangelogTriggerConfig) => {
  const config = {...inputConfig, projectId: inputConfig.projectId ?? 'avada-crm'};
  const logger = config.logger;
  const {sendRow} = createApiClient(config);

  const onWrite = (collectionConfig: CollectionConfig) => {
    const {collectionId} = collectionConfig;
    const destinations = collectionConfig.destinations ?? [{tableName: collectionId}];

    return async (change: FirestoreChange, context: FirestoreContext): Promise<boolean> => {
      const baseRow = generateDefaultRow({
        change,
        context,
        collectionId,
        projectId: config.projectId,
        appId: config.appId
      });

      const destinationsPayload = await Promise.all(
        destinations.map(async (dest) => {
          const pickKeys = dest.pickKeys ?? [];
          let row = {
            ...baseRow,
            ...(pickKeys.length > 0 ? pickTriggerData({change, keys: pickKeys}) : {})
          };

          if (dest.transformRow) {
            row = await dest.transformRow(row);
          }

          return {tableName: dest.tableName, upsertKeys: dest.upsertKeys, row};
        })
      );

      logger?.debug?.(`[changelog] ${collectionId} → ${destinations.map(d => d.tableName).join(', ')}`);
      await sendRow(collectionId, destinationsPayload);
      logger?.info?.(`[changelog] ${collectionId}: sent ${destinationsPayload.length} destination(s)`);
      return true;
    };
  };

  const onWriteV2 = (collectionConfig: CollectionConfig) => {
    const handler = onWrite(collectionConfig);

    return async (event: FirestoreEvent): Promise<boolean> => {
      if (!event.data) return false;
      return handler(event.data, {timestamp: event.time, eventId: event.id});
    };
  };

  const onWriteMany = (collectionConfigs: CollectionConfig[]) => {
    const handlers = collectionConfigs.map(cfg => ({
      collectionId: cfg.collectionId,
      handler: onWrite(cfg)
    }));

    return handlers;
  };

  const onWriteManyV2 = (collectionConfigs: CollectionConfig[]) => {
    return collectionConfigs.map(cfg => ({
      collectionId: cfg.collectionId,
      handler: onWriteV2(cfg)
    }));
  };

  return {onWrite, onWriteV2, onWriteMany, onWriteManyV2};
};
