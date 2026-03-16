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
- Built-in TypeScript support.

## Installation

```bash
npm install @avada/firestore-bigquery-changelog
```

## Basic Usage

### 1. Initialize the SDK

Only `appId` and `credentials` are required. Everything else has sensible defaults.

```typescript
import { createChangelogTrigger } from '@avada/firestore-bigquery-changelog';

const changelog = createChangelogTrigger({
  appId: 'orderLimit',
  credentials: require('./service-account.json'),
});
```

#### Credentials

The `credentials` field accepts three formats:

```typescript
// 1. JSON object — import or require a service account JSON file
const changelog = createChangelogTrigger({
  appId: 'orderLimit',
  credentials: require('./service-account.json'),
});

// 2. JSON string — e.g. from Firebase functions.config()
const changelog = createChangelogTrigger({
  appId: 'orderLimit',
  credentials: functions.config().bigquery.credentials,
  // where credentials = '{"project_id": "...", "private_key": "...", ...}'
});

// 3. Base64-encoded string — e.g. from environment variable or functions.config()
const changelog = createChangelogTrigger({
  appId: 'orderLimit',
  credentials: process.env.BIGQUERY_CREDENTIALS_BASE64,
  // where the value is a base64-encoded JSON string
});
```

The SDK auto-detects the format: tries JSON object first, then JSON string, then base64 decode.

#### Defaults

| Option | Default | Description |
| :--- | :--- | :--- |
| `appPrefix` | Auto from `appId` | First char + each uppercase char, lowercased. E.g. `orderLimit` → `ol`, `cookieBar` → `cb`, `seaAccessibility` → `sa`. Override by passing explicitly. |
| `datasetId` | `'churn_prediction'` | BigQuery dataset ID. |
| `projectId` | `'avada-crm'` | Firebase project ID. |

Table name format: `{appPrefix}_{collectionId}_changelog` (e.g. `ol_products_changelog`).

### 2. Set up Firestore Triggers

#### Firebase Functions V1

```typescript
import * as functions from 'firebase-functions';

// Simple: table name defaults to 'ol_products_changelog'
export const onProductWrite = functions.firestore
  .document('products/{productId}')
  .onWrite(changelog.onWrite({ collectionId: 'products' }));

// With custom destinations
export const onOrderWrite = functions.firestore
  .document('orders/{orderId}')
  .onWrite(changelog.onWrite({
    collectionId: 'orders',
    destinations: [
      { tableName: 'orders_raw' },
      { tableName: 'orders_analytics', pickKeys: ['status', 'total'] }
    ]
  }));
```

#### Firebase Functions V2

```typescript
import { onDocumentWritten } from 'firebase-functions/v2/firestore';

export const onOrderWriteV2 = onDocumentWritten('orders/{orderId}',
  changelog.onWriteV2({ collectionId: 'orders' })
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

### Logger

Pass a `logger` to `createChangelogTrigger` to enable debug logging. Any object with `info` and `error` methods works (e.g. `console`, `functions.logger`).

```typescript
import * as functions from 'firebase-functions';

const changelog = createChangelogTrigger({
  appId: 'orderLimit',
  credentials: functions.config().bigquery.credentials, // JSON string or base64
  logger: functions.logger,
});
```

### Handling Multiple Collections

If you have many collections to track, use `onWriteMany` or `onWriteManyV2`:

```typescript
const handlers = changelog.onWriteMany([
  { collectionId: 'settings' },
  { collectionId: 'profiles', destinations: [{ pickKeys: ['theme'] }] }
]);

// Each handler has { collectionId, handler }
// Register them as needed by your framework
```

## API Reference

### `createChangelogTrigger(config)`

| Option | Type | Description |
| :--- | :--- | :--- |
| `appId` | `string` | **Required**. Your application identifier (e.g. `'orderLimit'`). |
| `appPrefix` | `string` | Optional. Short prefix for table names (e.g. `'ol'`). Auto-generated from `appId` if not provided. Table name = `{appPrefix}_{collectionId}_changelog`. |
| `datasetId` | `string` | Optional. BigQuery dataset ID (default: `'churn_prediction'`). |
| `credentials` | `object \| string` | **Required**. Service account credentials. Accepts: JSON object (`require('./sa.json')`), JSON string, or base64-encoded string. Auto-detected. |
| `projectId` | `string` | Optional. Firebase project ID (default: `'avada-crm'`). |
| `changelogSchema` | `SchemaField[]` | Optional. Custom schema for changelog tables. |
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
- `onWriteMany()` / `onWriteManyV2()` return an array of `{ collectionId, handler }`.

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
