import { describe, expect, it } from 'vitest';

import {
  createLocalOwnerJwt,
  readLocalOwnerJwt,
} from '../../src/server/local-jwt-session';

describe('local JWT session helper', () => {
  it('creates and reads a signed local owner JWT with a UUID subject', () => {
    const token = createLocalOwnerJwt(new Date('2026-01-01T00:00:00Z'));
    const payload = readLocalOwnerJwt(token, new Date('2026-01-01T00:00:01Z'));

    expect(payload).toMatchObject({
      sub: '00000000-0000-4000-8000-000000000001',
      isOwner: true,
    });
  });

  it('rejects tampered local JWTs', () => {
    const token = createLocalOwnerJwt(new Date('2026-01-01T00:00:00Z'));
    const tampered = token.replace(/.$/, 'x');

    expect(readLocalOwnerJwt(tampered, new Date('2026-01-01T00:00:01Z'))).toBeNull();
  });

  it('rejects expired local JWTs', () => {
    const token = createLocalOwnerJwt(new Date('2026-01-01T00:00:00Z'));

    expect(readLocalOwnerJwt(token, new Date('2026-01-03T00:00:00Z'))).toBeNull();
  });
});

