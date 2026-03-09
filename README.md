# @avada/firestore-bigquery-changelog

SDK to log Firestore document changelog to an API (BigQuery Proxy). This package helps you track every change in your Firestore collections and sync them to BigQuery for analysis.

## Features

- Support for both Firebase Functions V1 and V2.
- Automatic `snake_case` conversion for picked fields.
- Customizable row transformation.
- Custom destination table name for BigQuery.
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

export const onProductWrite = functions.firestore
  .document('products/{productId}')
  .onWrite(changelog.onWrite({
    collectionId: 'products',
    pickKeys: ['name', 'price', 'status'] // Internal fields to be extracted as columns
  }));
```

#### Firebase Functions V2

```typescript
import { onDocumentWritten } from 'firebase-functions/v2/firestore';

export const onOrderWrite = onDocumentWritten('orders/{orderId}',
  changelog.onWriteV2({
    collectionId: 'orders',
    destinationTable: 'v2_orders_data' // Optional: Custom BigQuery table name
  })
);
```

## Advanced Configuration

### Custom Destination Table

By default, the API resolves the BigQuery table name from `appId` and `collectionId`. Use `destinationTable` to specify a custom table name directly.

```typescript
changelog.onWrite({
  collectionId: 'shops',
  destinationTable: 'avada_customer', // Write to this BigQuery table instead
})
```

### Upsert Mode (MERGE)

Use `upsertKeys` to enable upsert mode. Instead of appending a new row for every change, the API will MERGE (insert or update) based on the specified keys.

This is useful for maintaining a single row per entity (e.g., a CRM table with one row per shop).

```typescript
// Each shop change will upsert into avada_customer table
// matched by shopifyDomain (composite keys supported)
changelog.onWriteV2({
  collectionId: 'shops',
  destinationTable: 'avada_customer',
  upsertKeys: ['shopifyDomain'],
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
  transformRow: (row) => {
    return {
      ...row,
      full_name: `${row.first_name} ${row.last_name}`,
      processed_at: new Date().toISOString()
    };
  }
})
```

### Handling Multiple Collections

If you have many collections to track, you can use `onWriteMany` or `onWriteManyV2`:

```typescript
const handlers = changelog.onWriteMany([
  { collectionId: 'settings' },
  { collectionId: 'profiles', pickKeys: ['theme'] }
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

### `CollectionConfig`

| Option | Type | Description |
| :--- | :--- | :--- |
| `collectionId` | `string` | **Required**. Firestore collection name. |
| `destinationTable` | `string` | Optional. Custom BigQuery table name. Defaults to auto-resolved from `appId` and `collectionId`. |
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
