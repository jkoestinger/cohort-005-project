import { data } from "react-router";
import type { Route } from "./+types/api.notification-token";
import { getCurrentUserId } from "~/lib/session";
import { signFeedToken } from "~/lib/notification-feed.server";

/**
 * A fresh Knock user token for the user in the session. The Notification Feed
 * asks for one shortly before its current token expires.
 */
export async function loader({ request }: Route.LoaderArgs) {
  const currentUserId = await getCurrentUserId(request);
  if (!currentUserId) {
    throw data("Select a user from the DevUI panel.", { status: 401 });
  }

  const userToken = await signFeedToken(currentUserId);
  if (!userToken) {
    throw data("The Notification Feed is not configured.", { status: 404 });
  }

  return Response.json({ userToken });
}
