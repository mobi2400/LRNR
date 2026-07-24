import { z } from 'zod';

/**
 * The daily pace options offered by the settings surface. The chosen value is
 * persisted on the learner profile and read back by the Curriculum Builder when
 * it sizes each session, so this list is a product decision, not cosmetic.
 */
export const DAILY_MINUTES_OPTIONS = [10, 15, 25, 40] as const;

export const dailyMinutesSchema = z.union([
  z.literal(10),
  z.literal(15),
  z.literal(25),
  z.literal(40),
]);

export type DailyMinutes = z.infer<typeof dailyMinutesSchema>;

export const DEFAULT_DAILY_MINUTES: DailyMinutes = 15;

export const ownerSettingsSchema = z.object({
  dailyMinutes: dailyMinutesSchema,
  /** Mirrors notification_preferences.daily_learning_alert_enabled. */
  dailyNudgeEnabled: z.boolean(),
  /**
   * Whether a Telegram chat is actually wired up. The nudge switch is only
   * meaningful when delivery is configured, so the UI can say so plainly.
   */
  telegramConfigured: z.boolean(),
});

export type OwnerSettings = z.infer<typeof ownerSettingsSchema>;

export const settingsPatchSchema = z
  .object({
    dailyMinutes: dailyMinutesSchema.optional(),
    dailyNudgeEnabled: z.boolean().optional(),
  })
  .refine(
    (patch) =>
      patch.dailyMinutes !== undefined || patch.dailyNudgeEnabled !== undefined,
    { message: 'Provide at least one setting to update.' },
  );

export type SettingsPatch = z.infer<typeof settingsPatchSchema>;

/**
 * Human-readable pacing hint stored alongside the numeric value. The Curriculum
 * Builder injects this string into its session plan prompt, so it must stay a
 * natural phrase rather than a bare number.
 */
export function buildTimePerSessionLabel(minutes: DailyMinutes): string {
  return `${minutes} minutes`;
}
