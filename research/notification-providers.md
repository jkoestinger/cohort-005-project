# Notification providers for the in-app Notification inbox

**Question:** Which third-party providers could back Cadence's in-app Notification inbox (bell, unread count, feed), and how do they compare?

**Date:** 2026-11-09

**Method:** I read official pricing pages, official docs, and official GitHub READMEs, and queried the npm registry directly (`npm view`) for package versions, publish dates, and `peerDependencies`. I used third-party or competitor comparison posts only to find candidates. Where I cite one (a Courier blog post about competitors), it is flagged. Anything I could not confirm against a primary source is marked **unverified**.

**Constraints, from the brief:** in-app only (no email, push, or SMS). EU hosting is strongly preferred. A free tier for development is required. The provider sits behind one thin module, and it owns storage, delivery, and per-user preferences. Its prebuilt feed may be restyled to fit Tailwind 4 and shadcn. The server signs a per-user token. Sends are best-effort from server actions, so a provider outage must never block the action. Real-time is nice-to-have. English only. Recipients are Student, Instructor, Team Admin, and Platform Admin.

---

## Pricing assumption (used throughout)

Every candidate bills per **notification sent to one user on one channel** (Knock "message", Novu "workflow run", MagicBell "delivery", Courier "send", SuprSend "notification"). None bills by MAU by default. To translate MAU into a bill I assume **about 10 in-app Notifications per active user per month** (enrolments, lesson releases, replies, admin events):

| MAU    | Notifications/month |
| ------ | ------------------- |
| 1,000  | ~10,000             |
| 10,000 | ~100,000            |
| 50,000 | ~500,000            |

All costs below are list prices from the pricing pages fetched on 2026-11-09, before tax and any negotiated discount. If Cadence's real volume is X notifications per user, scale linearly.

---

## Knock (SaaS)

- **EU hosting:** Not available yet. The Security docs say "We expect to support EU data residency by the end of 2026", and the Plans docs call it "coming soon" ([security](https://docs.knock.app/developer-tools/security), [plans](https://docs.knock.app/manage-your-account/knock-plans)). The pricing page mentions only GDPR ([pricing](https://knock.app/pricing)).
- **Free tier and pricing:** Free gets 10,000 messages/month. There is no hard cap; Knock contacts you about adding billing. Starter is $250/month including 50,000 messages, then $0.005 per message. Enterprise also offers per-notified-user pricing. Feed messages are retained indefinitely by default ([pricing](https://knock.app/pricing)). One message is "delivered to one user on one channel" ([plans](https://docs.knock.app/manage-your-account/knock-plans)). Neither page says outright that in-app feed messages are billable, but the definition implies they are (**unverified**).
  - 1k MAU (~10k): $0, right at the free limit.
  - 10k MAU (~100k): $250 + 50k × $0.005 = **~$500/month**.
  - 50k MAU (~500k): $250 + 450k × $0.005 = **~$2,500/month**, at which point Enterprise negotiation is likely.
- **In-app feed:**
  - `@knocklabs/react` 0.15.1 (published 2026-11-06) has peerDependencies `react ^17 || ^18 || ^19`. `next` and `@tanstack/react-router` are optional peers, so it is **React 19 compatible** (npm registry). It is MIT-licensed.
  - Prebuilt components are `NotificationIconButton` (with `badgeCountType="unread"`), `NotificationFeedPopover`, and `NotificationFeed`.
  - Styling is done through `--rnf-*` CSS variables, by replacing the stylesheet and targeting `rnf-` classes, or with `renderItem` and `renderHeader` overrides ([feed](https://docs.knock.app/in-app-ui/react/feed)).
  - For headless use, there are hooks in `@knocklabs/react-core` (React 19 peer) and `@knocklabs/client` exposes `FeedClient` and its state store ([custom UI](https://docs.knock.app/in-app-ui/feeds/custom-ui)).
  - Restyling for shadcn means either overriding variables and classes or going headless. There is no documented way to pass Tailwind classes into components.
- **Real-time:** WebSocket, documented as a "real-time web socket connection" ([API overview](https://docs.knock.app/in-app-ui/api-overview)). Sockets in inactive tabs auto-disconnect, and BroadcastChannel cross-tab sync is experimental ([feed](https://docs.knock.app/in-app-ui/react/feed)). No polling fallback is documented.
- **User identity:** In "enhanced security mode" the server signs an **RS256 JWT** offline with a private signing key, using `signUserToken` from `@knocklabs/node`. The JWT carries `sub`, `iat`, and `exp` (default 3600 s) and optional `grants`. The client passes it as `userToken` to `KnockProvider`, and `onUserTokenExpiring` handles refresh ([security & auth](https://docs.knock.app/in-app-ui/security-and-authentication)). No network round trip is needed to mint a token.
- **Preferences:** Each user has a `PreferenceSet` with opt-outs per channel type, per category, and per workflow. Tenant and object preferences are also supported, and there is a hosted or custom preference centre ([preferences](https://docs.knock.app/concepts/preferences)).
- **Templates:** Edited in the dashboard. They can also be pulled and pushed as local files with the Knock CLI (`knock pull` / `knock push`) and promoted through CI ([CLI](https://docs.knock.app/cli/overview)).
- **Node SDK:** `@knocklabs/node` 1.41.0 (published 2026-11-03), Apache-2.0 (npm). It is Stainless-generated and fully typed. The defaults are a **60 s timeout and 2 retries**, both overridable per client or per request with `timeout` and `maxRetries` ([knock-node](https://github.com/knocklabs/knock-node)). You must lower these for best-effort sends.
- **Addressing groups:** There are two options.
  - **Objects + subscriptions:** for example, an object `roles/platform-admins` with admins subscribed. Triggering the object fans out to all subscribers, with up to 100 recipients per subscription API request ([subscriptions](https://docs.knock.app/concepts/subscriptions)).
  - **Audiences:** static or dynamic, usable by workflows and broadcasts ([audiences](https://docs.knock.app/concepts/audiences)). Which plans include audiences is **unverified**.
- **Lock-in and exit:** Proprietary SaaS with no self-host option. Data is reachable through the REST API. A bulk export tool is **unverified**.

## Novu: Cloud and self-hosted

- **EU hosting:** **EU residency is included on the Free plan**, alongside US; Enterprise adds the UK, Singapore, and other regions ([pricing](https://novu.co/pricing)).
  - The EU API is `https://eu.api.novu.co` ([inbox setup](https://docs.novu.co/platform/inbox/setup-inbox); [novu-ts](https://github.com/novuhq/novu-ts)).
  - The EU socket URL is documented inconsistently: `wss://eu.socket.novu.co` on the inbox setup page, but `https://eu.ws.novu.co` on the NovuProvider hook page ([novu-provider](https://docs.novu.co/inbox/react/hooks/novu-provider)). This needs confirming in the dashboard.
  - A Courier blog post (a competitor source) says Novu's EU region is in Frankfurt, that the region is chosen at account creation, and that data cannot be moved between regions ([Courier blog, 2026](https://www.courier.com/blog/eu-data-residency-notifications)). The Frankfurt location is **unverified** on a Novu-owned page.
  - **Self-hosting** puts data wherever you run it.
- **Free tier and pricing (Cloud):** Free is 10,000 workflow runs/month, with 20 workflows, 3 team members, and 24 h activity-feed retention. Pro starts at $30/month for 30k runs. Team starts at $250/month for 250k runs. Extra runs on Pro and Team cost $1.20 per 1,000 ([pricing](https://novu.co/pricing)). Over-limit behaviour on Free is **unverified**. Topic fan-out creates one run per subscriber, and filtered-out subscribers are not billed ([topics](https://docs.novu.co/platform/concepts/topics)).
  - 1k MAU (~10k): $0, right at the free limit.
  - 10k MAU (~100k): Pro $30 + 70k × $1.20/1k = **~$114/month**.
  - 50k MAU (~500k): Team $250 + 250k × $1.20/1k = **~$550/month**, or about $594 on Pro. These are "from" prices, so the exact tiering is **unverified**.
  - Self-hosted: no licence fee for the MIT core, but you pay for infrastructure and operations (see below).
- **In-app feed:**
  - `@novu/react` 3.19.2 (published 2026-09-07) has peerDependencies `react ^18 || ^19` and `react-dom ^18 || ^19`, so it is **React 19 compatible** (npm). It is licensed ISC.
  - `<Inbox />` renders a bell plus a popover with the feed and a preferences view ([inbox setup](https://docs.novu.co/platform/inbox/setup-inbox)).
  - **Styling:** the `appearance` prop takes `variables`, `elements`, `icons`, `baseTheme`, and `animations`. **`elements` accepts class strings, including Tailwind classes, or callbacks that return classes** ([styling](https://docs.novu.co/platform/inbox/configuration/styling)). This is the best fit for Tailwind and shadcn among the candidates.
  - **Headless:** `@novu/react` hooks (`useNotifications`, `useCounts`, `usePreferences`, `useNovu`) give state and real-time updates while you supply the UI ([use-counts](https://docs.novu.co/platform/sdks/react/hooks/use-counts), [use-preferences](https://docs.novu.co/platform/sdks/react/hooks/use-preferences), [headless](https://docs.novu.co/platform/inbox/react/headless)).
- **Real-time:** WebSocket through a separate `ws` service. `useCounts` keeps counts "updated in real time" ([use-counts](https://docs.novu.co/platform/sdks/react/hooks/use-counts); [docker deploy](https://docs.novu.co/community/self-hosting-novu/deploy-with-docker)).
- **User identity:** The server computes **`subscriberHash = HMAC-SHA256(NOVU_SECRET_KEY, subscriberId)`** and the client passes it to `<Inbox subscriberHash>`. Once HMAC is enabled, the Inbox refuses to load without it ([prepare for production](https://docs.novu.co/platform/inbox/prepare-for-production)).
  - The hash is static, with **no expiry**: a leaked hash stays valid until the secret key is rotated. This is weaker than the expiring JWTs of Knock, Courier, and SuprSend.
  - Without HMAC, anyone who knows a subscriber ID can read that subscriber's feed, so HMAC must be on in production.
- **Preferences:** Workflows set channel defaults. Each subscriber has global channel preferences and per-workflow per-channel preferences. "Critical" workflows cannot be opted out of. There is per-tenant scoping, and a preferences UI is built into the Inbox ([preferences](https://docs.novu.co/platform/concepts/preferences)).
- **Templates:** There are two ways to define them, dashboard workflows or **code-first workflows with Novu Framework** (`@novu/framework`), exposed through a "Bridge Endpoint" in your app and kept in source control ([framework](https://docs.novu.co/framework/overview)). Code-first workflows require Novu Cloud to reach your bridge endpoint over HTTP, which a local dev setup needs a tunnel for.
- **Node SDK:** `@novu/api` 3.19.1 (published 2026-09-02), MIT, Speakeasy-generated and typed. `serverURL: "https://eu.api.novu.co"` (or `serverIdx: 1`) selects the EU region ([novu-ts](https://github.com/novuhq/novu-ts)). Retries are configurable with `retryConfig`. The README does not document a timeout option and shows an `AbortSignal.timeout` hook instead; a `timeoutMs` option is **unverified**. Default retry values are **unverified**.
- **Addressing groups:** **Topics.** You trigger with `to: { type: "Topic", topicKey: "platform-admins" }`. A topic holds up to 100,000 subscribers, and an `actor` can be excluded from the fan-out ([topics](https://docs.novu.co/platform/concepts/topics)).
- **Lock-in and exit:**
  - The core is **MIT open source**; the `enterprise/` folders are under a commercial licence. The repo has about 40k stars ([GitHub](https://github.com/novuhq/novu)).
  - The community self-host runs on Docker Compose with `api`, `worker`, `ws`, and `dashboard` services plus MongoDB, Redis, and S3 ([deploy with docker](https://docs.novu.co/community/self-hosting-novu/deploy-with-docker)). There is no official Helm chart. The recommended production footprint is several VMs plus MongoDB Atlas M20 and two Redis clusters ([self-host overview](https://docs.novu.co/community/self-hosting-novu/overview)).
  - Some Cloud-only features are missing when self-hosting. The exact list was not retrievable (comparison page 404), so it is **unverified**, and social login is unsupported.
  - "Enterprise Self-Hosted" is a separate paid offering ([pricing](https://novu.co/pricing)).
  - The exit path from Cloud to self-host (same API and SDKs) is the cheapest exit of any candidate. How data moves from Cloud to self-hosted is **unverified**.

## MagicBell (SaaS)

- **EU hosting:** No EU region is mentioned on the pricing page or the Trust Centre. The Trust Centre says only "secure cloud platforms" and that DPAs are available ([pricing](https://www.magicbell.com/pricing), [security](https://magicbell.com/security)). EU residency is **unverified / apparently not offered**.
- **Free tier and pricing:** Builder is free with **1,000 deliveries/month** and 1 project. Startup is $249/month for 50,000 deliveries, then $0.0025 per delivery. Each channel counts separately ([pricing](https://www.magicbell.com/pricing)).
  - 1k MAU (~10k): already over the free tier, so **$249/month**.
  - 10k MAU (~100k): $249 + 50k × $0.0025 = **~$374/month**.
  - 50k MAU (~500k): $249 + 450k × $0.0025 = **~$1,374/month**.
- **In-app feed:**
  - `@magicbell/react` 1.14.0 (published 2026-07-29). Its npm metadata declares **no `peerDependencies` and no licence field**, so React 19 compatibility is **unverified**; it is neither declared nor excluded. The older `@magicbell/magicbell-react` 11.5.1 has the peer `react >= 18.3.1` and a "SEE LICENSE IN LICENSE" licence (npm).
  - Components are `FloatingInbox`, `Inbox`, `InlineNotification`, `ToastContainer`, and `UserPreferences`. Styling uses predefined class names, `--magicbell-*` CSS variables, `className`, `ItemComponent`, and `unstyled` ([React components](https://www.magicbell.com/docs/libraries/magicbell-react)).
  - Headless hooks are not documented on the current docs pages (**unverified**).
- **Real-time:** "Persistent connection"; the transport is not named ([in-app channel](https://www.magicbell.com/docs/channels/in_app)). The package depends on `reconnecting-websocket`, which suggests WebSocket (npm).
- **User identity:** The server signs an **HS256 JWT** with the project Secret Key. Claims are `user_email` and/or `user_external_id`, plus `api_key`. The docs example uses a 1-year expiry ([user JWT](https://www.magicbell.com/docs/api/authentication/user)).
- **Preferences:** Per channel and per category, with a `UserPreferences` component ([in-app channel](https://www.magicbell.com/docs/channels/in_app)).
- **Templates:** Content is set on each broadcast (`title`, `content`, per-channel `overrides`), and no template system is documented ([broadcast](https://www.magicbell.com/docs/primitive/broadcast)). This is **unverified** beyond that page.
- **Node SDK:** `magicbell-js` 1.8.0 (published 2026-07-29); `magicbell` 4.5.1 (published 2026-05-22) (npm). Typed. Timeout defaults are **unverified**.
- **Addressing groups:** Broadcast `recipients` takes 1 to 1,000 users or filters per call, and broadcasts can target "topics with subscribers" ([broadcast](https://www.magicbell.com/docs/primitive/broadcast)).
- **Lock-in and exit:** Proprietary SaaS. The Trust Centre claims data portability ([security](https://magicbell.com/security)). No self-host option.

## Courier (SaaS)

- **EU hosting:** An **EU datacenter in Ireland on the Business and Enterprise plans**, fully separate from the US.
  - EU endpoints are `api.eu.courier.com`, `inbox.eu.courier.io`, and `wss://realtime.eu.courier.io`.
  - Existing US data does not migrate.
  - The **free Developer plan is US-only**, so EU development requires the paid Business plan ([EU datacenter](https://www.courier.com/docs/platform/workspaces/eu-datacenter), [pricing](https://www.courier.com/pricing)).
- **Free tier and pricing:** Developer is free with 10,000 sends/month. Business is pay-as-you-go at $0.005 per send ([pricing](https://www.courier.com/pricing)). Whether the first 10k stay free on Business is **unverified**; below I assume they do. Sends blocked by preferences still count toward usage ([preferences](https://www.courier.com/docs/platform/preferences/overview)).
  - 1k MAU (~10k): $0 (US). On EU Business it is likely about $0–50; **unverified**.
  - 10k MAU (~100k): 90k × $0.005 = **~$450/month**.
  - 50k MAU (~500k): 490k × $0.005 = **~$2,450/month**, with Enterprise volume pricing likely.
- **In-app feed:**
  - `@trycourier/courier-react` 9.3.5 (published 2026-11-09) has peerDependencies `react >=18`, `react-dom >=18`, so it is **React 19 compatible**. It is MIT-licensed (npm).
  - Components are `CourierInbox`, a popup menu, toasts, and a preference centre. Theming uses `lightTheme` and `darkTheme` objects ([customize](https://www.courier.com/docs/in-app/customize-the-inbox.md)).
  - Slot renderers are `renderListItem`, `renderHeader`, `renderMenuButton` (which receives `totalUnreadCount`), and the empty, loading, and error states. The headless `useCourier` hook exposes `inbox.feeds`, `inbox.totalUnreadCount`, `readMessage`, and `listenForUpdates` ([custom inbox](https://www.courier.com/docs/in-app/build-a-custom-inbox.md)).
  - Under the hood it is a web component (`<courier-inbox>`). Whether it uses shadow DOM, which would block Tailwind classes outside your renderers, is **unverified**.
  - It renders client-side only ([React SDK](https://www.courier.com/docs/sdk-libraries/courier-react-web.md)).
- **Real-time:** A "realtime connection" or socket ([inbox behaviour](https://www.courier.com/docs/in-app/how-the-inbox-behaves.md)). The EU host is `wss://` ([EU datacenter](https://www.courier.com/docs/platform/workspaces/eu-datacenter)).
- **User identity:** The server calls **`POST /auth/issue-token`** with the API key, a set of scopes (`user_id:<id> inbox:read:messages inbox:write:events`, plus preference scopes), and `expires_in`. Courier returns a JWT. The SDKs do not auto-refresh, and omitting the expiry gives a token that never expires ([auth](https://www.courier.com/docs/platform/inbox/authentication)).
  - Unlike Knock, Novu, and SuprSend, minting a token is a **network call to Courier**. If Courier is down, the bell cannot authenticate, though your actions are unaffected.
- **Preferences:** Subscription topics, each `OPTED_IN`, `OPTED_OUT`, or `REQUIRED`, with per-topic channel routing. Tenant defaults stack in a defined precedence. There is a hosted or embedded preference centre ([preferences](https://www.courier.com/docs/platform/preferences/overview)).
- **Templates:** A dashboard designer, or "Elemental" JSON content passed inline on send or stored on a template ([docs index](https://www.courier.com/docs/llms.txt)).
- **Node SDK:** `@trycourier/courier` 10.0.0 (published 2026-10-29), Apache-2.0, typed ([courier-node](https://github.com/trycourier/courier-node)). The base URL can be set for EU. Timeout and retry defaults are **unverified**. The repo layout suggests a Stainless-style generator, which is also **unverified**.
- **Addressing groups:** **Lists**, maintained by hand, sent with `to: { list_id }`, and supporting wildcard `list_pattern`. **Audiences** are rule-based, sent with `to: { audience_id }` ([send to a list](https://www.courier.com/docs/guides/announce-to-a-list.md)).
- **Lock-in and exit:** Proprietary SaaS with no self-host option. Courier publishes migration guides *from* Knock and Novu, which indicates the concepts map closely ([docs index](https://www.courier.com/docs/llms.txt)). A bulk export tool is **unverified**.

## SuprSend (SaaS; self-host and BYOC on Enterprise)

- **EU hosting:** The security docs say "We support EU-data residency options" but give no regions or plans ([security](https://docs.suprsend.com/docs/security)). The pricing page lists "multi-region data centers" and custom regions **only under Enterprise** ([pricing](https://www.suprsend.com/pricing)). EU residency on Free or self-serve plans is **unverified / likely not available**.
- **Free tier and pricing:** Free is 10,000 notifications/month, with no hard stop. It carries SuprSend branding in the in-app feed and 30-day logs.
  - **Essentials** is $100/month for 50k, then $2 per 1k.
  - **Business** is $250/month for 50k, then $5 per 1k. **User preferences are listed as a Business-plan feature** ([pricing](https://www.suprsend.com/pricing)). If preferences really need Business, the realistic plan is Business. Whether Free gets preferences after the 30-day premium trial is **unverified**.
  - 1k MAU (~10k): $0, with branding.
  - 10k MAU (~100k): Business $250 + 50 × $5 = **~$500/month** (Essentials ~$200 without preferences).
  - 50k MAU (~500k): Business $250 + 450 × $5 = **~$2,500/month** (Essentials ~$1,000).
- **In-app feed:**
  - `@suprsend/react` 1.5.0 (published 2026-10-22) has peer `react >= 16.8.0`. That is not capped, so React 19 is allowed by the range. It is MIT-licensed (npm). The old `@suprsend/react-inbox` is end-of-support ([inbox React](https://docs.suprsend.com/docs/inbox-react)).
  - The drop-in `Inbox` takes `theme` and `themeType`, and custom components can be passed for the bell, badge, notification, loader, empty state, and header ([drop-in feed](https://docs.suprsend.com/docs/react-in-app-feed.md)).
  - A headless implementation also exists ([headless](https://docs.suprsend.com/docs/headless-inbox)).
- **Real-time:** A feed socket (`socketHost`), with a connection-status indicator ([drop-in feed](https://docs.suprsend.com/docs/react-in-app-feed.md)).
- **User identity:** The server signs an **ES256 JWT** with the workspace signing key. Claims are `entity_type: "subscriber"`, `entity_id`, `iat`, `exp`, and an optional tenant `scope`. The client uses `identify(userId, token)` with a `refreshUserToken` callback. "Enhanced security mode" is recommended for production ([client auth](https://docs.suprsend.com/docs/client-authentication)).
- **Preferences:** Per category and per channel, with tenant-level defaults and REST APIs for each ([docs index](https://docs.suprsend.com/llms.txt)).
- **Templates:** Edited in the dashboard, plus a Management API and a CLI to pull, push, and commit templates and workflows from CI ([docs index](https://docs.suprsend.com/llms.txt)).
- **Node SDK:** `@suprsend/node-sdk` 1.15.1 (published 2026-05-19), MIT, ships type definitions (npm). Timeout defaults are **unverified**.
- **Addressing groups:** **Lists** (static, segment-based, or synced; trigger on a whole list is "early access") and **Objects** with subscriptions ([lists](https://docs.suprsend.com/docs/lists)).
- **Lock-in and exit:** Proprietary SaaS. Self-hosted and BYOC (beta) are Enterprise-only ([pricing](https://www.suprsend.com/pricing)).

## Considered and dropped

- **Engagespot:** `engagespot.co` and `/pricing` returned HTTP 404 on 2026-11-09. `@engagespot/react-component` was last modified 2025-05-09 (npm). The product looks inactive.
- **Pingram (formerly NotificationAPI):** `notificationapi.com` now redirects to `pingram.io`. It offers US, EU, and CA regions, but the pricing page covers email, SMS, and voice only, with no in-app inbox mentioned ([pricing](https://www.pingram.io/pricing)). It does have `@notificationapi/react` 2.0.1 (peer `react ^19`), but it is a weaker fit for an in-app-first use case.
- **OneSignal, Customer.io:** Not examined in depth. They are marketing-centric, and their "in-app" means messaging or modals rather than a persistent Notification feed.

---

## Comparison table

Costs use the assumption of ~10 notifications per MAU per month at list price.

| | Knock | Novu Cloud | Novu self-hosted | MagicBell | Courier | SuprSend |
|---|---|---|---|---|---|---|
| EU hosting | No (planned "end of 2026") | **Yes, on Free** | Yes (your infra) | Not documented | Yes, Business+ only (Ireland) | "Options" stated; regions Enterprise-only |
| Free tier | 10k msgs | 10k runs | Unlimited (infra cost) | 1k deliveries | 10k sends (US only) | 10k (branded feed) |
| ~1k MAU | $0 | $0 | infra | $249 | $0 US / ~low EU (unverified) | $0 |
| ~10k MAU | ~$500 | ~$114 | infra | ~$374 | ~$450 | ~$500 (Business) |
| ~50k MAU | ~$2,500 | ~$550 | infra | ~$1,374 | ~$2,450 | ~$2,500 (Business) |
| React 19 peer | Yes (`^19`) | Yes (`^19`) | Yes | Not declared (unverified) | Yes (`>=18`) | Yes (`>=16.8`) |
| Tailwind/shadcn restyle | CSS vars, renderItem, headless hooks | **Tailwind classes in `appearance.elements`** + headless hooks | same | CSS vars/classes | Theme object + slot renderers + `useCourier` | Theme + custom components + headless |
| Real-time | WebSocket | WebSocket | WebSocket | Persistent conn. (WS likely) | Socket | Socket |
| Client token | RS256 JWT, offline, expiring | HMAC-SHA256 hash, **no expiry** | same | HS256 JWT, offline | JWT via **API call**, scoped | ES256 JWT, offline, expiring |
| Preferences | Channel/category/workflow | Global + per-workflow/channel, critical | same | Channel/category | Topics + channel routing | Category/channel (**Business plan**) |
| Templates | Dashboard + CLI | Dashboard **or code (Framework)** | same | Per-broadcast content | Dashboard + Elemental JSON | Dashboard + CLI/API |
| Node SDK | Typed, Stainless, 2026-11-03 | Typed, Speakeasy, 2026-09-02 | same | Typed, 2026-07-29 | Typed, 2026-10-29 | Typed, 2026-05-19 |
| Groups | Objects+subscriptions, audiences | Topics (≤100k) | same | Broadcast recipients/topics | Lists, audiences | Lists, objects |
| Exit / licence | Proprietary | MIT core (Cloud to self-host path) | MIT core + commercial `enterprise/` | Proprietary | Proprietary | Proprietary (self-host Enterprise) |

---

## Shortlist

1. **Novu Cloud (EU region), with self-hosting as the exit path.** It is the only candidate with EU residency on the free tier. It has a React 19 peer and documented Tailwind class injection, typed hooks for a shadcn-native bell and feed, topics for "all Platform Admins", built-in preferences, and the cheapest list price at scale. Its MIT core gives a real exit.
2. **Courier (EU on Business).** It has a production EU datacenter with documented endpoints, a strong preference model (topics, REQUIRED, channel routing), lists and audiences, and a React 19-compatible inbox with slot renderers and a headless hook. However, EU needs a paid plan from day one, token minting is a network call, and it costs more at scale.
3. **Knock (if the EU timeline is acceptable).** It has the most polished developer experience: offline RS256 JWTs with expiry, a Stainless SDK with per-request timeouts, objects and audiences for groups, and a mature feed. EU residency, though, is a promise for "end of 2026", not a shipped feature as of 2026-11-09, and it costs the most at scale.

MagicBell (a 1k free tier and no documented EU option) and SuprSend (EU is vague and Enterprise-gated, and preferences need the $250 plan) do not make the shortlist.

## Recommendation (input to the later "Choose the notification provider" ticket; not the decision)

**I recommend Novu Cloud in the EU region**, behind the thin notification module, with these guardrails:

- **Turn on HMAC before going live**, and compute `subscriberHash` server-side for the session user. Because the hash never expires, keep `NOVU_SECRET_KEY` rotatable, and treat a key rotation as the revocation mechanism.
- **Prefer the restyled prebuilt `<Inbox>`** (Tailwind classes through `appearance.elements`, lucide icons through `appearance.icons`) as the starting point. Drop to `useNotifications` / `useCounts` hooks only if the shadcn look cannot be matched.
- **Make sends best-effort.** Call `@novu/api` `trigger` without awaiting it in the action's critical path, or await it with a hard timeout (an `AbortSignal.timeout(~2000)` hook, per the SDK README) and retries disabled or set to 1. Catch and log every error. This applies to any provider: Knock's default is 60 s with 2 retries, which would block an action for minutes during an outage if left as is.
- **Model "all Platform Admins" (and similar role groups) as Novu Topics**, kept in sync when roles change.
- **Choose between dashboard and code-first workflows explicitly.** Code-first through Novu Framework keeps templates in git but needs a reachable bridge endpoint.

If EU residency must come with a contractual, battle-tested datacenter and the budget allows it, **Courier Business (EU)** is the fallback. Revisit **Knock** once it actually ships EU residency.

## Open questions and caveats

- **Novu EU socket URL:** the docs give both `wss://eu.socket.novu.co` and `eu.ws.novu.co`. Confirm in the dashboard.
- **Novu EU location:** Frankfurt is stated only in a Courier (competitor) blog post. Confirm with Novu.
- **Novu self-host feature parity:** the self-hosted-vs-cloud comparison page returned 404, so which features are Cloud-only is unknown.
- **Novu Free over-limit behaviour,** and whether HMAC and topics are on Free: **unverified**. They appear generally available, but no plan table confirms it.
- **Novu `@novu/api`:** no timeout option is documented, and the retry defaults are unknown. Test both.
- **Knock:** does in-app feed delivery count as a billable message? The definition implies yes, but this is not stated.
- **Courier:** does the free 10k apply on Business (EU)? Is the inbox web component in shadow DOM (which affects Tailwind)? What are the SDK timeout defaults?
- **MagicBell `@magicbell/react`:** it declares no React peer and no licence field. Check its GitHub before relying on it.
- **SuprSend:** are preferences really Business-only, and what exactly do "EU data residency options" cover?
- **Pricing estimates** rest on the 10 notifications/MAU/month assumption. Fan-out Notifications to role groups (for example, every Platform Admin on each course publish) can multiply volume.
- **Data export:** none of the SaaS vendors documents a one-shot bulk export of in-app history and preferences. Exit means re-creating users, topics, and preferences through APIs and accepting the loss of historical feed items unless they are exported through list APIs (**unverified** per vendor).
- **Prices change often.** Everything here was read on 2026-11-09.

## Sources

Fetched 2026-11-09 unless noted. npm data came from `npm view` against registry.npmjs.org on the same date.

- Knock pricing: https://knock.app/pricing
- Knock plans and metering: https://docs.knock.app/manage-your-account/knock-plans
- Knock security (EU roadmap): https://docs.knock.app/developer-tools/security
- Knock security and authentication: https://docs.knock.app/in-app-ui/security-and-authentication
- Knock React feed: https://docs.knock.app/in-app-ui/react/feed
- Knock custom UI: https://docs.knock.app/in-app-ui/feeds/custom-ui
- Knock in-app API overview: https://docs.knock.app/in-app-ui/api-overview
- Knock preferences: https://docs.knock.app/concepts/preferences
- Knock subscriptions: https://docs.knock.app/concepts/subscriptions
- Knock audiences: https://docs.knock.app/concepts/audiences
- Knock CLI: https://docs.knock.app/cli/overview
- knock-node README: https://github.com/knocklabs/knock-node
- Novu pricing: https://novu.co/pricing
- Novu inbox setup: https://docs.novu.co/platform/inbox/setup-inbox
- Novu styling: https://docs.novu.co/platform/inbox/configuration/styling
- Novu prepare for production (HMAC): https://docs.novu.co/platform/inbox/prepare-for-production
- Novu headless: https://docs.novu.co/platform/inbox/react/headless
- Novu useCounts: https://docs.novu.co/platform/sdks/react/hooks/use-counts
- Novu usePreferences: https://docs.novu.co/platform/sdks/react/hooks/use-preferences
- Novu NovuProvider: https://docs.novu.co/inbox/react/hooks/novu-provider
- Novu preferences: https://docs.novu.co/platform/concepts/preferences
- Novu topics: https://docs.novu.co/platform/concepts/topics
- Novu Framework: https://docs.novu.co/framework/overview
- Novu self-hosting overview: https://docs.novu.co/community/self-hosting-novu/overview
- Novu deploy with Docker: https://docs.novu.co/community/self-hosting-novu/deploy-with-docker
- Novu repo and licence: https://github.com/novuhq/novu
- novu-ts SDK: https://github.com/novuhq/novu-ts
- MagicBell pricing: https://www.magicbell.com/pricing
- MagicBell Trust Centre: https://magicbell.com/security
- MagicBell user JWT: https://www.magicbell.com/docs/api/authentication/user
- MagicBell React components: https://www.magicbell.com/docs/libraries/magicbell-react
- MagicBell in-app channel: https://www.magicbell.com/docs/channels/in_app
- MagicBell broadcast: https://www.magicbell.com/docs/primitive/broadcast
- Courier pricing: https://www.courier.com/pricing
- Courier EU datacenter: https://www.courier.com/docs/platform/workspaces/eu-datacenter
- Courier inbox authentication: https://www.courier.com/docs/platform/inbox/authentication
- Courier customize inbox: https://www.courier.com/docs/in-app/customize-the-inbox.md
- Courier custom inbox: https://www.courier.com/docs/in-app/build-a-custom-inbox.md
- Courier inbox behaviour: https://www.courier.com/docs/in-app/how-the-inbox-behaves.md
- Courier React SDK: https://www.courier.com/docs/sdk-libraries/courier-react-web.md
- Courier preferences: https://www.courier.com/docs/platform/preferences/overview
- Courier lists and audiences: https://www.courier.com/docs/guides/announce-to-a-list.md
- Courier docs index: https://www.courier.com/docs/llms.txt
- courier-node: https://github.com/trycourier/courier-node
- Courier blog on EU residency (competitor source; dated 2026-03-09, modified 2026-11-02): https://www.courier.com/blog/eu-data-residency-notifications
- SuprSend pricing: https://www.suprsend.com/pricing
- SuprSend security: https://docs.suprsend.com/docs/security
- SuprSend inbox React: https://docs.suprsend.com/docs/inbox-react
- SuprSend drop-in feed: https://docs.suprsend.com/docs/react-in-app-feed.md
- SuprSend client authentication: https://docs.suprsend.com/docs/client-authentication
- SuprSend lists: https://docs.suprsend.com/docs/lists
- SuprSend docs index: https://docs.suprsend.com/llms.txt
- Pingram pricing: https://www.pingram.io/pricing
- npm packages: `@knocklabs/react`, `@knocklabs/react-core`, `@knocklabs/node`, `@novu/react`, `@novu/js`, `@novu/api`, `@magicbell/react`, `@magicbell/magicbell-react`, `magicbell`, `magicbell-js`, `@trycourier/courier-react`, `@trycourier/courier`, `@suprsend/react`, `@suprsend/react-inbox`, `@suprsend/node-sdk`, `@engagespot/react-component`, `@notificationapi/react` (https://www.npmjs.com/package/<name>)
