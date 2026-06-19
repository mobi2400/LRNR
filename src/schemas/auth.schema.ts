import { z } from 'zod';

export const loginRequestSchema = z.object({
  identifier: z
    .string()
    .trim()
    .min(1, 'Owner email or user ID is required.')
    .max(256, 'Owner identifier is too long.'),
});

export const unlockRequestSchema = z.object({
  accessSecret: z
    .string()
    .trim()
    .min(1, 'LRNR access secret is required.')
    .max(512, 'LRNR access secret is too long.'),
});

export type LoginRequest = z.infer<typeof loginRequestSchema>;
export type UnlockRequest = z.infer<typeof unlockRequestSchema>;
