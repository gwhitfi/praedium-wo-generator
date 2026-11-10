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

// 16px text on phones so iOS doesn't zoom into a field on focus; 14px from the sm breakpoint.
export const inputClass =
    "w-full rounded-md border border-line-strong bg-surface px-3 py-2 text-base text-foreground sm:text-sm " +
    "placeholder:text-subtle focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/40 " +
    "disabled:cursor-not-allowed disabled:opacity-60 aria-[invalid=true]:border-danger aria-[invalid=true]:focus:ring-danger/40";

export const labelClass = "block text-sm font-medium text-secondary mb-1";

export const WORK_ORDER_STATUS_LABELS: Record<string, string> = {
    DRAFT: "Draft",
    SENT: "Sent",
    IN_PROGRESS: "In progress",
    COMPLETED: "Completed",
    CLOSED: "Closed",
    CANCELLED: "Cancelled",
};

// Status pills: a light wash of the status color behind neutral text, with a colored dot (STATUS_DOTS; Completed
// gets a check instead). Enough color to scan a long list, too little to compete with the solid green action
// buttons or the priority pills. Draft keeps a dashed outline: it hasn't gone anywhere yet.
export const STATUS_COLORS: Record<keyof typeof WORK_ORDER_STATUS_LABELS, string> = {
    DRAFT: "border-dashed border-line-strong bg-status-draft/8 text-secondary",
    SENT: "border-status-sent/35 bg-status-sent/10 text-secondary",
    IN_PROGRESS: "border-status-in-progress/35 bg-status-in-progress/10 text-secondary",
    COMPLETED: "border-status-completed/35 bg-status-completed/10 text-secondary",
    CLOSED: "border-status-closed/35 bg-status-closed/10 text-secondary",
    CANCELLED: "border-status-cancelled/30 bg-status-cancelled/8 text-muted",
};

// A small colored dot per status, for section headings and legends.
export const STATUS_DOTS: Record<keyof typeof WORK_ORDER_STATUS_LABELS, string> = {
    DRAFT: "bg-status-draft",
    SENT: "bg-status-sent",
    IN_PROGRESS: "bg-status-in-progress",
    COMPLETED: "bg-status-completed",
    CLOSED: "bg-status-closed",
    CANCELLED: "bg-status-cancelled",
};

export const PRIORITY_LABELS: Record<string, string> = {
    EMERGENCY: "Emergency",
    HIGH: "High",
    MEDIUM: "Medium",
    LOW: "Low",
};

// Which email an EmailLog row or an EMAIL_* Activity entry is about.
export const EMAIL_KIND_LABELS: Record<string, string> = {
    WORK_ORDER: "Work order email",
    TENANT_NOTICE: "Tenant notice",
    CANCELLED: "Cancellation email",
    COMPLETED: "Completion notice",
    VERIFY_CODE: "Verification code",
};

export const EMAIL_STATUS_LABELS: Record<string, string> = {
    SENT: "Sent",
    DELIVERED: "Delivered",
    BOUNCED: "Bounced",
    COMPLAINED: "Marked as spam",
    FAILED: "Failed",
    SKIPPED: "Not sent",
};

// Only the urgent priorities are marked. Emergency is a solid red pill; High is orange, kept apart from the amber
// "In progress" status.
export const PRIORITY_STYLES: Record<string, string> = {
    EMERGENCY: "border-danger-strong bg-danger-strong text-white",
    HIGH: "border-priority-high/60 text-priority-high",
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

// The Terms and Privacy pages, linked from the signed-in menu and the public footers. About, FAQ and Contact have
// no content yet, so they aren't linked anywhere until they do.
export const INFO_LINKS: { href: string; label: string }[] = [
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
