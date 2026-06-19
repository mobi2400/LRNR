import { describe, expect, it } from 'vitest';

import {
  assertOwnerIdentity,
  isOwnerIdentity,
  OwnerAccessError,
} from '../../src/server/owner';

describe('owner access helpers', () => {
  it('matches the configured owner by email case-insensitively', () => {
    expect(
      isOwnerIdentity(
        {
          userId: null,
          email: 'Owner@Example.com',
        },
        {
          userId: null,
          email: 'owner@example.com',
        },
      ),
    ).toBe(true);
  });

  it('matches the configured owner by user ID', () => {
    expect(
      isOwnerIdentity(
        {
          userId: 'owner-user-id',
          email: null,
        },
        {
          userId: 'owner-user-id',
          email: null,
        },
      ),
    ).toBe(true);
  });

  it('throws for a non-owner identity', () => {
    expect(() =>
      assertOwnerIdentity(
        {
          userId: 'someone-else',
          email: 'guest@example.com',
        },
        {
          userId: 'owner-user-id',
          email: 'owner@example.com',
        },
      ),
    ).toThrow(OwnerAccessError);
  });
});

