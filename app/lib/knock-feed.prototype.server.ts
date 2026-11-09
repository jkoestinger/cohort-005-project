// PROTOTYPE (wayfinder: "What does the Notification Feed look like in Cadence?").
// Throwaway: signs a Knock user token for the DevUI-selected user so the
// browser can read that user's Notification Feed with enhanced security on.
import { signUserToken } from "@knocklabs/node";

try {
  process.loadEnvFile(".env");
} catch {}

export interface KnockFeedConfig {
  userId: string;
  userToken: string;
  publicApiKey: string;
  feedChannelId: string;
}

export async function getKnockFeedConfig(
  userId: number | null
): Promise<KnockFeedConfig | null> {
  const signingKey = process.env.KNOCK_SIGNING_KEY;
  const publicApiKey = process.env.KNOCK_PUBLIC_API_KEY;
  const feedChannelId = process.env.KNOCK_FEED_CHANNEL_ID;
  if (!userId || !signingKey || !publicApiKey || !feedChannelId) return null;

  const userToken = await signUserToken(String(userId), {
    signingKey,
    expiresInSeconds: 60 * 60,
  });
  return { userId: String(userId), userToken, publicApiKey, feedChannelId };
}
