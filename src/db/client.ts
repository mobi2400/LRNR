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
    max: 1,
    prepare: false,
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
