/**
 * Read-only diagnostic: shows which database we are connected to (masked) and
 * how learner-owned rows are distributed across user ids. Used to verify that
 * one consistent owner id owns every row.
 */
import postgres from 'postgres';

// Prefer the direct (non-pooler) connection for diagnostics: the transaction
// pooler enforces a short statement timeout that catalog queries can exceed.
const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL;

if (url === undefined) {
  console.error('Neither DIRECT_URL nor DATABASE_URL is set.');
  process.exit(1);
}

function mask(value: string): string {
  try {
    const parsed = new URL(value);
    return `${parsed.protocol}//${parsed.username ? '***:***@' : ''}${parsed.hostname}:${parsed.port}${parsed.pathname}`;
  } catch {
    return 'INVALID URL';
  }
}

console.log(`DATABASE_URL -> ${mask(url)}`);
console.log(`OWNER_USER_ID -> ${process.env.OWNER_USER_ID ?? '(unset)'}`);
console.log(`OWNER_EMAIL   -> ${process.env.OWNER_EMAIL ?? '(unset)'}`);
console.log('');

async function main(databaseUrl: string): Promise<void> {
  const sql = postgres(databaseUrl, { max: 1, prepare: false });

  try {
    const version = await sql`select current_database() as db`;
  console.log(`database: ${version[0]?.db}`);
  console.log('');

  const tables = await sql<{ table_name: string }[]>`
    select table_name from information_schema.tables
    where table_schema = 'public' order by table_name
  `;
  console.log(`tables (${tables.length}): ${tables.map((t) => t.table_name).join(', ')}`);
  console.log('');

  // Row counts and distinct owners for every learner-owned table.
  const owned = tables
    .map((t) => t.table_name)
    .filter((name) => name !== '__drizzle_migrations');

  console.log('per-table row counts and distinct user_id values:');
  for (const table of owned) {
    const hasUserId = await sql<{ exists: boolean }[]>`
      select exists (
        select 1 from information_schema.columns
        where table_schema='public' and table_name=${table} and column_name='user_id'
      ) as exists
    `;
    if (hasUserId[0]?.exists) {
      const rows = await sql.unsafe(
        `select count(*)::int as total, count(distinct user_id)::int as owners,
                coalesce(array_agg(distinct user_id::text), '{}') as ids
         from "${table}"`,
      );
      const r = rows[0] as unknown as {
        total: number;
        owners: number;
        ids: string[];
      };
      console.log(
        `  ${table.padEnd(28)} rows=${String(r.total).padStart(4)}  owners=${r.owners}  ${r.ids.slice(0, 4).join(', ')}`,
      );
    } else {
      const rows = await sql.unsafe(`select count(*)::int as total from "${table}"`);
      console.log(
        `  ${table.padEnd(28)} rows=${String((rows[0] as unknown as { total: number }).total).padStart(4)}  (no user_id)`,
      );
    }
  }
  } finally {
    await sql.end();
  }
}

main(url).catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
