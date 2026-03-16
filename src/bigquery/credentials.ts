import {BigQuery} from '@google-cloud/bigquery';

export function parseCredentials(input: Record<string, unknown> | string): Record<string, unknown> {
  if (typeof input === 'object' && input !== null) {
    return input;
  }

  // Try JSON string first
  try {
    return JSON.parse(input);
  } catch {
    // Try base64 decode
    try {
      const decoded = Buffer.from(input, 'base64').toString('utf-8');
      return JSON.parse(decoded);
    } catch {
      throw new Error('credentials must be a JSON object, JSON string, or base64-encoded JSON string');
    }
  }
}

export function createBigQueryClient(credentials: Record<string, unknown> | string): BigQuery {
  const parsed = parseCredentials(credentials);
  return new BigQuery({
    projectId: parsed.project_id as string,
    credentials: parsed
  });
}
