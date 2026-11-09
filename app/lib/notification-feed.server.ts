import { signUserToken } from "@knocklabs/node";

// ─── Notification Feed authentication ───
// The browser reads a person's Notification Feed straight from Knock. Knock
// runs with enhanced security, so the browser needs a user token that only
// Cadence's server can sign (with KNOCK_SIGNING_KEY), for the user in the
// session. Separate from the Notifier: it delivers nothing.

export type FeedAuth = {
  userId: string;
  userToken: string;
  publicApiKey: string;
  feedChannelId: string;
};

/** How long a user token lasts. The browser asks for a new one before then. */
const USER_TOKEN_SECONDS = 60 * 60;

/** A Knock user token for this user, or null when Knock isn't configured. */
export async function signFeedToken(userId: number): Promise<string | null> {
  const signingKey = process.env.KNOCK_SIGNING_KEY;
  if (!signingKey) return null;

  try {
    return await signUserToken(String(userId), {
      signingKey,
      expiresInSeconds: USER_TOKEN_SECONDS,
    });
  } catch (error) {
    console.error("[notification-feed] Could not sign a Knock user token:", error);
    return null;
  }
}

/**
 * Everything the browser needs to read this user's Feed, or null when the
 * Feed can't be authenticated (Knock not configured). The bell hides on null.
 */
export async function getFeedAuth(userId: number): Promise<FeedAuth | null> {
  const publicApiKey = process.env.KNOCK_PUBLIC_API_KEY;
  const feedChannelId = process.env.KNOCK_FEED_CHANNEL_ID;
  if (!process.env.KNOCK_API_KEY || !publicApiKey || !feedChannelId) {
    return null;
  }

  const userToken = await signFeedToken(userId);
  if (!userToken) return null;

  return { userId: String(userId), userToken, publicApiKey, feedChannelId };
}
