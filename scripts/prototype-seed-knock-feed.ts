// PROTOTYPE: fires a handful of catalogue Notifications at seed users through
// the Knock Development environment, via one generic workflow `prototype-feed`
// (a single in-app feed step). Run: npx tsx --env-file=.env scripts/prototype-seed-knock-feed.ts
const WORKFLOW = "prototype-feed";

const notifications: { to: string; data: Record<string, unknown> }[] = [
  // Sarah Chen (2), Instructor of Introduction to TypeScript
  {
    to: "2",
    data: {
      kind: "discussion_question",
      actor_name: "Emma Wilson",
      course_title: "Introduction to TypeScript",
      lesson_title: "What is TypeScript?",
      snippet: "Is TypeScript checked at runtime too, or only when I compile? My API still got a string where I typed a number.",
      url: "/courses/introduction-to-typescript/lessons/1",
    },
  },
  {
    to: "2",
    data: {
      kind: "enrollment",
      actor_name: "James Park",
      course_title: "Introduction to TypeScript",
      url: "/instructor/1/students",
    },
  },
  {
    to: "2",
    data: {
      kind: "discussion_question",
      actor_name: "Olivia Martinez",
      course_title: "Introduction to TypeScript",
      lesson_title: "Installing and Configuring TypeScript",
      snippet: "Which tsconfig target should I pick for Node 22?",
      url: "/courses/introduction-to-typescript/lessons/2",
    },
  },
  // Emma Wilson (5), Student
  {
    to: "5",
    data: {
      kind: "discussion_reply",
      actor_name: "Sarah Chen",
      course_title: "Introduction to TypeScript",
      lesson_title: "What is TypeScript?",
      snippet: "Only at compile time. Types are erased, so validate API input at the boundary, with zod for example.",
      url: "/courses/introduction-to-typescript/lessons/1",
    },
  },
  {
    to: "5",
    data: {
      kind: "refund_approved",
      course_title: "Design Systems with Tailwind",
      note: "Sorry it wasn't a fit. The refund goes back to your card in 5–10 days.",
      url: "/courses/design-systems-with-tailwind",
    },
  },
  {
    to: "5",
    data: {
      kind: "refund_declined",
      course_title: "Practical Data Visualisation",
      note: "You've watched most of the course, which is past the Watch Limit.",
      url: "/courses/practical-data-visualisation",
    },
  },
  // Alex Rivera (1), Platform Admin
  {
    to: "1",
    data: {
      kind: "refund_requested",
      actor_name: "Olivia Martinez",
      course_title: "Building REST APIs with Node.js",
      amount: "$49.00",
      reason: "The course uses Express 4, and I was hoping for something more modern.",
      url: "/admin/refunds",
    },
  },
  // Bossy McBossface (10), Team Admin
  {
    to: "10",
    data: {
      kind: "seat_claimed",
      actor_name: "Ava Nakamura",
      course_title: "Introduction to TypeScript",
      seats_left: 3,
      url: "/team",
    },
  },
];

for (const n of notifications) {
  const res = await fetch(`https://api.knock.app/v1/workflows/${WORKFLOW}/trigger`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.KNOCK_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ recipients: [n.to], data: n.data }),
  });
  console.log(res.status, n.to, n.data.kind, res.ok ? "" : await res.text());
}
