// CSV for the data export, written for spreadsheets: a UTF-8 byte order mark so Excel reads accents, CRLF line
// endings, quoting as RFC 4180 describes, and text that would start a formula (=, +, -, @, tab, return) prefixed
// with an apostrophe so opening the file can't run anything typed into Praedium.
export type CsvValue = string | number | boolean | Date | null | undefined;

const FORMULA_START = /^[=+\-@\t\r]/;
const NEEDS_QUOTES = /[",\r\n]|^\s|\s$/;

export function csvCell(value: CsvValue): string {
    if (value === null || value === undefined) return "";
    if (value instanceof Date) return value.toISOString();
    if (typeof value !== "string") return String(value);
    const safe = FORMULA_START.test(value) ? `'${value}` : value;
    return NEEDS_QUOTES.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function toCsv(headers: string[], rows: CsvValue[][]): string {
    const lines = [headers, ...rows].map((row) => row.map(csvCell).join(","));
    return `﻿${lines.join("\r\n")}\r\n`;
}
