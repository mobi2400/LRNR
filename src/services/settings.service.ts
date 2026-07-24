import { notificationPreferencesRepository } from '@/db/notification-preferences.repo';
import { profileRepository } from '@/db/profile.repo';
import type { DbActor } from '@/db/repository-helpers';
import {
  buildTimePerSessionLabel,
  DEFAULT_DAILY_MINUTES,
  dailyMinutesSchema,
  ownerSettingsSchema,
  settingsPatchSchema,
  type DailyMinutes,
  type OwnerSettings,
  type SettingsPatch,
} from '@/schemas/settings.schema';
import { assertServerOnly } from '@/utils/server-only';

assertServerOnly('src/services/settings.service.ts');

type PreferencesRecord = Record<string, unknown>;

function readDailyMinutes(preferences: PreferencesRecord): DailyMinutes {
  const parsed = dailyMinutesSchema.safeParse(preferences.dailyMinutes);

  return parsed.success ? parsed.data : DEFAULT_DAILY_MINUTES;
}

export function createSettingsService(
  dependencies: {
    profileRepository: Pick<
      typeof profileRepository,
      'getCurrentProfile' | 'upsertProfile'
    >;
    notificationPreferencesRepository: Pick<
      typeof notificationPreferencesRepository,
      'getForUser' | 'upsertForUser'
    >;
  } = { profileRepository, notificationPreferencesRepository },
) {
  async function readSettings(actor: DbActor): Promise<OwnerSettings> {
    const [profile, notifications] = await Promise.all([
      dependencies.profileRepository.getCurrentProfile(actor),
      dependencies.notificationPreferencesRepository.getForUser(actor),
    ]);
    const preferences = (profile?.learnerPreferences ?? {}) as PreferencesRecord;

    return ownerSettingsSchema.parse({
      dailyMinutes: readDailyMinutes(preferences),
      // No stored row yet means delivery has never been configured, so the
      // nudge reads as off rather than inventing an enabled default.
      dailyNudgeEnabled: notifications?.dailyLearningAlertEnabled ?? false,
      telegramConfigured:
        notifications !== null &&
        notifications.telegramEnabled &&
        notifications.telegramChatId !== null,
    });
  }

  return {
    getSettings: readSettings,

    /**
     * Applies a partial settings update. Each field is written to whichever
     * store actually owns it: pacing lives on the learner profile (the
     * Curriculum Builder reads it), the nudge lives on notification
     * preferences. Untouched fields are preserved rather than defaulted away.
     */
    async updateSettings(
      actor: DbActor,
      patch: SettingsPatch,
    ): Promise<OwnerSettings> {
      const validatedPatch = settingsPatchSchema.parse(patch);

      if (validatedPatch.dailyMinutes !== undefined) {
        const profile =
          await dependencies.profileRepository.getCurrentProfile(actor);
        const preferences = (profile?.learnerPreferences ??
          {}) as PreferencesRecord;

        await dependencies.profileRepository.upsertProfile(actor, {
          learnerPreferences: {
            ...preferences,
            dailyMinutes: validatedPatch.dailyMinutes,
            timePerSession: buildTimePerSessionLabel(
              validatedPatch.dailyMinutes,
            ),
          },
        });
      }

      if (validatedPatch.dailyNudgeEnabled !== undefined) {
        const current =
          await dependencies.notificationPreferencesRepository.getForUser(actor);

        await dependencies.notificationPreferencesRepository.upsertForUser(
          actor,
          {
            telegramEnabled: current?.telegramEnabled ?? true,
            telegramChatId: current?.telegramChatId ?? null,
            dailyLearningAlertEnabled: validatedPatch.dailyNudgeEnabled,
            evaluationAlertEnabled: current?.evaluationAlertEnabled ?? true,
            digestAlertEnabled: current?.digestAlertEnabled ?? true,
            quietHours: current?.quietHours ?? {},
          },
        );
      }

      return readSettings(actor);
    },
  };
}

export const settingsService = createSettingsService();
