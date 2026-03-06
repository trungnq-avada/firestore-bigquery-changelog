import {createApiClient} from './apiClient';
import {generateDefaultRow, pickTriggerData} from './utils';
import type {
  ChangelogTriggerConfig,
  CollectionConfig,
  FirestoreChange,
  FirestoreContext,
  FirestoreEvent
} from './types';

export const createChangelogTrigger = (config: ChangelogTriggerConfig) => {
  const {sendRow} = createApiClient(config);

  const onWrite = (collectionConfig: CollectionConfig) => {
    const {collectionId, pickKeys = [], transformRow} = collectionConfig;

    return async (change: FirestoreChange, context: FirestoreContext): Promise<boolean> => {
      const defaultRow = generateDefaultRow({
        change,
        context,
        collectionId,
        projectId: config.projectId,
        appId: config.appId
      });

      let row = {
        ...defaultRow,
        ...(pickKeys.length > 0 ? pickTriggerData({change, keys: pickKeys}) : {})
      };

      if (transformRow) {
        row = await transformRow(row);
      }

      await sendRow(row, collectionId);
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
