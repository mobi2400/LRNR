import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import * as schema from '@/db/schema';
import { serverConfig } from '@/server/config';
import { assertServerOnly } from '@/utils/server-only';

assertServerOnly('src/db/client.ts');

/**
 * Reuse one postgres.js client in development so hot reload does not create a
 * new connection pool on every import. The database remains the source of
 * truth, but the client lifecycle still needs to be predictable and debuggable.
 */
declare global {
  var __lrnrSqlClient: ReturnType<typeof postgres> | undefined;
  var __lrnrDbClient: DbClient | undefined;
}

export type DbClient = PostgresJsDatabase<typeof schema>;

function createSqlClient() {
  return postgres(serverConfig.database.url, {
    // Supabase's transaction pooler (pgbouncer) cannot use prepared statements.
    prepare: false,
    // A single connection serialized every request behind whichever one was
    // slowest, so one stalled agent call blocked the whole app. A small pool
    // keeps independent requests independent.
    max: 5,
    // Recycle idle connections: the pooler drops them server-side, and a stale
    // socket otherwise surfaces as a request that hangs instead of failing.
    idle_timeout: 20,
    max_lifetime: 60 * 30,
    connect_timeout: 15,
  });
}

function createDbClient(): DbClient {
  const sqlClient =
    globalThis.__lrnrSqlClient ??
    (globalThis.__lrnrSqlClient = createSqlClient());

  return drizzle(sqlClient, { schema });
}

export const db: DbClient =
  globalThis.__lrnrDbClient ?? (globalThis.__lrnrDbClient = createDbClient());

export { schema };
