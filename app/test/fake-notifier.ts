import type {
  Notifier,
  StoredPreferences,
  Trigger,
} from "~/lib/notifier.server";

/** An in-memory Notifier that records every call, for tests. */
export function fakeNotifier(): Notifier & {
  triggers: Trigger[];
  /** Stored preferences by user id, written with Knock's merge strategy. */
  preferences: Map<string, StoredPreferences>;
} {
  const triggers: Trigger[] = [];
  const preferences = new Map<string, StoredPreferences>();
  return {
    triggers,
    preferences,
    async trigger(trigger) {
      triggers.push(trigger);
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
