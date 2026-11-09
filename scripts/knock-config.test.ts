import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  NOTIFICATION_WORKFLOW_CATEGORY,
  NOTIFICATION_WORKFLOWS,
} from "../app/lib/notification-kinds";
import {
  buildAllWorkflows,
  buildEnvironmentDefaults,
  buildLayout,
  EMAIL_CHANNEL_KEY,
  LAYOUT_KEY,
} from "./knock-config";

const knockDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "knock");

describe("buildAllWorkflows", () => {
  const workflows = buildAllWorkflows(knockDir);

  it("builds one workflow per Notification, each in the Feed's category", () => {
    expect(workflows.map((w) => w.key)).toEqual(NOTIFICATION_WORKFLOWS);
    for (const { body } of workflows) {
      expect(body.categories).toEqual([NOTIFICATION_WORKFLOW_CATEGORY]);
    }
  });

  it("sends the email straight after the in-app step, in the shared layout", () => {
    for (const { body } of workflows) {
      expect(body.steps.map((step) => step.channel_type)).toEqual(["in_app_feed", "email"]);
      const email = body.steps[1];
      expect(email.channel_key).toBe(EMAIL_CHANNEL_KEY);
      expect(email.template).toMatchObject({ settings: { layout_key: LAYOUT_KEY } });
    }
  });

  it("links every email to the Notification's page", () => {
    for (const { body } of workflows) {
      const { html_body, text_body } = body.steps[1].template as {
        html_body: string;
        text_body: string;
      };
      expect(html_body).toContain("{{ vars.app_url }}{{ data.url }}");
      expect(html_body).toContain("View in Cadence");
      expect(text_body).toContain("View in Cadence: {{ vars.app_url }}{{ data.url }}");
    }
  });
});

describe("buildLayout", () => {
  it("frames the content and links to the Notification Preferences", () => {
    const layout = buildLayout(knockDir);
    for (const body of [layout.html_layout, layout.text_layout]) {
      expect(body).toContain("{{ content }}");
      expect(body).toContain("{{ vars.app_url }}/settings#notifications");
    }
  });
});

describe("buildEnvironmentDefaults", () => {
  it("turns New Enrollment off entirely and Seat claimed email off, everything else on", () => {
    expect(buildEnvironmentDefaults().preference_set.workflows).toEqual({
      "refund-request-opened": { channel_types: { in_app_feed: true, email: true } },
      "refund-request-approved": { channel_types: { in_app_feed: true, email: true } },
      "refund-request-declined": { channel_types: { in_app_feed: true, email: true } },
      "seat-claimed": { channel_types: { in_app_feed: true, email: false } },
      "enrollment-created": { channel_types: { in_app_feed: false, email: false } },
      "discussion-question-posted": { channel_types: { in_app_feed: true, email: true } },
      "discussion-reply-posted": { channel_types: { in_app_feed: true, email: true } },
    });
  });
});
