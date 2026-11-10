import { describe, expect, it } from "vitest";
import { csvCell, toCsv } from "./csv";

describe("csvCell", () => {
    it("quotes commas, quotes, line breaks and edge spaces", () => {
        expect(csvCell("Smith, Jo")).toBe('"Smith, Jo"');
        expect(csvCell('the "blue" door')).toBe('"the ""blue"" door"');
        expect(csvCell("line one\nline two")).toBe('"line one\nline two"');
        expect(csvCell(" padded ")).toBe('" padded "');
        expect(csvCell("plain")).toBe("plain");
    });

    it("defuses text that a spreadsheet would run as a formula", () => {
        expect(csvCell('=HYPERLINK("http://evil")')).toBe('"\'=HYPERLINK(""http://evil"")"');
        expect(csvCell("+1 864 555 0100")).toBe("'+1 864 555 0100");
        expect(csvCell("-5 days")).toBe("'-5 days");
        expect(csvCell("@SUM(A1)")).toBe("'@SUM(A1)");
    });

    it("leaves numbers alone, writes dates as ISO and empties as nothing", () => {
        expect(csvCell(-5)).toBe("-5");
        expect(csvCell(true)).toBe("true");
        expect(csvCell(new Date("2026-11-10T12:00:00Z"))).toBe("2026-11-10T12:00:00.000Z");
        expect(csvCell(null)).toBe("");
        expect(csvCell(undefined)).toBe("");
    });
});

describe("toCsv", () => {
    it("starts with a byte order mark and uses CRLF line endings", () => {
        expect(toCsv(["name", "email"], [["Jo", null]])).toBe("﻿name,email\r\nJo,\r\n");
    });
});
