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

/**
 * The Knock workflow category every Cadence workflow is tagged with. The Feed
 * only reads workflows in it, so its counts and its rows always cover the
 * same Notifications. A workflow without it never shows in the Feed.
 */
export const NOTIFICATION_WORKFLOW_CATEGORY = "cadence";

/** Whether a Notification reaches a person, in their Feed and by email. */
export type NotificationChannels = { in_app_feed: boolean; email: boolean };

/**
 * What applies to someone who never changed a Notification Preference. The
 * Notifications section on /settings shows these, and `npm run knock:setup`
 * writes them as Knock's environment default preference set, which is what
 * Knock applies when it delivers. One table, so the two can't drift apart.
 */
export const NOTIFICATION_DEFAULTS: Record<NotificationWorkflow, NotificationChannels> = {
  "refund-request-opened": { in_app_feed: true, email: true },
  "refund-request-approved": { in_app_feed: true, email: true },
  "refund-request-declined": { in_app_feed: true, email: true },
  // A large Team Licence would flood the inbox.
  "seat-claimed": { in_app_feed: true, email: false },
  // Opt-in: a popular course would flood the Feed.
  "enrollment-created": { in_app_feed: false, email: false },
  "discussion-question-posted": { in_app_feed: true, email: true },
  "discussion-reply-posted": { in_app_feed: true, email: true },
};
