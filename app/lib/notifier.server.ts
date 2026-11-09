import { Knock } from "@knocklabs/node";

// ─── The Notifier ───
// The narrow port Cadence sends Notifications through. Knock delivers them when
// KNOCK_API_KEY is set. Without a key (local dev without Knock, tests) every
// call is logged and dropped, so Cadence keeps working with Notifications
// simply not sent. Tests hand in the in-memory fake from ~/test/fake-notifier.
//
// Callers go through the notifications module (notifications.server.ts),
// which decides who is notified with what. This port only delivers.

/** A recipient named inline: Knock silently skips a bare id it doesn't know. */
export type Recipient = {
  id: string;
  name: string;
  email: string;
};

export type Trigger = {
  /** The Knock workflow key, one per Notification. */
  workflow: string;
  recipients: Recipient[];
  actor?: Recipient;
  data: Record<string, unknown>;
  /** Built from the event, so a retried request doesn't notify twice. */
  idempotencyKey: string;
};

/** A person's choice for one Notification's Channels. */
export type ChannelPreference = {
  in_app_feed: boolean;
  email: boolean;
};

/**
 * What a person has stored, by workflow key. A workflow or Channel that is
 * missing has nothing stored, so the caller falls back to its own default.
 */
export type StoredPreferences = Record<string, Partial<ChannelPreference>>;

export interface Notifier {
  trigger(trigger: Trigger): Promise<void>;
  /**
   * Archives the Feed messages whose trigger data has this top-level
   * `commentId`, so they leave every recipient's Notification Feed. Sent
   * emails stay sent. Knock archives them shortly after the call returns.
   */
  archiveByCommentId(commentId: number): Promise<void>;
  getPreferences(userId: string): Promise<StoredPreferences>;
  /** Writes one workflow's Channels, leaving every other workflow as it is. */
  setPreference(
    userId: string,
    workflow: string,
    channels: ChannelPreference
  ): Promise<void>;
}

// Notifications are best effort: give up after a few seconds instead of the
// SDK's default minute. The SDK keeps its own 2 retries; we write none.
const KNOCK_TIMEOUT_MS = 5_000;

/**
 * Delivers through Knock. Archiving needs the Feed's channel id; without one
 * there is no Feed to archive from, so archive calls are logged and dropped.
 */
export function knockNotifier(apiKey: string, feedChannelId?: string): Notifier {
  const knock = new Knock({ apiKey, timeout: KNOCK_TIMEOUT_MS });

  return {
    async trigger({ workflow, recipients, actor, data, idempotencyKey }) {
      await knock.workflows.trigger(
        workflow,
        { recipients, actor, data },
        { idempotencyKey }
      );
    },
    async archiveByCommentId(commentId) {
      if (!feedChannelId) {
        console.info(
          `[notifier] KNOCK_FEED_CHANNEL_ID is not set; did not archive comment ${commentId}.`
        );
        return;
      }
      // trigger_data is a JSON string matched against the flat trigger data.
      await knock.channels.bulk.updateMessageStatus(feedChannelId, "archive", {
        trigger_data: JSON.stringify({ commentId }),
      });
    },

    async getPreferences(userId) {
      const set = await knock.users.getPreferences(userId, PREFERENCE_SET);
      return toStoredPreferences(set.workflows);
    },

    async setPreference(userId, workflow, channels) {
      await knock.users.setPreferences(userId, PREFERENCE_SET, {
        // Knock replaces the whole set by default; merge touches one workflow.
        __persistence_strategy__: "merge",
        workflows: { [workflow]: { channel_types: channels } },
      });
    },
  };
}

/** Knock's default preference set, the only one Cadence uses. */
const PREFERENCE_SET = "default";

type KnockWorkflows = Awaited<
  ReturnType<Knock["users"]["getPreferences"]>
>["workflows"];

// Knock stores a workflow as a boolean (every Channel) or as per-Channel
// settings, where a Channel is a boolean or a set of conditions. Cadence only
// writes booleans; anything else counts as nothing stored.
function toStoredPreferences(workflows: KnockWorkflows): StoredPreferences {
  const stored: StoredPreferences = {};
  for (const [workflow, setting] of Object.entries(workflows ?? {})) {
    if (typeof setting === "boolean") {
      stored[workflow] = { in_app_feed: setting, email: setting };
      continue;
    }
    const channels = setting.channel_types ?? {};
    const preference: Partial<ChannelPreference> = {};
    if (typeof channels.in_app_feed === "boolean") {
      preference.in_app_feed = channels.in_app_feed;
    }
    if (typeof channels.email === "boolean") {
      preference.email = channels.email;
    }
    stored[workflow] = preference;
  }
  return stored;
}

export function loggingNotifier(): Notifier {
  return {
    async trigger({ workflow, idempotencyKey }) {
      console.info(
        `[notifier] KNOCK_API_KEY is not set; dropped ${workflow} (${idempotencyKey}).`
      );
    },
    async archiveByCommentId(commentId) {
      console.info(
        `[notifier] KNOCK_API_KEY is not set; did not archive comment ${commentId}.`
      );
    },
    async getPreferences() {
      return {};
    },
    async setPreference(userId, workflow) {
      console.info(
        `[notifier] KNOCK_API_KEY is not set; dropped the ${workflow} preference for user ${userId}.`
      );
    },
  };
}

let defaultInstance: Notifier | undefined;

/** The Knock notifier when KNOCK_API_KEY is set, else the log-and-drop one. */
export function defaultNotifier(): Notifier {
  if (!defaultInstance) {
    const apiKey = process.env.KNOCK_API_KEY;
    defaultInstance = apiKey
      ? knockNotifier(apiKey, process.env.KNOCK_FEED_CHANNEL_ID)
      : loggingNotifier();
  }
  return defaultInstance;
}
