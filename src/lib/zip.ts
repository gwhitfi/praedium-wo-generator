// Server-only. A minimal ZIP writer for the data export: files are stored uncompressed (method 0), which every unzip
// tool reads, and the archive is produced as a stream of chunks so a large export isn't held to Vercel's 4.5 MB
// limit on a buffered response. No ZIP64: an archive must stay under 4 GB and 65,535 files, far above an export.
import { crc32 } from "node:zlib";

export type ZipEntry = { name: string; data: Uint8Array };

const MAX_SIZE = 0xffffffff;
const MAX_ENTRIES = 0xffff;
// Bit 11: the file names are UTF-8.
const UTF8_FLAG = 0x0800;
const VERSION = 20;

// MS-DOS date and time, as ZIP stores them (two-second resolution, local fields taken from UTC).
function dosDateTime(date: Date): { time: number; date: number } {
    const year = Math.max(1980, date.getUTCFullYear());
    return {
        time: (date.getUTCHours() << 11) | (date.getUTCMinutes() << 5) | Math.floor(date.getUTCSeconds() / 2),
        date: ((year - 1980) << 9) | ((date.getUTCMonth() + 1) << 5) | date.getUTCDate(),
    };
}

type Prepared = { name: Uint8Array; data: Uint8Array; crc: number; offset: number };

function localHeader(entry: Prepared, stamp: { time: number; date: number }): Uint8Array {
    const header = new DataView(new ArrayBuffer(30));
    header.setUint32(0, 0x04034b50, true);
    header.setUint16(4, VERSION, true);
    header.setUint16(6, UTF8_FLAG, true);
    header.setUint16(8, 0, true); // stored
    header.setUint16(10, stamp.time, true);
    header.setUint16(12, stamp.date, true);
    header.setUint32(14, entry.crc, true);
    header.setUint32(18, entry.data.length, true);
    header.setUint32(22, entry.data.length, true);
    header.setUint16(26, entry.name.length, true);
    header.setUint16(28, 0, true);
    return concat([new Uint8Array(header.buffer), entry.name]);
}

function centralHeader(entry: Prepared, stamp: { time: number; date: number }): Uint8Array {
    const header = new DataView(new ArrayBuffer(46));
    header.setUint32(0, 0x02014b50, true);
    header.setUint16(4, VERSION, true);
    header.setUint16(6, VERSION, true);
    header.setUint16(8, UTF8_FLAG, true);
    header.setUint16(10, 0, true);
    header.setUint16(12, stamp.time, true);
    header.setUint16(14, stamp.date, true);
    header.setUint32(16, entry.crc, true);
    header.setUint32(20, entry.data.length, true);
    header.setUint32(24, entry.data.length, true);
    header.setUint16(28, entry.name.length, true);
    // Extra field, comment, disk number, internal and external attributes: all zero.
    header.setUint32(42, entry.offset, true);
    return concat([new Uint8Array(header.buffer), entry.name]);
}

function endOfCentralDirectory(count: number, size: number, offset: number): Uint8Array {
    const record = new DataView(new ArrayBuffer(22));
    record.setUint32(0, 0x06054b50, true);
    record.setUint16(8, count, true);
    record.setUint16(10, count, true);
    record.setUint32(12, size, true);
    record.setUint32(16, offset, true);
    return new Uint8Array(record.buffer);
}

function concat(parts: Uint8Array[]): Uint8Array {
    const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
    let at = 0;
    for (const part of parts) {
        out.set(part, at);
        at += part.length;
    }
    return out;
}

// The archive as a stream: each file's header and data, then the central directory.
export function zipStream(entries: ZipEntry[], modified: Date = new Date()): ReadableStream<Uint8Array> {
    if (entries.length > MAX_ENTRIES) throw new Error("Too many files for a ZIP without ZIP64");
    const stamp = dosDateTime(modified);
    const encoder = new TextEncoder();

    let offset = 0;
    const prepared: Prepared[] = entries.map((entry) => {
        const name = encoder.encode(entry.name);
        const item = { name, data: entry.data, crc: crc32(entry.data), offset };
        offset += 30 + name.length + entry.data.length;
        return item;
    });
    const central = concat(prepared.map((entry) => centralHeader(entry, stamp)));
    if (offset + central.length > MAX_SIZE) throw new Error("Export is too large for a ZIP without ZIP64");

    let index = 0;
    return new ReadableStream<Uint8Array>({
        pull(controller) {
            if (index < prepared.length) {
                const entry = prepared[index++];
                controller.enqueue(localHeader(entry, stamp));
                if (entry.data.length > 0) controller.enqueue(entry.data);
                return;
            }
            controller.enqueue(central);
            controller.enqueue(endOfCentralDirectory(prepared.length, central.length, offset));
            controller.close();
        },
    });
}
