// Checks run on the server against the uploaded bytes, not the file name or type the browser reports.

export const MAX_PHOTO_BYTES = 3 * 1024 * 1024;

// How many photos one line item can have.
export const MAX_LINE_ITEM_PHOTOS = 3;

export type PhotoType = { mimeType: "image/jpeg" | "image/png" | "image/webp"; extension: "jpg" | "png" | "webp" };

export type PhotoCheck = { ok: true; type: PhotoType } | { ok: false; error: string };

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function startsWith(bytes: Uint8Array, signature: number[], offset = 0) {
    return signature.every((byte, i) => bytes[offset + i] === byte);
}

function ascii(text: string) {
    return [...text].map((char) => char.charCodeAt(0));
}

export function detectPhotoType(bytes: Uint8Array): PhotoType | null {
    if (startsWith(bytes, [0xff, 0xd8, 0xff])) return { mimeType: "image/jpeg", extension: "jpg" };
    if (startsWith(bytes, PNG_SIGNATURE)) return { mimeType: "image/png", extension: "png" };
    if (startsWith(bytes, ascii("RIFF")) && startsWith(bytes, ascii("WEBP"), 8)) {
        return { mimeType: "image/webp", extension: "webp" };
    }
    return null;
}

export function checkPhoto(bytes: Uint8Array): PhotoCheck {
    if (bytes.length === 0) return { ok: false, error: "Choose a photo." };
    if (bytes.length > MAX_PHOTO_BYTES) return { ok: false, error: "Photos must be 3 MB or smaller." };

    const type = detectPhotoType(bytes);
    if (!type) return { ok: false, error: "Use a JPEG, PNG or WebP photo." };

    return { ok: true, type };
}
