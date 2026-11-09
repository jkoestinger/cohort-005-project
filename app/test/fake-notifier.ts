import type {
  Notifier,
  StoredPreferences,
  Trigger,
} from "~/lib/notifier.server";

/** An in-memory Notifier that records every call, for tests. */
export function fakeNotifier(): Notifier & {
  triggers: Trigger[];
  archivedCommentIds: number[];
  /** Stored preferences by user id, written with Knock's merge strategy. */
  preferences: Map<string, StoredPreferences>;
} {
  const triggers: Trigger[] = [];
  const archivedCommentIds: number[] = [];
  const preferences = new Map<string, StoredPreferences>();
  return {
    triggers,
    archivedCommentIds,
    preferences,
    async trigger(trigger) {
      triggers.push(trigger);
    },
    async archiveByCommentId(commentId) {
      archivedCommentIds.push(commentId);
    },
    async getPreferences(userId) {
      return structuredClone(preferences.get(userId) ?? {});
    },
    async setPreference(userId, workflow, channels) {
      const stored = preferences.get(userId) ?? {};
      preferences.set(userId, { ...stored, [workflow]: { ...channels } });
    },
  };
}
