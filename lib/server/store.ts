import "server-only";
import { Redis } from "@upstash/redis";

/**
 * Minimal KV abstraction. Upstash Redis when the REST env vars are present,
 * otherwise a process-local in-memory store (local dev / tests only).
 */
export interface KV {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T): Promise<void>;
  /** Set only if absent; returns true when the key was written. Optional TTL in ms. */
  setNX<T>(key: string, value: T, ttlMs?: number): Promise<boolean>;
  del(key: string): Promise<void>;
  incr(key: string): Promise<number>;
  /** Increment; the TTL (ms) is set when the key is created, so the window is fixed. */
  incrEx(key: string, ttlMs: number): Promise<number>;
  sadd(key: string, member: string): Promise<void>;
  smembers(key: string): Promise<string[]>;
}

class RedisKV implements KV {
  constructor(private readonly r: Redis) {}
  async get<T>(key: string) {
    return (await this.r.get<T>(key)) ?? null;
  }
  async set<T>(key: string, value: T) {
    await this.r.set(key, value);
  }
  async setNX<T>(key: string, value: T, ttlMs?: number) {
    const res = ttlMs
      ? await this.r.set(key, value, { nx: true, px: ttlMs })
      : await this.r.set(key, value, { nx: true });
    return res === "OK";
  }
  async del(key: string) {
    await this.r.del(key);
  }
  async incr(key: string) {
    return this.r.incr(key);
  }
  async incrEx(key: string, ttlMs: number) {
    const n = await this.r.incr(key);
    if (n === 1) await this.r.pexpire(key, ttlMs);
    return n;
  }
  async sadd(key: string, member: string) {
    await this.r.sadd(key, member);
  }
  async smembers(key: string) {
    return (await this.r.smembers(key)) as string[];
  }
}

interface MemEntry {
  value: string;
  expiresAt: number | null;
}

class MemoryKV implements KV {
  private data = new Map<string, MemEntry>();
  private sets = new Map<string, Set<string>>();

  private live(key: string): MemEntry | undefined {
    const e = this.data.get(key);
    if (e && e.expiresAt !== null && e.expiresAt <= Date.now()) {
      this.data.delete(key);
      return undefined;
    }
    return e;
  }
  async get<T>(key: string) {
    const e = this.live(key);
    return e ? (JSON.parse(e.value) as T) : null;
  }
  async set<T>(key: string, value: T) {
    this.data.set(key, { value: JSON.stringify(value), expiresAt: null });
  }
  async setNX<T>(key: string, value: T, ttlMs?: number) {
    if (this.live(key)) return false;
    this.data.set(key, {
      value: JSON.stringify(value),
      expiresAt: ttlMs ? Date.now() + ttlMs : null,
    });
    return true;
  }
  async del(key: string) {
    this.data.delete(key);
  }
  async incr(key: string) {
    const cur = (await this.get<number>(key)) ?? 0;
    await this.set(key, cur + 1);
    return cur + 1;
  }
  async incrEx(key: string, ttlMs: number) {
    const e = this.live(key);
    const n = (e ? (JSON.parse(e.value) as number) : 0) + 1;
    this.data.set(key, { value: JSON.stringify(n), expiresAt: e ? e.expiresAt : Date.now() + ttlMs });
    return n;
  }
  async sadd(key: string, member: string) {
    let s = this.sets.get(key);
    if (!s) this.sets.set(key, (s = new Set()));
    s.add(member);
  }
  async smembers(key: string) {
    return [...(this.sets.get(key) ?? [])];
  }
  clear() {
    this.data.clear();
    this.sets.clear();
  }
}

const g = globalThis as unknown as { __scesaKV?: KV; __scesaKVWarned?: boolean };

const REST_PAIRS = [
  ["KV_REST_API_URL", "KV_REST_API_TOKEN"],
  ["UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN"],
] as const;

/**
 * Upstash REST credentials. Accepts the standard names and the custom-prefixed
 * names Vercel creates when a store is connected with an env prefix
 * (e.g. `storage_KV_REST_API_URL`). The read-only token is never used.
 */
export function redisEnv(env: Record<string, string | undefined> = process.env): { url: string; token: string } | null {
  for (const [urlName, tokenName] of REST_PAIRS) {
    if (env[urlName] && env[tokenName]) return { url: env[urlName]!, token: env[tokenName]! };
  }
  for (const [urlName, tokenName] of REST_PAIRS) {
    for (const key of Object.keys(env)) {
      if (!key.endsWith(`_${urlName}`) || !env[key]) continue;
      const prefix = key.slice(0, -urlName.length);
      const token = env[`${prefix}${tokenName}`];
      if (token) return { url: env[key]!, token };
    }
  }
  return null;
}

export function getStore(): KV {
  if (g.__scesaKV) return g.__scesaKV;
  const env = redisEnv();
  if (env) {
    g.__scesaKV = new RedisKV(new Redis({ url: env.url, token: env.token }));
  } else {
    if (process.env.NODE_ENV === "production") {
      if (process.env.ALLOW_MEMORY_STORE !== "1") {
        throw new Error(
          "No Redis env vars set in production. Connect Upstash, or set ALLOW_MEMORY_STORE=1 to accept a non-persistent in-memory store.",
        );
      }
      if (!g.__scesaKVWarned) {
        g.__scesaKVWarned = true;
        console.warn(
          "[scesa-override] ALLOW_MEMORY_STORE=1: using in-memory store. State will NOT survive restarts or scale across instances.",
        );
      }
    }
    g.__scesaKV = new MemoryKV();
  }
  return g.__scesaKV;
}

/** Test helper: reset the in-memory store. */
export function resetMemoryStore(): void {
  const s = g.__scesaKV;
  if (s instanceof MemoryKV) s.clear();
  else if (!s) g.__scesaKV = new MemoryKV();
}
