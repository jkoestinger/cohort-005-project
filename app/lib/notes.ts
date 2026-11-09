import { z } from "zod";

export const MAX_NOTE_LENGTH = 2000;

// A Note body as it arrives from the note box: trimmed plain text, capped.
// Empty is allowed: saving an empty box removes the Note.
export const noteBodySchema = z
  .string()
  .trim()
  .max(
    MAX_NOTE_LENGTH,
    `A note can be at most ${MAX_NOTE_LENGTH.toLocaleString("en-US")} characters.`
  );
