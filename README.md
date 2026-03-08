# @avada/firestore-bigquery-changelog

SDK to log Firestore document changelog to an API (BigQuery Proxy). This package helps you track every change in your Firestore collections and sync them to BigQuery for analysis.

## Features

- Support for both Firebase Functions V1 and V2.
- Automatic `snake_case` conversion for picked fields.
- Customizable row transformation.
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
  appId: 'your-app-id',
  projectId: 'your-firebase-project-id',
  apiKey: 'your-api-key', // Optional: if not using CHANGELOG_API_KEY env var
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
    collectionId: 'orders'
  })
);
```

## Advanced Configuration

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
| `projectId` | `string` | **Required**. Firebase project ID. |
| `apiUrl` | `string` | Optional. Endpoint URL. |
| `apiKey` | `string` | Optional. API key for authentication. |
| `timeout` | `number` | Optional. Request timeout in ms (default: 10000). |
| `headers` | `object` | Optional. Custom headers for the request. |

### `CollectionConfig`

| Option | Type | Description |
| :--- | :--- | :--- |
| `collectionId` | `string` | **Required**. Firestore collection name. |
| `pickKeys` | `string[]` | Fields to extract from the document. |
| `transformRow` | `function` | Async/sync function to modify the row. |

## License

MIT
