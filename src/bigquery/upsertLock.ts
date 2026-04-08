const UPSERT_LOCK = new Map<string, Promise<void>>();

export async function withUpsertLock<T>(lockKey: string, fn: () => Promise<T>): Promise<T> {
  const waitFor = UPSERT_LOCK.get(lockKey) ?? Promise.resolve();

  let releaseLock: () => void;
  const lockPromise = new Promise<void>(resolve => {
    releaseLock = resolve;
  });

  UPSERT_LOCK.set(lockKey, lockPromise);

  await waitFor;
  try {
    return await fn();
  } finally {
    if (UPSERT_LOCK.get(lockKey) === lockPromise) {
      UPSERT_LOCK.delete(lockKey);
    }
    releaseLock!();
  }
}
