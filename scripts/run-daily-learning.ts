import { getRedisClient } from '../src/lib/redis';
import { serverConfig } from '../src/server/config';
import { runDailyLearningWithLock } from '../src/services/daily-learning.service';

async function main(): Promise<void> {
  const userId = serverConfig.owner.userId;
  if (userId === null) throw new Error('OWNER_USER_ID is required.');

  const result = await runDailyLearningWithLock({
    userId,
    requestId: `daily-learning:${new Date().toISOString()}`,
  });
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

void main().finally(() => {
  getRedisClient().disconnect();
});
