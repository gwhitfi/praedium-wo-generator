const LOCALE = "en-US";
const DATE_STYLE: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", year: "numeric" };

let warnedMissingTimeZone = false;

export function appTimeZone() {
    const timeZone = process.env.APP_TIMEZONE;
    if (!timeZone) {
        if (!warnedMissingTimeZone) {
            console.warn("APP_TIMEZONE is not set; formatting dates in UTC");
            warnedMissingTimeZone = true;
        }
        return "UTC";
    }
    return timeZone;
}

export function formatDueDate(date: Date, options: { weekday?: boolean } = {}) {
    return date.toLocaleDateString(LOCALE, {
        ...DATE_STYLE,
        ...(options.weekday ? { weekday: "short" } : {}),
        timeZone: "UTC",
    });
}

export function formatTimestamp(date: Date) {
    return date.toLocaleDateString(LOCALE, { ...DATE_STYLE, timeZone: appTimeZone() });
}

// "October 26, 2026 12:22PM" in APP_TIMEZONE.
export function formatFullTimestamp(date: Date): string {
    const timeZone = appTimeZone();
    const day = date.toLocaleDateString(LOCALE, { month: "long", day: "numeric", year: "numeric", timeZone });
    const time = date.toLocaleTimeString(LOCALE, { hour: "numeric", minute: "2-digit", timeZone });
    // Drop the space (a narrow no-break space in newer ICU versions) before AM/PM.
    return `${day} ${time.replace(/\s+(?=[AP]M$)/, "")}`;
}

// "October 26, 2026", for a stored date-only value (midnight UTC, like due dates).
export function formatFullDate(date: Date): string {
    return date.toLocaleDateString(LOCALE, { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
}

// The calendar day `date` falls on in APP_TIMEZONE, as midnight UTC (how due dates are stored).
export function dateInAppTimeZone(date: Date): Date {
    return new Date(new Intl.DateTimeFormat("en-CA", { timeZone: appTimeZone() }).format(date));
}

export function todayInAppTimeZone() {
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: appTimeZone() }).format(new Date());
    return new Date(today);
}
