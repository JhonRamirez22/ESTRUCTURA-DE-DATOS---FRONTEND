import { LruCache } from '@/lib/lruCache';

export interface ResolvedAddress<C> {
  candidates: C[];
  warning?: string;
}

// Direcciones ya resueltas: 40 entradas durante 10 minutos, para no repetir geocodificaciones.
const store = new LruCache<string, ResolvedAddress<unknown>>(40, 10 * 60_000);

export function addressCacheKey(address: string): string {
  return address.trim().toLowerCase().replace(/\s+/g, ' ');
}
