import {DEFAULT_API_URL, DEFAULT_TIMEOUT} from './config';
import type {ChangelogTriggerConfig} from './types';

export const createApiClient = (config: ChangelogTriggerConfig) => {
  const apiUrl = config.apiUrl ?? DEFAULT_API_URL;
  const apiKey = config.apiKey;
  const customHeaders = config.headers ?? {};
  const timeout = config.timeout ?? DEFAULT_TIMEOUT;

  const sendRow = async (row: Record<string, unknown>, collectionId: string) => {
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
        body: JSON.stringify({collectionId, row}),
        signal: controller.signal
      });

      if (!response.ok) {
        throw new Error(`API request failed: ${response.status} ${response.statusText}`);
      }

      return response;
    } finally {
      clearTimeout(timeoutId);
    }
  };

  return {sendRow};
};
