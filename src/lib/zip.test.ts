import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { zipStream } from "./zip";

async function collect(stream: ReadableStream<Uint8Array>): Promise<Buffer> {
    return Buffer.from(await new Response(stream).arrayBuffer());
}

const text = (value: string) => new TextEncoder().encode(value);

describe("zipStream", () => {
    it("writes an archive the standard unzip tool reads back exactly, UTF-8 names included", async () => {
        const files = [
            { name: "README.txt", data: text("Exported from Praedium\r\n") },
            { name: "contacts.csv", data: text('name,email\r\n"Smith, Jo",jo@example.com\r\n') },
            { name: "notes/Café é.txt", data: text("ünïcode ✓") },
            { name: "empty.txt", data: new Uint8Array() },
        ];
        const zip = await collect(zipStream(files, new Date("2026-11-10T12:34:56Z")));

        const dir = mkdtempSync(join(tmpdir(), "praedium-zip-"));
        try {
            const path = join(dir, "export.zip");
            writeFileSync(path, zip);
            // -t checks every file's checksum; it exits non-zero on any error.
            execFileSync("unzip", ["-tq", path]);
            execFileSync("unzip", ["-q", path, "-d", join(dir, "out")]);
            for (const file of files) {
                expect(readFileSync(join(dir, "out", file.name))).toEqual(Buffer.from(file.data));
            }
        } finally {
            rmSync(dir, { recursive: true, force: true });
        }
    });

    it("ends with an end-of-central-directory record that counts every file", async () => {
        const zip = await collect(
            zipStream([
                { name: "a.txt", data: text("a") },
                { name: "b.txt", data: text("bb") },
            ]),
        );
        const end = zip.subarray(zip.length - 22);

        expect(end.readUInt32LE(0)).toBe(0x06054b50);
        expect(end.readUInt16LE(10)).toBe(2);
        // The central directory starts right after the two local entries.
        expect(end.readUInt32LE(16)).toBe(30 + 5 + 1 + (30 + 5 + 2));
    });

    it("produces a valid empty archive", async () => {
        const zip = await collect(zipStream([]));
        expect(zip.length).toBe(22);
        expect(zip.readUInt32LE(0)).toBe(0x06054b50);
    });
});
