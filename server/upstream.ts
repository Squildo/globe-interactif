import type { Feed } from '../src/models.ts';

export const empty = <T = never>(status: Feed['status'], note?: string): Feed<T> => ({ status, items: [], updatedAt: null, note });
export class UpstreamError extends Error {
  constructor(readonlyStatus: number, retryAfter: number | null = null) {
    super(`HTTP ${readonlyStatus}`);
    this.status = readonlyStatus;
    this.retryAfter = retryAfter;
  }
  readonly status: number;
  readonly retryAfter: number | null;
}

export async function download(request: typeof fetch, url: string, options?: RequestInit, max = 5_000_000) {
  const response = await request(url, { signal: AbortSignal.timeout(10_000), redirect: 'error', ...options });
  if (!response.ok) {
    await response.body?.cancel();
    const retry = response.headers.get('retry-after');
    const seconds = retry && /^\d+$/.test(retry) ? Number(retry) * 1000 : retry ? Date.parse(retry) - Date.now() : NaN;
    throw new UpstreamError(response.status, Number.isFinite(seconds) ? Math.min(86_400_000, Math.max(0, seconds)) : null);
  }
  const parts: Uint8Array[] = [];
  let size = 0;
  const stream = response.body?.getReader();
  try {
    if (stream) for (;;) {
      const { value, done } = await stream.read();
      if (done) break;
      size += value.byteLength;
      if (size > max) { await stream.cancel(); throw Error('Réponse trop volumineuse'); }
      parts.push(value);
    }
  } finally { stream?.releaseLock(); }
  return Buffer.concat(parts, size).toString('utf8');
}

export function cached<T>(load: () => Promise<Feed<T>>, { ttl, retain, retry, now }: { ttl: number; retain: number; retry: number; now: () => number }) {
  let lastGood: Feed<T> | undefined, received = 0;
  let current: Feed<T> | undefined, next = 0, pending: Promise<Feed<T>> | undefined;
  const visible = () => current!.status === 'fresh' || current!.status === 'stale' && current!.items.length ? current! :
    lastGood && now() - received < retain ? { ...lastGood, status: 'stale' as const, note: `${current!.note ?? 'Source indisponible.'} Dernière réponse conservée.` } : current!;
  return (): Promise<Feed<T>> => {
    if (pending) return pending;
    if (current && now() < next) return Promise.resolve(visible());
    pending = (async () => {
      let wait = retry;
      try { current = await load(); }
      catch (error) {
        if (error instanceof UpstreamError && error.status === 429) {
          current = empty('limited', 'Le fournisseur limite les requêtes.');
          wait = Math.max(retry, error.retryAfter ?? 0);
        } else current = empty('unavailable', 'La source externe ne répond pas ou sa réponse est invalide.');
      }
      if (current.status === 'fresh') { lastGood = current; received = now(); wait = ttl; }
      next = now() + wait;
      return visible();
    })().finally(() => { pending = undefined; });
    return pending;
  };
}
