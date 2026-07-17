import { serverConfig } from '../src/server/config';
import { deliveryService } from '../src/services/delivery.service';

const MAX_DELIVERIES_PER_RUN = 20;

async function main(): Promise<void> {
  const userId = serverConfig.owner.userId;
  if (userId === null) throw new Error('OWNER_USER_ID is required.');
  const actor = {
    userId,
    requestId: `delivery-outbox:${new Date().toISOString()}`,
  };
  const results = [];

  for (let index = 0; index < MAX_DELIVERIES_PER_RUN; index += 1) {
    const result = await deliveryService.processNextTelegramDelivery(actor);
    if (!result.processed) break;
    results.push(result);
  }

  process.stdout.write(
    `${JSON.stringify({ processed: results.length, results })}\n`,
  );
}

void main();
