import { describe, expect, it, vi } from 'vitest';

import { createSettingsService } from '@/services/settings.service';
import type { DbActor } from '@/db/repository-helpers';

const actor: DbActor = {
  userId: '22222222-2222-2222-2222-222222222222',
  requestId: 'req-1',
};

function buildDependencies(overrides: {
  learnerPreferences?: Record<string, unknown>;
  notifications?: Record<string, unknown> | null;
} = {}) {
  const upsertProfile = vi.fn().mockResolvedValue({});
  const upsertForUser = vi.fn().mockResolvedValue({});

  return {
    upsertProfile,
    upsertForUser,
    dependencies: {
      profileRepository: {
        getCurrentProfile: vi.fn().mockResolvedValue({
          learnerPreferences: overrides.learnerPreferences ?? {},
        }),
        upsertProfile,
      },
      notificationPreferencesRepository: {
        getForUser: vi
          .fn()
          .mockResolvedValue(
            overrides.notifications === undefined ? null : overrides.notifications,
          ),
        upsertForUser,
      },
    },
  } as unknown as {
    upsertProfile: ReturnType<typeof vi.fn>;
    upsertForUser: ReturnType<typeof vi.fn>;
    dependencies: Parameters<typeof createSettingsService>[0];
  };
}

describe('settings service', () => {
  it('falls back to safe defaults when nothing has been configured', async () => {
    const { dependencies } = buildDependencies();
    const settings = await createSettingsService(dependencies).getSettings(actor);

    expect(settings.dailyMinutes).toBe(15);
    // No notification row yet must read as off, not as an invented default.
    expect(settings.dailyNudgeEnabled).toBe(false);
    expect(settings.telegramConfigured).toBe(false);
  });

  it('reads a stored pace and reports telegram as configured only with a chat id', async () => {
    const { dependencies } = buildDependencies({
      learnerPreferences: { dailyMinutes: 40 },
      notifications: {
        dailyLearningAlertEnabled: true,
        telegramEnabled: true,
        telegramChatId: '123456',
      },
    });
    const settings = await createSettingsService(dependencies).getSettings(actor);

    expect(settings.dailyMinutes).toBe(40);
    expect(settings.dailyNudgeEnabled).toBe(true);
    expect(settings.telegramConfigured).toBe(true);
  });

  it('treats telegram as unconfigured when no chat id is present', async () => {
    const { dependencies } = buildDependencies({
      notifications: {
        dailyLearningAlertEnabled: true,
        telegramEnabled: true,
        telegramChatId: null,
      },
    });
    const settings = await createSettingsService(dependencies).getSettings(actor);

    expect(settings.telegramConfigured).toBe(false);
  });

  it('preserves unrelated learner preferences when saving the pace', async () => {
    const { dependencies, upsertProfile } = buildDependencies({
      learnerPreferences: { preferredDepth: 'intermediate', somethingElse: 1 },
    });

    await createSettingsService(dependencies).updateSettings(actor, {
      dailyMinutes: 25,
    });

    expect(upsertProfile).toHaveBeenCalledTimes(1);
    const [, input] = upsertProfile.mock.calls[0] as [
      DbActor,
      { learnerPreferences: Record<string, unknown> },
    ];
    expect(input.learnerPreferences).toMatchObject({
      preferredDepth: 'intermediate',
      somethingElse: 1,
      dailyMinutes: 25,
      // The Curriculum Builder reads this phrase when planning a session.
      timePerSession: '25 minutes',
    });
  });

  it('keeps existing delivery switches when only the nudge changes', async () => {
    const { dependencies, upsertForUser } = buildDependencies({
      notifications: {
        dailyLearningAlertEnabled: false,
        evaluationAlertEnabled: false,
        digestAlertEnabled: true,
        telegramEnabled: true,
        telegramChatId: 'chat-1',
        quietHours: { from: 22 },
      },
    });

    await createSettingsService(dependencies).updateSettings(actor, {
      dailyNudgeEnabled: true,
    });

    const [, input] = upsertForUser.mock.calls[0] as [
      DbActor,
      Record<string, unknown>,
    ];
    expect(input).toMatchObject({
      dailyLearningAlertEnabled: true,
      evaluationAlertEnabled: false,
      digestAlertEnabled: true,
      telegramChatId: 'chat-1',
      quietHours: { from: 22 },
    });
  });

  it('rejects a pace outside the offered options', async () => {
    const { dependencies } = buildDependencies();

    await expect(
      createSettingsService(dependencies).updateSettings(actor, {
        dailyMinutes: 7 as never,
      }),
    ).rejects.toThrow();
  });
});
