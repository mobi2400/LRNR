import Redis from 'ioredis';

import { serverConfig } from '@/server/config';
import { assertServerOnly } from '@/utils/server-only';

assertServerOnly('src/lib/redis.ts');

export interface KeyValueStoreSetOptions {
  ttlMs?: number;
  onlyIfAbsent?: boolean;
}

export interface KeyValueStore {
  get(key: string): Promise<string | null>;
  set(
    key: string,
    value: string,
    options?: KeyValueStoreSetOptions,
  ): Promise<boolean>;
  delete(key: string): Promise<number>;
  deleteIfValue(key: string, expectedValue: string): Promise<boolean>;
  incrementWithTtl(
    key: string,
    ttlMs: number,
  ): Promise<{ count: number; ttlMs: number }>;
}

export interface RedisHealthStatus {
  ok: boolean;
  message: string;
}

let cachedRedisClient: Redis | null = null;

function createRedisClient(): Redis {
  return new Redis(serverConfig.redis.url, {
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
  });
}

export function getRedisClient(): Redis {
  if (cachedRedisClient !== null) {
    return cachedRedisClient;
  }

  cachedRedisClient = createRedisClient();

  return cachedRedisClient;
}

export async function ensureRedisConnection(): Promise<Redis> {
  const client = getRedisClient();

  if (client.status === 'wait') {
    await client.connect();
  }

  return client;
}

export async function checkRedisHealth(): Promise<RedisHealthStatus> {
  try {
    const client = await ensureRedisConnection();
    const result = await client.ping();

    return {
      ok: result === 'PONG',
      message: result,
    };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : 'Redis check failed.',
    };
  }
}

export class RedisKeyValueStore implements KeyValueStore {
  async get(key: string): Promise<string | null> {
    const client = await ensureRedisConnection();

    return client.get(key);
  }

  async set(
    key: string,
    value: string,
    options: KeyValueStoreSetOptions = {},
  ): Promise<boolean> {
    const client = await ensureRedisConnection();

    if (options.onlyIfAbsent) {
      const result =
        options.ttlMs === undefined
          ? await client.set(key, value, 'NX')
          : await client.set(key, value, 'PX', options.ttlMs, 'NX');

      return result === 'OK';
    }

    if (options.ttlMs === undefined) {
      await client.set(key, value);
    } else {
      await client.set(key, value, 'PX', options.ttlMs);
    }

    return true;
  }

  async delete(key: string): Promise<number> {
    const client = await ensureRedisConnection();

    return client.del(key);
  }

  async deleteIfValue(key: string, expectedValue: string): Promise<boolean> {
    const client = await ensureRedisConnection();
    const result = await client.eval(
      `
        if redis.call('GET', KEYS[1]) == ARGV[1] then
          return redis.call('DEL', KEYS[1])
        end
        return 0
      `,
      1,
      key,
      expectedValue,
    );

    return result === 1;
  }

  async incrementWithTtl(
    key: string,
    ttlMs: number,
  ): Promise<{ count: number; ttlMs: number }> {
    const client = await ensureRedisConnection();
    const result = (await client.eval(
      `
        local count = redis.call('INCR', KEYS[1])
        if count == 1 then
          redis.call('PEXPIRE', KEYS[1], ARGV[1])
        end
        local remainingTtl = redis.call('PTTL', KEYS[1])
        return { count, remainingTtl }
      `,
      1,
      key,
      ttlMs,
    )) as [number, number];

    return {
      count: Number(result[0]),
      ttlMs: Math.max(Number(result[1]), 1),
    };
  }
}

export class MemoryKeyValueStore implements KeyValueStore {
  private readonly entries = new Map<
    string,
    {
      value: string;
      expiresAt: number | null;
    }
  >();

  private evictExpired(key: string): void {
    const entry = this.entries.get(key);

    if (entry === undefined) {
      return;
    }

    if (entry.expiresAt !== null && entry.expiresAt <= Date.now()) {
      this.entries.delete(key);
    }
  }

  async get(key: string): Promise<string | null> {
    this.evictExpired(key);

    return this.entries.get(key)?.value ?? null;
  }

  async set(
    key: string,
    value: string,
    options: KeyValueStoreSetOptions = {},
  ): Promise<boolean> {
    this.evictExpired(key);

    if (options.onlyIfAbsent && this.entries.has(key)) {
      return false;
    }

    this.entries.set(key, {
      value,
      expiresAt:
        options.ttlMs === undefined ? null : Date.now() + options.ttlMs,
    });

    return true;
  }

  async delete(key: string): Promise<number> {
    const didDelete = this.entries.delete(key);

    return didDelete ? 1 : 0;
  }

  async deleteIfValue(key: string, expectedValue: string): Promise<boolean> {
    this.evictExpired(key);

    if (this.entries.get(key)?.value !== expectedValue) {
      return false;
    }

    this.entries.delete(key);

    return true;
  }

  async incrementWithTtl(
    key: string,
    ttlMs: number,
  ): Promise<{ count: number; ttlMs: number }> {
    this.evictExpired(key);

    const existing = this.entries.get(key);
    const count = existing === undefined ? 1 : Number(existing.value) + 1;
    const expiresAt = existing?.expiresAt ?? Date.now() + ttlMs;

    this.entries.set(key, {
      value: String(count),
      expiresAt,
    });

    return {
      count,
      ttlMs: Math.max(expiresAt - Date.now(), 1),
    };
  }
}
