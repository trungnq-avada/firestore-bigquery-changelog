# @avada/firestore-bigquery-changelog

SDK to log Firestore document changelog to an API (BigQuery Proxy). This package helps you track every change in your Firestore collections and sync them to BigQuery for analysis.

## Features

- Support for both Firebase Functions V1 and V2.
- Automatic `snake_case` conversion for picked fields.
- Customizable row transformation.
- Multiple destination tables per collection with independent config.
- Upsert (MERGE) mode with composite keys support.
- Efficient batch handling.
- Built-in TypeScript support.

## Installation

```bash
npm install @avada/firestore-bigquery-changelog
```

## Basic Usage

### 1. Initialize the SDK

First, create a trigger instance with your project configuration.

```typescript
import { createChangelogTrigger } from '@avada/firestore-bigquery-changelog';

const changelog = createChangelogTrigger({
  appId: 'your-app-id', // orderLimit, cookieBar
  apiKey: 'your-api-key',
  // projectId defaults to 'avada-crm'
  // Optional: apiUrl if not using environment defaults
});
```

### 2. Set up Firestore Triggers

#### Firebase Functions V1

```typescript
import * as functions from 'firebase-functions';

// Simple: table name defaults to collectionId ('products')
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
      tableName: 'avada_customer',
      upsertKeys: ['shopifyDomain'],
      pickKeys: ['shopifyDomain', 'email', 'plan'],
    },
  ],
})
```

### Upsert Mode (MERGE)

Use `upsertKeys` on a destination to enable upsert mode. Instead of appending a new row for every change, the API will MERGE (insert or update) based on the specified keys.

This is useful for maintaining a single row per entity (e.g., a CRM table with one row per shop).

```typescript
changelog.onWriteV2({
  collectionId: 'shops',
  destinations: [
    {
      tableName: 'avada_customer',
      upsertKeys: ['shopifyDomain'],
    },
  ],
})
```

When `upsertKeys` is set:
- The API parses the `data` JSON field and picks configured fields (configured on API side).
- MERGE uses `ON` condition with all upsert keys (auto-converted to `snake_case`).
- DELETE operations are skipped (no data to merge).
- Fields not present in the document are left unchanged in BigQuery.

### Custom Data Transformation

You can use `transformRow` to modify the data before it's sent to the API. This is useful for formatting dates, calculating fields, or cleaning up data.

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
  appId: 'your-app-id',
  apiKey: 'your-api-key',
  logger: functions.logger,
});
```

### Handling Multiple Collections

If you have many collections to track, you can use `onWriteMany` or `onWriteManyV2`:

```typescript
const handlers = changelog.onWriteMany([
  { collectionId: 'settings', destinations: [{ tableName: 'settings' }] },
  { collectionId: 'profiles', destinations: [{ tableName: 'profiles', pickKeys: ['theme'] }] }
]);

// Then export them or register them as needed by your framework
```

## API Reference

### `createChangelogTrigger(config)`

| Option | Type | Description |
| :--- | :--- | :--- |
| `appId` | `string` | **Required**. Your application identifier. |
| `projectId` | `string` | Optional. Firebase project ID (default: `'avada-crm'`). |
| `apiUrl` | `string` | Optional. Endpoint URL. |
| `apiKey` | `string` | **Required**. API key for authentication. |
| `timeout` | `number` | Optional. Request timeout in ms (default: 10000). |
| `headers` | `object` | Optional. Custom headers for the request. |
| `logger` | `Logger` | Optional. Logger instance for debugging (must have `info` and `error` methods). |

### `CollectionConfig`

| Option | Type | Description |
| :--- | :--- | :--- |
| `collectionId` | `string` | **Required**. Firestore collection name. |
| `destinations` | `DestinationConfig[]` | Optional. Array of destination tables to write to. Defaults to `[{ tableName: collectionId }]`. |

### `DestinationConfig`

| Option | Type | Description |
| :--- | :--- | :--- |
| `tableName` | `string` | **Required**. BigQuery destination table name. |
| `pickKeys` | `string[]` | Optional. Fields to extract from the document as extra columns (auto `snake_case`). |
| `upsertKeys` | `string[]` | Optional. camelCase field names for MERGE mode. When set, API will upsert instead of insert. |
| `transformRow` | `function` | Optional. Async/sync function to modify the row before sending. |

## Development

### Building the project

To compile the TypeScript source code into the `lib` directory:

```bash
npm run build
```

### Publishing to NPM

1. **Login to NPM** (if not already):
   ```bash
   npm login
   ```

2. **Update version**:
   Update the `version` in `package.json` (e.g., `0.1.1`).

3. **Publish**:
   ```bash
   npm publish --access public
   ```
   *Note: The `prepublishOnly` script will automatically run `npm run build` before publishing.*

## License

MIT
