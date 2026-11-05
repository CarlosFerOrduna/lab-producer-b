export const ITEM_CACHE = {
  clientToken: Symbol('ItemCacheClient'),
  keyPrefix: 'item:',
  // Los items no cambian: el TTL solo acota la memoria, y allkeys-lru los saca antes si la caché se llena.
  ttlSeconds: 300,
  // La caché es una optimización: una caché lenta tiene que costar una lectura a la base, nunca una respuesta lenta.
  commandTimeoutMs: 100,
  connectTimeoutMs: 1000,
} as const;
