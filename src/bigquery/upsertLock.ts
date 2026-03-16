const UPSERT_LOCK = new Map<string, Promise<void>>();

export async function withUpsertLock<T>(lockKey: string, fn: () => Promise<T>): Promise<T> {
  while (UPSERT_LOCK.has(lockKey)) {
    await UPSERT_LOCK.get(lockKey);
  }

  let releaseLock: () => void;
  const lockPromise = new Promise<void>(resolve => {
    releaseLock = resolve;
  });
  UPSERT_LOCK.set(lockKey, lockPromise);

  try {
    return await fn();
  } finally {
    UPSERT_LOCK.delete(lockKey);
    releaseLock!();
  }
}
