// ─── Which Notifications there are ───
// One Knock workflow per Notification, and the `kind` its trigger data
// carries so Cadence can build the Feed row. Shared by the server (triggers,
// preferences) and the browser (Feed rows), so it imports nothing.

export const NOTIFICATION_KINDS = {
  "refund-request-opened": "refund_request_opened",
  "refund-request-approved": "refund_request_approved",
  "refund-request-declined": "refund_request_declined",
  "seat-claimed": "seat_claimed",
  "enrollment-created": "enrollment_created",
  "discussion-question-posted": "discussion_question",
  "discussion-reply-posted": "discussion_reply",
} as const;

/** A Knock workflow key, one per Notification. */
export type NotificationWorkflow = keyof typeof NOTIFICATION_KINDS;

/** What a Notification's trigger data says it is. */
export type NotificationKind = (typeof NOTIFICATION_KINDS)[NotificationWorkflow];

/** Every workflow key, typed for `z.enum`. */
export const NOTIFICATION_WORKFLOWS = Object.keys(NOTIFICATION_KINDS) as [
  NotificationWorkflow,
  ...NotificationWorkflow[],
];
