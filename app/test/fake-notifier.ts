import type { Notifier, Trigger } from "~/lib/notifier.server";

/** An in-memory Notifier that records every call, for tests. */
export function fakeNotifier(): Notifier & {
  triggers: Trigger[];
  archivedCommentIds: number[];
} {
  const triggers: Trigger[] = [];
  const archivedCommentIds: number[] = [];
  return {
    triggers,
    archivedCommentIds,
    async trigger(trigger) {
      triggers.push(trigger);
    },
    async archiveByCommentId(commentId) {
      archivedCommentIds.push(commentId);
    },
  };
}
