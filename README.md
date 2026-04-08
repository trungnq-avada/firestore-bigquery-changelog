# @avada/firestore-bigquery-changelog

SDK to log Firestore document changelog directly to BigQuery. This package helps you track every change in your Firestore collections and sync them to BigQuery for analysis.

## Features

- Writes directly to BigQuery (no API proxy needed).
- Support for both Firebase Functions V1 and V2.
- Automatic `snake_case` conversion for picked fields.
- Customizable row transformation.
- Multiple destination tables per collection with independent config.
- Upsert (MERGE) mode with composite keys, field picking, and aliases.
- In-process mutex lock to prevent concurrent upsert race conditions.
- Auto table creation and schema migration (adds missing columns).
- Optional BigQuery time partitioning for better query performance and cost.
- Built-in TypeScript support.

## Installation

```bash
npm install @avada/firestore-bigquery-changelog
```

## Basic Usage

### 1. Initialize the SDK

Only `appId` is required. Everything else has sensible defaults.

#### Firebase Functions V1

```typescript
import * as functions from 'firebase-functions';
import { createChangelogTrigger, AVADA_APPS } from '@avada/firestore-bigquery-changelog';

const changelog = createChangelogTrigger({
  appId: AVADA_APPS.ORDER_LIMIT,
  credentials: functions.config().changelog_credentials,
});
```

#### Firebase Functions V2

```typescript
import { createChangelogTrigger, AVADA_APPS } from '@avada/firestore-bigquery-changelog';

const changelog = createChangelogTrigger({
  appId: AVADA_APPS.ORDER_LIMIT,
  credentials: process.env.CHANGELOG_CREDENTIALS,
});
```

#### Credentials

The `credentials` field accepts three formats (auto-detected):

- **JSON string** — e.g. from `functions.config()` (V1) or `process.env` (V2)
- **Base64-encoded string** — base64 of the JSON above
- **JSON object** — e.g. `require('./service-account.json')`

When omitted, the SDK uses `new BigQuery()` which picks up the default service account automatically (e.g. the Firebase project's service account).

#### Defaults

| Option | Default | Description |
| :--- | :--- | :--- |
| `appPrefix` | Same as `appId` | E.g. `orderLimit` → table `orderLimit_products_changelog`. Override by passing explicitly. |
| `datasetId` | `'product_data_analytics'` | BigQuery dataset ID. |
| `projectId` | `'avada-crm'` | Firebase project ID. |

Table name format: `{appPrefix}_{collectionId}_changelog` (e.g. `orderLimit_products_changelog`).

### 2. Set up Firestore Triggers

#### Firebase Functions V1

```typescript
import * as functions from 'firebase-functions';

export const onProductWrite = functions.firestore
  .document('products/{productId}')
  .onWrite(changelog.onWrite({ collectionId: 'products' }));
```

#### Firebase Functions V2

```typescript
import { onDocumentWritten } from 'firebase-functions/v2/firestore';

export const onProductWriteV2 = onDocumentWritten('products/{productId}',
  changelog.onWriteV2({ collectionId: 'products' })
);
```

## Advanced Configuration

### Multiple Destination Tables

Use `destinations` to write a single collection's changes to multiple BigQuery tables, each with its own `pickKeys`, `upsertKeys`, and `transformRow`.

```typescript
changelog.onWrite({
  collectionId: 'shops',
  destinations: [
    {
      tableName: 'shops_changelog',
      pickKeys: ['name', 'status'],
    },
    {
      tableName: 'avada_customers',
      upsertKeys: ['shopifyDomain'],
      pickKeys: ['shopifyDomain', 'email', 'plan'],
    },
  ],
})
```

### Upsert Mode (MERGE)

Use `upsertKeys` on a destination to enable upsert mode. Instead of appending a new row for every change, the SDK will MERGE (insert or update) based on the specified keys.

This is useful for maintaining a single row per entity (e.g., a CRM table with one row per shop).

```typescript
changelog.onWriteV2({
  collectionId: 'shops',
  destinations: [
    {
      tableName: 'avada_customers',
      upsertKeys: ['shopifyDomain'],
    },
  ],
})
```

When `upsertKeys` is set:
- MERGE uses `ON` condition with all upsert keys (auto-converted to `snake_case`).
- DELETE operations are skipped (no data to merge).
- An `updated_at` timestamp is automatically added.
- Fields not present in the document are left unchanged in BigQuery.

### Upsert with Field Picking and Aliases

For more control over upsert behavior, use `upsertConfig` to specify which fields to pick from the document `data` JSON, and define field aliases for flexible matching.

```typescript
changelog.onWrite({
  collectionId: 'shops',
  destinations: [
    {
      tableName: 'avada_customers',
      upsertConfig: {
        upsertKeys: ['shopifyDomain'],
        pickKeys: ['shopifyDomain', 'email', 'name', 'country', 'planDisplayName'],
        fieldAliases: {
          shopifyDomain: ['myshopifyDomain'],
        },
      },
    },
  ],
})
```

### Custom Data Transformation

Use `transformRow` to modify the data before writing to BigQuery. This is useful for formatting dates, calculating fields, or cleaning up data.

```typescript
changelog.onWrite({
  collectionId: 'users',
  destinations: [
    {
      tableName: 'users',
      transformRow: (row) => ({
        ...row,
        full_name: `${row.first_name} ${row.last_name}`,
        processed_at: new Date().toISOString()
      }),
    },
  ],
})
```

### Time Partitioning

BigQuery [time partitioning](https://cloud.google.com/bigquery/docs/partitioned-tables) is **enabled by default** (DAY partition on `timestamp` field) for better query performance and lower costs on large tables.

```typescript
// Default — already partitioned by `timestamp` (DAY), no config needed
const changelog = createChangelogTrigger({
  appId: AVADA_APPS.ORDER_LIMIT,
});

// Custom — partition by MONTH with 90-day expiration
const changelog = createChangelogTrigger({
  appId: AVADA_APPS.ORDER_LIMIT,
  timePartitioning: {
    type: 'MONTH',
    field: 'timestamp',
    expirationMs: '7776000000', // 90 days
  },
});

// Disable partitioning
const changelog = createChangelogTrigger({
  appId: AVADA_APPS.ORDER_LIMIT,
  timePartitioning: false,
});
```

| Option | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `type` | `'DAY' \| 'HOUR' \| 'MONTH' \| 'YEAR'` | `'DAY'` | Partition granularity. |
| `field` | `string` | `'timestamp'` | TIMESTAMP field to partition on. |
| `expirationMs` | `string` | — | Auto-delete partitions older than this (in milliseconds). |

> **Note:** Partitioning is only applied when creating new tables. Existing tables are not affected — you must drop and recreate them to change partitioning.

### Logger

Pass a `logger` to `createChangelogTrigger` to enable debug logging. Any object with `info` and `error` methods works (e.g. `console`, `functions.logger`).

```typescript
// V1
import * as functions from 'firebase-functions';

const changelog = createChangelogTrigger({
  appId: AVADA_APPS.ORDER_LIMIT,
  credentials: functions.config().changelog_credentials,
  logger: functions.logger,
});

// V2
const changelog = createChangelogTrigger({
  appId: AVADA_APPS.ORDER_LIMIT,
  credentials: process.env.CHANGELOG_CREDENTIALS,
  logger: console,
});
```

## API Reference

### `createChangelogTrigger(config)`

| Option | Type | Description |
| :--- | :--- | :--- |
| `appId` | `AppId` | **Required**. Use `AVADA_APPS.*` constant (e.g. `AVADA_APPS.ORDER_LIMIT`). |
| `appPrefix` | `string` | Optional. Defaults to `appId` value. Table name = `{appPrefix}_{collectionId}_changelog`. |
| `datasetId` | `string` | Optional. BigQuery dataset ID (default: `'product_data_analytics'`). |
| `credentials` | `object \| string` | Optional. Service account credentials. Omit to use default credentials (`new BigQuery()`). Accepts: JSON object, JSON string, or base64-encoded string. Auto-detected. |
| `projectId` | `string` | Optional. Firebase project ID (default: `'avada-crm'`). |
| `changelogSchema` | `SchemaField[]` | Optional. Custom schema for changelog tables. |
| `timePartitioning` | `boolean \| TimePartitioning` | Optional. Default: `true` (DAY partition on `timestamp`). Pass object to customize, or `false` to disable. |
| `logger` | `Logger` | Optional. Logger instance for debugging (must have `info` and `error` methods). |

### `CollectionConfig`

| Option | Type | Description |
| :--- | :--- | :--- |
| `collectionId` | `string` | **Required**. Firestore collection name. |
| `destinations` | `DestinationConfig[]` | Optional. Array of destination tables. Defaults to a single append-only changelog table. |

### `DestinationConfig`

| Option | Type | Description |
| :--- | :--- | :--- |
| `tableName` | `string` | Optional. BigQuery destination table name. Defaults to `{appPrefix}_{collectionId}_changelog`. |
| `pickKeys` | `string[]` | Optional. Fields to extract from the document as extra columns (auto `snake_case`). |
| `upsertKeys` | `string[]` | Optional. camelCase field names for MERGE mode. When set, SDK will upsert instead of insert. |
| `upsertConfig` | `UpsertConfig` | Optional. Advanced upsert config with `pickKeys`, `fieldAliases`, and `upsertKeys`. |
| `transformRow` | `function` | Optional. Async/sync function to modify the row before writing. |

### `UpsertConfig`

| Option | Type | Description |
| :--- | :--- | :--- |
| `upsertKeys` | `string[]` | **Required**. camelCase field names used as MERGE keys. |
| `pickKeys` | `string[]` | **Required**. Fields to pick from the `data` JSON for the upsert row. |
| `fieldAliases` | `Record<string, string[]>` | Optional. Alternative field names to match in the document data. |

### Return Values

- `onWrite()` / `onWriteV2()` return handlers that resolve to `DestinationResult[]`, where each result contains `{ table, skipped?, error? }`.

## Project Structure

```
src/
  index.ts                  — Public exports
  config.ts                 — Default changelog schema
  types.ts                  — All TypeScript interfaces
  utils.ts                  — Helpers (toSnakeCase, getWriteType, generateDefaultRow, pickTriggerData)
  createChangelogTrigger.ts — Main trigger factory
  bigquery/
    index.ts                — Barrel export
    credentials.ts          — Credential parsing & BigQuery client construction
    operations.ts           — Table schema management, insertRow, upsertRow
    upsertLock.ts           — In-process mutex for upsert serialization
    destinationProcessor.ts — Destination routing & processing
```

## Development

### Building the project

```bash
npm run build
```

### Publishing to NPM

1. Update the `version` in `package.json`.
2. Publish:
   ```bash
   npm publish --access public
   ```
   The `prepublishOnly` script will automatically run `npm run build` before publishing.

## License

MIT
