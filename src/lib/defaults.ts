export const PROPERTY_TYPE_LABELS: Record<string, string> = {
    HOUSE: "House",
    DUPLEX: "Duplex",
    TOWNHOUSE: "Townhouse",
    CONDO: "Condo",
    APARTMENT: "Apartment",
    COMMERCIAL: "Commercial",
    LAND: "Land",
};

export const MULTI_UNIT = ["DUPLEX", "APARTMENT", "CONDO", "TOWNHOUSE", "COMMERCIAL"];

export const CONTACT_TYPE_LABELS: Record<string, string> = {
    CONTRACTOR: "Contractor",
    TENANT: "Tenant",
    OTHER: "Other",
};

export const inputClass =
    "w-full rounded-md border border-line-strong bg-surface px-3 py-2 text-sm text-foreground " +
    "placeholder:text-subtle focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent";

export const labelClass = "block text-sm font-medium text-secondary mb-1";

export const WORK_ORDER_STATUS_LABELS: Record<string, string> = {
    DRAFT: "Draft",
    SENT: "Sent",
    IN_PROGRESS: "In progress",
    COMPLETED: "Completed",
    CLOSED: "Closed",
    CANCELLED: "Cancelled",
};

export const STATUS_COLORS: Record<keyof typeof WORK_ORDER_STATUS_LABELS, string> = {
    DRAFT: "border-dashed border-status-draft/50 text-status-draft", // Gray, dashed: not sent yet
    SENT: "border-status-sent/50 text-status-sent", // Blue: waiting on the contractor
    IN_PROGRESS: "border-status-in-progress/50 text-status-in-progress", // Amber: work happening
    COMPLETED: "border-status-completed/50 text-status-completed", // Green: done, needs review
    CLOSED: "border-status-closed/50 text-status-closed", // Violet: filed away
    CANCELLED: "border-status-cancelled/30 text-status-cancelled/70 line-through", // Dim red: work stopped
};

export const PRIORITY_LABELS: Record<string, string> = {
    EMERGENCY: "Emergency",
    HIGH: "High",
    MEDIUM: "Medium",
    LOW: "Low",
};

export const PRIORITY_STYLES: Record<string, string> = {
    EMERGENCY: "border-danger/50 text-danger",
    HIGH: "border-warning/50 text-warning",
};

export const US_STATE_LABELS: Record<string, string> = {
    AL: "Alabama",
    AK: "Alaska",
    AZ: "Arizona",
    AR: "Arkansas",
    CA: "California",
    CO: "Colorado",
    CT: "Connecticut",
    DE: "Delaware",
    DC: "District of Columbia",
    FL: "Florida",
    GA: "Georgia",
    HI: "Hawaii",
    ID: "Idaho",
    IL: "Illinois",
    IN: "Indiana",
    IA: "Iowa",
    KS: "Kansas",
    KY: "Kentucky",
    LA: "Louisiana",
    ME: "Maine",
    MD: "Maryland",
    MA: "Massachusetts",
    MI: "Michigan",
    MN: "Minnesota",
    MS: "Mississippi",
    MO: "Missouri",
    MT: "Montana",
    NE: "Nebraska",
    NV: "Nevada",
    NH: "New Hampshire",
    NJ: "New Jersey",
    NM: "New Mexico",
    NY: "New York",
    NC: "North Carolina",
    ND: "North Dakota",
    OH: "Ohio",
    OK: "Oklahoma",
    OR: "Oregon",
    PA: "Pennsylvania",
    RI: "Rhode Island",
    SC: "South Carolina",
    SD: "South Dakota",
    TN: "Tennessee",
    TX: "Texas",
    UT: "Utah",
    VT: "Vermont",
    VA: "Virginia",
    WA: "Washington",
    WV: "West Virginia",
    WI: "Wisconsin",
    WY: "Wyoming",
};

// The About, FAQ, Contact, Terms and Privacy pages, linked from the Menu dropdown and the mobile menu in both headers.
export const INFO_LINKS: { href: string; label: string }[] = [
    { href: "/about", label: "About" },
    { href: "/faq", label: "FAQ" },
    { href: "/contact", label: "Contact" },
    { href: "/terms", label: "Terms" },
    { href: "/privacy", label: "Privacy" },
];

// Short unit names ("B", "2B", "101") read better as "Unit B"; names with a space ("Unit A", "Apt 101",
// "Upper Level") already say what they are, so they're shown as typed.
export function unitLabel(name: string): string {
    return /\s/.test(name.trim()) ? name.trim() : `Unit ${name.trim()}`;
}

// The contractor dropdown's value for a work order the office handles itself (WorkOrder.inHouse).
export const IN_HOUSE = "in-house";
export const IN_HOUSE_OPTION_LABEL = "In-house (our team)";

// Who a work order is with, for lists and cards: "In-house", the contractor's name, or null if nobody yet.
export function assigneeName(workOrder: { inHouse: boolean; contractorName: string | null }): string | null {
    return workOrder.inHouse ? "In-house" : workOrder.contractorName;
}

// A contact in the contractor dropdowns, marked when they're an employee.
export function assignableContactLabel(contact: { displayName: string; inHouse: boolean }): string {
    return contact.inHouse ? `${contact.displayName} (in-house)` : contact.displayName;
}
