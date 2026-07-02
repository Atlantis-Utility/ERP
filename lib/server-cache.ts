const store = new Map<string, { v: unknown; exp: number }>();

export function withCache<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
  const hit = store.get(key);
  if (hit && hit.exp > Date.now()) return Promise.resolve(hit.v as T);
  return fn().then((v) => {
    store.set(key, { v, exp: Date.now() + ttlMs });
    return v;
  });
}

export function invalidate(prefix: string) {
  for (const k of store.keys()) if (k.startsWith(prefix)) store.delete(k);
}
