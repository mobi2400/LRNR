import { AppError } from '@/server/errors';
import { serverConfig } from '@/server/config';
import { assertServerOnly } from '@/utils/server-only';

assertServerOnly('src/server/owner.ts');

export interface OwnerIdentity {
  userId: string | null;
  email: string | null;
}

export interface OwnerConfig {
  userId: string | null;
  email: string | null;
}

export class OwnerAccessError extends AppError {
  readonly code = 'FORBIDDEN';

  constructor(message = 'LRNR is private to the configured owner.') {
    super({
      code: 'FORBIDDEN',
      message,
      status: 403,
    });
    this.name = 'OwnerAccessError';
  }
}

export function normalizeOwnerValue(
  value: string | null | undefined,
): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim().toLowerCase();

  return normalized.length > 0 ? normalized : null;
}

export function isOwnerIdentity(
  identity: OwnerIdentity,
  ownerConfig: OwnerConfig = serverConfig.owner,
): boolean {
  const normalizedUserId = normalizeOwnerValue(identity.userId);
  const normalizedEmail = normalizeOwnerValue(identity.email);
  const configuredUserId = normalizeOwnerValue(ownerConfig.userId);
  const configuredEmail = normalizeOwnerValue(ownerConfig.email);

  return (
    (configuredUserId !== null && configuredUserId === normalizedUserId) ||
    (configuredEmail !== null && configuredEmail === normalizedEmail)
  );
}

export function assertOwnerIdentity(
  identity: OwnerIdentity,
  ownerConfig: OwnerConfig = serverConfig.owner,
): void {
  if (!isOwnerIdentity(identity, ownerConfig)) {
    throw new OwnerAccessError();
  }
}
