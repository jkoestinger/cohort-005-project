import type { Notifier, Trigger } from "~/lib/notifier.server";

/** An in-memory Notifier that records every call, for tests. */
export function fakeNotifier(): Notifier & { triggers: Trigger[] } {
  const triggers: Trigger[] = [];
  return {
    triggers,
    async trigger(trigger) {
      triggers.push(trigger);
    },
  };
}
