import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { FeedItem } from "@knocklabs/client";
import { badgeLabel, describeNotification } from "./describe-notification";

function feedItem(data: Record<string, unknown>): FeedItem {
  return {
    __cursor: "cursor",
    id: "msg_1",
    activities: [],
    actors: [],
    blocks: [],
    archived_at: null,
    inserted_at: "2026-11-09T10:00:00Z",
    read_at: null,
    seen_at: null,
    clicked_at: null,
    interacted_at: null,
    link_clicked_at: null,
    source: { key: "workflow", version_id: "v1", categories: [] },
    tenant: null,
    total_activities: 1,
    total_actors: 0,
    updated_at: "2026-11-09T10:00:00Z",
    data,
  };
}

/** The title as HTML, so the bold names show as <strong>. */
function title(data: Record<string, unknown>) {
  const described = describeNotification(feedItem(data));
  if (!described) throw new Error("expected a described Notification");
  return renderToStaticMarkup(<>{described.title}</>);
}

describe("describeNotification", () => {
  it("describes an approved Refund Request with no actor and the decision note", () => {
    const data = {
      kind: "refund_request_approved",
      course_title: "Intro to TypeScript",
      note: "Sorry it didn't work out.",
      url: "/settings",
    };

    expect(title(data)).toBe(
      'Your Refund Request for <strong class="font-semibold">Intro to TypeScript</strong> was approved'
    );
    expect(describeNotification(feedItem(data))).toMatchObject({
      actor: null,
      detail: "Sorry it didn't work out.",
      courseTitle: "Intro to TypeScript",
      context: "Intro to TypeScript",
      url: "/settings",
    });
  });

  it("tells the buyer of a declined Refund Request they can ask again", () => {
    const data = {
      kind: "refund_request_declined",
      course_title: "Intro to TypeScript",
      url: "/team",
    };

    expect(title(data)).toBe(
      'Your Refund Request for <strong class="font-semibold">Intro to TypeScript</strong> was declined'
    );
    expect(describeNotification(feedItem(data))).toMatchObject({
      actor: null,
      detail: "You can ask again.",
    });
    expect(
      describeNotification(feedItem({ ...data, note: "Most of it was watched." }))?.detail
    ).toBe("Most of it was watched. You can ask again.");
  });

  it("skips a kind Cadence doesn't know", () => {
    expect(
      describeNotification(feedItem({ kind: "course_published", url: "/courses" }))
    ).toBeNull();
  });

  it("describes an Open Refund Request from its buyer", () => {
    const data = {
      kind: "refund_request_opened",
      actor_name: "Ada Lovelace",
      course_title: "Intro to TypeScript",
      amount: "$49.00",
      reason: "It wasn't what I expected.",
      url: "/admin/refunds",
    };

    expect(title(data)).toBe(
      '<strong class="font-semibold">Ada Lovelace</strong> asked for a $49.00 refund on <strong class="font-semibold">Intro to TypeScript</strong>'
    );
    expect(describeNotification(feedItem(data))).toMatchObject({
      actor: "Ada Lovelace",
      detail: "It wasn't what I expected.",
      courseTitle: "Intro to TypeScript",
      context: "Intro to TypeScript",
      url: "/admin/refunds",
    });
  });

  it("describes a claimed Seat with how many Seats are left", () => {
    const data = {
      kind: "seat_claimed",
      actor_name: "Grace Hopper",
      course_title: "Intro to TypeScript",
      seats_left: 3,
      url: "/team",
    };

    expect(title(data)).toBe(
      '<strong class="font-semibold">Grace Hopper</strong> claimed a Seat for <strong class="font-semibold">Intro to TypeScript</strong>'
    );
    expect(describeNotification(feedItem(data))).toMatchObject({
      actor: "Grace Hopper",
      detail: "3 Seats left.",
      courseTitle: "Intro to TypeScript",
      url: "/team",
    });
  });

  it("says Seat, not Seats, when one is left, and none when the last is claimed", () => {
    const seatClaimed = (seatsLeft: number) =>
      describeNotification(
        feedItem({
          kind: "seat_claimed",
          actor_name: "Grace Hopper",
          course_title: "Intro to TypeScript",
          seats_left: seatsLeft,
          url: "/team",
        })
      )?.detail;

    expect(seatClaimed(1)).toBe("1 Seat left.");
    expect(seatClaimed(0)).toBe("No Seats left.");
  });

  it("describes a new Enrollment, with no detail line", () => {
    const data = {
      kind: "enrollment_created",
      actor_name: "Alan Turing",
      course_title: "Intro to TypeScript",
      url: "/instructor/4/students",
    };

    expect(title(data)).toBe(
      '<strong class="font-semibold">Alan Turing</strong> enrolled in <strong class="font-semibold">Intro to TypeScript</strong>'
    );
    expect(describeNotification(feedItem(data))).toMatchObject({
      actor: "Alan Turing",
      detail: null,
      courseTitle: "Intro to TypeScript",
      url: "/instructor/4/students",
    });
  });

  it("describes a Discussion Question with its lesson and snippet", () => {
    const data = {
      kind: "discussion_question",
      actor_name: "Ada Lovelace",
      course_title: "Intro to TypeScript",
      lesson_title: "Generics",
      snippet: "Why does T extend object here?",
      url: "/courses/intro-ts/lessons/7#comment-12",
      commentId: 12,
    };

    expect(title(data)).toBe(
      '<strong class="font-semibold">Ada Lovelace</strong> asked a question on <strong class="font-semibold">Generics</strong>'
    );
    expect(describeNotification(feedItem(data))).toMatchObject({
      actor: "Ada Lovelace",
      detail: "Why does T extend object here?",
      courseTitle: "Intro to TypeScript",
      context: "Intro to TypeScript · Generics",
      url: "/courses/intro-ts/lessons/7#comment-12",
    });
  });

  it("describes a Discussion Reply to the reader's question", () => {
    const data = {
      kind: "discussion_reply",
      actor_name: "Grace Hopper",
      course_title: "Intro to TypeScript",
      lesson_title: "Generics",
      snippet: "Because the constraint needs it.",
      url: "/courses/intro-ts/lessons/7#comment-13",
      commentId: 13,
    };

    expect(title(data)).toBe(
      '<strong class="font-semibold">Grace Hopper</strong> replied to your question on <strong class="font-semibold">Generics</strong>'
    );
    expect(describeNotification(feedItem(data))).toMatchObject({
      actor: "Grace Hopper",
      detail: "Because the constraint needs it.",
      context: "Intro to TypeScript · Generics",
    });
  });
});

describe("badgeLabel", () => {
  it("shows no badge when nothing is unseen", () => {
    expect(badgeLabel(0)).toBeNull();
  });

  it("counts up to nine, then says 9+", () => {
    expect(badgeLabel(1)).toBe("1");
    expect(badgeLabel(9)).toBe("9");
    expect(badgeLabel(10)).toBe("9+");
    expect(badgeLabel(250)).toBe("9+");
  });
});
