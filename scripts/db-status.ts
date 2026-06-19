import { spawnSync } from 'node:child_process';

const result = spawnSync(
  process.execPath,
  ['node_modules/drizzle-kit/bin.cjs', 'check'],
  {
    stdio: 'inherit',
    shell: false,
  },
);

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}
