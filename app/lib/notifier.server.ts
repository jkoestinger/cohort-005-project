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

export interface Notifier {
  trigger(trigger: Trigger): Promise<void>;
}

// Notifications are best effort: give up after a few seconds instead of the
// SDK's default minute. The SDK keeps its own 2 retries; we write none.
const KNOCK_TIMEOUT_MS = 5_000;

export function knockNotifier(apiKey: string): Notifier {
  const knock = new Knock({ apiKey, timeout: KNOCK_TIMEOUT_MS });

  return {
    async trigger({ workflow, recipients, actor, data, idempotencyKey }) {
      await knock.workflows.trigger(
        workflow,
        { recipients, actor, data },
        { idempotencyKey }
      );
    },
  };
}

export function loggingNotifier(): Notifier {
  return {
    async trigger({ workflow, idempotencyKey }) {
      console.info(
        `[notifier] KNOCK_API_KEY is not set; dropped ${workflow} (${idempotencyKey}).`
      );
    },
  };
}

let defaultInstance: Notifier | undefined;

/** The Knock notifier when KNOCK_API_KEY is set, else the log-and-drop one. */
export function defaultNotifier(): Notifier {
  if (!defaultInstance) {
    const apiKey = process.env.KNOCK_API_KEY;
    defaultInstance = apiKey ? knockNotifier(apiKey) : loggingNotifier();
  }
  return defaultInstance;
}
