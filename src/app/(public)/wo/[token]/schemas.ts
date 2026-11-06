import { z } from "zod";

const MAX_NOTE_LENGTH = 2000;

const tokenSchema = z.string().min(1).max(100);
const idSchema = z.string().min(1).max(100);
const noteSchema = z
    .string()
    .max(MAX_NOTE_LENGTH)
    .trim()
    .transform((note) => note || null);
// Whitespace is stripped first (the email shows the code as "304 504").
const codeSchema = z
    .string()
    .overwrite((code) => code.replace(/\s+/g, ""))
    .regex(/^\d{6}$/);

export const toggleInput = z.object({ token: tokenSchema, lineItemId: idSchema });
export const noteInput = z.object({ token: tokenSchema, lineItemId: idSchema, note: noteSchema });
export const completeInput = z.object({ token: tokenSchema, completionNotes: noteSchema });
export const photoInput = z.object({ token: tokenSchema, attachmentId: idSchema });
export const openInput = z.object({ token: tokenSchema });
export const sendCodeInput = z.object({ token: tokenSchema });
export const verifyCodeInput = z.object({
    token: tokenSchema,
    challengeId: idSchema,
    code: codeSchema,
    remember: z.boolean(),
});
// The magic link's `c` parameter: `<challengeId>.<code>`.
export const magicLinkInput = z
    .string()
    .regex(/^[^.]{1,100}\.\d{6}$/)
    .transform((value) => {
        const dot = value.lastIndexOf(".");
        return { challengeId: value.slice(0, dot), code: value.slice(dot + 1) };
    });
