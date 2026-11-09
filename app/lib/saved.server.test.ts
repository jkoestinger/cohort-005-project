import { describe, it, expect, beforeEach } from "vitest";
import { createTestDb, seedBaseData } from "~/test/setup";
import * as schema from "~/db/schema";
import { UserRole } from "~/db/schema";
import { MAX_NOTE_LENGTH } from "./notes";
import {
  getNote,
  isBookmarked,
  listBookmarks,
  listNotes,
  saveNote,
  toggleBookmark,
} from "./saved.server";

type TestDb = ReturnType<typeof createTestDb>;

const NOW = new Date(2026, 9, 6, 12, 0, 0);
const LATER = new Date(2026, 9, 6, 13, 0, 0);
const LATEST = new Date(2026, 9, 6, 14, 0, 0);

let db: TestDb;
let base: ReturnType<typeof seedBaseData>;
let lessonIds: number[];
let student: number;

beforeEach(() => {
  db = createTestDb();
  base = seedBaseData(db);
  student = base.user.id;

  const module = db
    .insert(schema.modules)
    .values({ courseId: base.course.id, title: "Basics", position: 1 })
    .returning()
    .get();

  lessonIds = [1, 2, 3].map(
    (position) =>
      db
        .insert(schema.lessons)
        .values({ moduleId: module.id, title: `Lesson ${position}`, position })
        .returning()
        .get().id
  );
});

function addStudent(name: string) {
  return db
    .insert(schema.users)
    .values({
      name,
      email: `${name.toLowerCase()}@example.com`,
      role: UserRole.Student,
    })
    .returning()
    .get().id;
}

describe("bookmarking a Lesson", () => {
  it("bookmarks a Lesson with no Bookmark", () => {
    expect(toggleBookmark(db, student, lessonIds[0], NOW)).toBe(true);
    expect(isBookmarked(db, student, lessonIds[0])).toBe(true);
  });

  it("removes the Bookmark when toggled again", () => {
    toggleBookmark(db, student, lessonIds[0], NOW);

    expect(toggleBookmark(db, student, lessonIds[0], LATER)).toBe(false);
    expect(isBookmarked(db, student, lessonIds[0])).toBe(false);
  });

  it("never leaves a Student with two Bookmarks on one Lesson", () => {
    toggleBookmark(db, student, lessonIds[0], NOW);
    toggleBookmark(db, student, lessonIds[0], LATER);
    toggleBookmark(db, student, lessonIds[0], LATEST);

    expect(listBookmarks(db, student)).toHaveLength(1);
  });

  it("does not touch another Student's Bookmark on the same Lesson", () => {
    const other = addStudent("Olive");
    toggleBookmark(db, other, lessonIds[0], NOW);

    expect(isBookmarked(db, student, lessonIds[0])).toBe(false);
    expect(toggleBookmark(db, student, lessonIds[0], NOW)).toBe(true);
    expect(isBookmarked(db, other, lessonIds[0])).toBe(true);
  });
});

describe("saving a Note", () => {
  it("creates a Note with the body trimmed", () => {
    const result = saveNote(
      db,
      student,
      lessonIds[0],
      "  # not a heading  ",
      NOW
    );

    expect(result).toEqual({
      ok: true,
      note: { body: "# not a heading", updatedAt: NOW.toISOString() },
    });
    expect(getNote(db, student, lessonIds[0])).toEqual({
      body: "# not a heading",
      updatedAt: NOW.toISOString(),
    });
  });

  it("has no Note on a Lesson the Student has not written about", () => {
    expect(getNote(db, student, lessonIds[0])).toBeUndefined();
  });

  it("replaces the body and moves the last edited time on when saved again", () => {
    saveNote(db, student, lessonIds[0], "first", NOW);
    saveNote(db, student, lessonIds[0], "second", LATER);

    expect(getNote(db, student, lessonIds[0])).toEqual({
      body: "second",
      updatedAt: LATER.toISOString(),
    });
    expect(listNotes(db, student)).toHaveLength(1);
  });

  it("keeps the created time when saved again", () => {
    saveNote(db, student, lessonIds[0], "first", NOW);
    saveNote(db, student, lessonIds[0], "second", LATER);

    const row = db.select().from(schema.notes).get();
    expect(row?.createdAt).toBe(NOW.toISOString());
  });

  it(`accepts a Note of exactly ${MAX_NOTE_LENGTH} characters`, () => {
    const body = "a".repeat(MAX_NOTE_LENGTH);

    expect(saveNote(db, student, lessonIds[0], body, NOW).ok).toBe(true);
    expect(getNote(db, student, lessonIds[0])?.body).toBe(body);
  });

  it(`refuses a Note over ${MAX_NOTE_LENGTH} characters and keeps the old one`, () => {
    saveNote(db, student, lessonIds[0], "kept", NOW);

    const result = saveNote(
      db,
      student,
      lessonIds[0],
      "a".repeat(MAX_NOTE_LENGTH + 1),
      LATER
    );

    expect(result).toEqual({
      ok: false,
      error: "A note can be at most 2,000 characters.",
    });
    expect(getNote(db, student, lessonIds[0])?.body).toBe("kept");
  });

  it("removes the Note when saved empty", () => {
    saveNote(db, student, lessonIds[0], "something", NOW);

    expect(saveNote(db, student, lessonIds[0], "   ", LATER)).toEqual({
      ok: true,
      note: null,
    });
    expect(getNote(db, student, lessonIds[0])).toBeUndefined();
  });
});

describe("the Saved lists", () => {
  it("list only the Student's own Bookmarks, newest first, with Lesson and Course", () => {
    const other = addStudent("Olive");
    toggleBookmark(db, student, lessonIds[0], NOW);
    toggleBookmark(db, student, lessonIds[2], LATER);
    toggleBookmark(db, other, lessonIds[1], LATEST);

    expect(listBookmarks(db, student)).toEqual([
      expect.objectContaining({
        lessonId: lessonIds[2],
        lessonTitle: "Lesson 3",
        courseTitle: "Test Course",
        courseSlug: "test-course",
      }),
      expect.objectContaining({
        lessonId: lessonIds[0],
        lessonTitle: "Lesson 1",
      }),
    ]);
  });

  it("list only the Student's own Notes, most recently edited first, with Lesson and Course", () => {
    const other = addStudent("Olive");
    saveNote(db, student, lessonIds[0], "older", NOW);
    saveNote(db, student, lessonIds[1], "newer", LATER);
    saveNote(db, other, lessonIds[2], "not mine", LATEST);
    saveNote(db, student, lessonIds[0], "edited last", LATEST);

    expect(listNotes(db, student)).toEqual([
      expect.objectContaining({
        lessonId: lessonIds[0],
        body: "edited last",
        lessonTitle: "Lesson 1",
        courseTitle: "Test Course",
        courseSlug: "test-course",
      }),
      expect.objectContaining({ lessonId: lessonIds[1], body: "newer" }),
    ]);
  });
});
