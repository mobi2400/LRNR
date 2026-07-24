import { getSessionAccessState } from '@/server/session';
import { assertServerOnly } from '@/utils/server-only';

assertServerOnly('src/server/page-metadata.ts');

/**
 * Resolves the owner id for metadata generation.
 *
 * generateMetadata runs before the page renders and must never throw: an error
 * here would fail the whole route even though the page itself has its own
 * guard. A signed-out or locked visitor simply gets the generic title.
 */
export async function getMetadataUserId(): Promise<string | null> {
  try {
    const state = await getSessionAccessState();

    return state.isAuthenticated && state.userId !== null ? state.userId : null;
  } catch {
    return null;
  }
}

/** Titles and descriptions come from learner content, so they need trimming. */
export function toMetaText(value: string, maxLength: number): string {
  const collapsed = value.replace(/\s+/g, ' ').trim();

  if (collapsed.length <= maxLength) {
    return collapsed;
  }

  return `${collapsed.slice(0, maxLength - 1).trimEnd()}…`;
}

/** Turns a stored topic slug into the label used across the cockpit. */
export function formatTopicLabel(topicSlug: string): string {
  return topicSlug
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}
