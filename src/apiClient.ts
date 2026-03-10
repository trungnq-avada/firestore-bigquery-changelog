import {DEFAULT_API_URL, DEFAULT_TIMEOUT} from './config';
import type {ChangelogTriggerConfig} from './types';

export const createApiClient = (config: ChangelogTriggerConfig) => {
  const apiUrl = config.apiUrl ?? DEFAULT_API_URL;
  const apiKey = config.apiKey;
  const customHeaders = config.headers ?? {};
  const timeout = config.timeout ?? DEFAULT_TIMEOUT;
  const logger = config.logger;

  const sendRow = async (
    collectionId: string,
    destinations: Array<{tableName: string; upsertKeys?: string[]; row: Record<string, unknown>}>
  ) => {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      ...customHeaders
    };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify({collectionId, destinations}),
        signal: controller.signal
      });

      if (!response.ok) {
        const error = `API request failed: ${response.status} ${response.statusText}`;
        logger?.error?.(`[changelog] ${error}`);
        throw new Error(error);
      }

      return response;
    } finally {
      clearTimeout(timeoutId);
    }
  };

  return {sendRow};
};
