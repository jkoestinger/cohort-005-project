import { readFileSync } from "node:fs";
import path from "node:path";
import {
  NOTIFICATION_DEFAULTS,
  NOTIFICATION_WORKFLOW_CATEGORY,
  NOTIFICATION_WORKFLOWS,
  type NotificationWorkflow,
} from "../app/lib/notification-kinds";

// ─── What Cadence's Knock environment should contain ───
// Built from the repo: the workflows from NOTIFICATION_KINDS, their email copy
// from knock/, and the default preference set from NOTIFICATION_DEFAULTS.
// `scripts/knock-setup.ts` sends it through Knock's Management API.

export const LAYOUT_KEY = "cadence";
export const FEED_CHANNEL_KEY = "in-app";
/** Knock's built-in test provider: only delivers to Knock account members. */
export const EMAIL_CHANNEL_KEY = "knock-email";

const WORKFLOW_NAMES: Record<NotificationWorkflow, string> = {
  "refund-request-opened": "New Open Refund Request",
  "refund-request-approved": "Refund Request approved",
  "refund-request-declined": "Refund Request declined",
  "seat-claimed": "Seat claimed",
  "enrollment-created": "New Enrollment",
  "discussion-question-posted": "New Discussion Question",
  "discussion-reply-posted": "Discussion Reply",
};

const DEEP_LINK = "{{ vars.app_url }}{{ data.url }}";

export function readKnockFile(knockDir: string, ...parts: string[]) {
  return readFileSync(path.join(knockDir, ...parts), "utf8");
}

export function buildLayout(knockDir: string) {
  return {
    name: "Cadence",
    html_layout: readKnockFile(knockDir, "layouts", "cadence.html"),
    text_layout: readKnockFile(knockDir, "layouts", "cadence.txt"),
  };
}

/**
 * One Knock workflow per Notification: the in-app Feed step, then the email
 * straight after it (no delay, batch or "skip if seen"). Cadence builds Feed
 * rows from the trigger data, so the in-app template is only Knock's fallback.
 */
export function buildWorkflow(knockDir: string, workflow: NotificationWorkflow) {
  const file = (name: string) => readKnockFile(knockDir, "workflows", workflow, name);
  const subject = file("subject.txt").trim();
  return {
    name: WORKFLOW_NAMES[workflow],
    categories: [NOTIFICATION_WORKFLOW_CATEGORY],
    steps: [
      {
        type: "channel",
        ref: "in_app_feed_1",
        channel_type: "in_app_feed",
        channel_key: FEED_CHANNEL_KEY,
        template: { markdown_body: subject, action_url: DEEP_LINK },
      },
      {
        type: "channel",
        ref: "email_1",
        channel_type: "email",
        channel_key: EMAIL_CHANNEL_KEY,
        template: {
          subject,
          html_body: file("email.html"),
          text_body: file("email.txt"),
          settings: { layout_key: LAYOUT_KEY },
        },
      },
    ],
  };
}

export function buildAllWorkflows(knockDir: string) {
  return NOTIFICATION_WORKFLOWS.map((workflow) => ({
    key: workflow,
    body: buildWorkflow(knockDir, workflow),
  }));
}

/** Knock's environment default preference set, from NOTIFICATION_DEFAULTS. */
export function buildEnvironmentDefaults() {
  return {
    preference_set: {
      workflows: Object.fromEntries(
        NOTIFICATION_WORKFLOWS.map((workflow) => [
          workflow,
          { channel_types: { ...NOTIFICATION_DEFAULTS[workflow] } },
        ]),
      ),
    },
  };
}
