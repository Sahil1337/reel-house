/**
 * Minimal TMDB v3 API client, shared by scripts/import-tmdb.mts and the admin routes
 * (src/app/api/admin/tmdb/**). Server-side only: it carries the API key.
 *
 * TMDB_API_KEY may be the v4 "API Read Access Token" (sent as a bearer header) or a v3
 * API key (32 hex chars, sent as ?api_key=). 429 and 5xx responses are retried with the
 * Retry-After delay, or exponential backoff when there is none.
 *
 * Plain TypeScript with no path aliases or value imports, so Node can run it with type
 * stripping when the import script loads it.
 */

const API_BASE = "https://api.themoviedb.org/3";

export class TmdbError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "TmdbError";
    this.status = status;
  }
}

/** Optional response cache keyed by the request URL (without the api_key). The script caches to disk. */
export interface TmdbCache {
  read(url: string): Promise<unknown | undefined>;
  write(url: string, body: unknown): Promise<void>;
}

export interface TmdbClientOptions {
  apiKey: string;
  cache?: TmdbCache;
  /** Attempts per request, counting the first. */
  maxAttempts?: number;
}

export interface TmdbClient {
  get<T>(endpoint: string, params?: Record<string, string | number>): Promise<T>;
  /** Network requests made and cache hits, for the importer's summary line. */
  readonly stats: { requests: number; cacheHits: number };
}

/** A v3 key is a 32-char hex string; anything else is treated as a v4 bearer token. */
export function isV3Key(apiKey: string): boolean {
  return /^[a-f0-9]{32}$/i.test(apiKey);
}

export function createTmdbClient({ apiKey, cache, maxAttempts = 5 }: TmdbClientOptions): TmdbClient {
  const v3 = isV3Key(apiKey);
  const headers: Record<string, string> = v3 ? {} : { Authorization: `Bearer ${apiKey}` };
  const stats = { requests: 0, cacheHits: 0 };

  async function get<T>(endpoint: string, params: Record<string, string | number> = {}): Promise<T> {
    const url = new URL(API_BASE + endpoint);
    url.searchParams.set("language", "en-US");
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, String(value));
    const cacheKey = url.toString();

    const cached = await cache?.read(cacheKey);
    if (cached !== undefined) {
      stats.cacheHits++;
      return cached as T;
    }

    if (v3) url.searchParams.set("api_key", apiKey);

    for (let attempt = 1; ; attempt++) {
      stats.requests++;
      const response = await fetch(url, { headers, cache: "no-store" });

      if (response.ok) {
        const body = (await response.json()) as T;
        await cache?.write(cacheKey, body);
        return body;
      }

      const retryable = response.status === 429 || response.status >= 500;
      if (!retryable || attempt >= maxAttempts) {
        const detail = await response.text().catch(() => "");
        throw new TmdbError(`TMDB ${response.status} for ${endpoint}: ${detail}`, response.status);
      }
      const retryAfter = Number(response.headers.get("retry-after")) || 2 ** attempt;
      await sleep(retryAfter * 1000);
    }
  }

  return { get, stats };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Maps over items with at most `limit` promises in flight, preserving order. */
export async function mapConcurrent<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await fn(items[index]);
    }
  });
  await Promise.all(workers);
  return results;
}
