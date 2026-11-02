import { z } from "zod";

const MAX_NOTE_LENGTH = 2000;

const tokenSchema = z.string().min(1).max(100);
const idSchema = z.string().min(1).max(100);
const noteSchema = z
    .string()
    .max(MAX_NOTE_LENGTH)
    .trim()
    .transform((note) => note || null);

export const toggleInput = z.object({ token: tokenSchema, lineItemId: idSchema });
export const noteInput = z.object({ token: tokenSchema, lineItemId: idSchema, note: noteSchema });
export const completeInput = z.object({ token: tokenSchema, completionNotes: noteSchema });
export const photoInput = z.object({ token: tokenSchema, attachmentId: idSchema });
export const openInput = z.object({ token: tokenSchema });
