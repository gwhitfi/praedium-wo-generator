// Server-only. An organization's data as the files of its export (Settings → Export your data, streamed as a ZIP by
// src/app/(app)/settings/export/route.ts). Every query is scoped to the one organization. Left out on purpose:
// contractor link tokens (they work like passwords), storage keys and API key hashes. Photos are listed by file
// name; the files themselves aren't included yet.
import { describeEvent } from "@/lib/activity";
import { toCsv, type CsvValue } from "@/lib/csv";
import prisma from "@/lib/prisma";
import type { ZipEntry } from "@/lib/zip";

const encoder = new TextEncoder();

// "praedium-export-acme-property-2026-11-10.zip": safe for a Content-Disposition header.
export function exportFileName(organizationName: string, date: Date): string {
    const slug = organizationName
        .toLowerCase()
        .normalize("NFKD")
        // "é" is now "e" plus an accent mark; drop the marks so it reads "e".
        .replace(/[̀-ͯ]/g, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 40);
    return `praedium-export-${slug || "organization"}-${date.toISOString().slice(0, 10)}.zip`;
}

// A copy without the given fields (the joined names the CSV files use, kept out of data.json).
function omitKeys<T extends object, K extends keyof T>(value: T, keys: K[]): Omit<T, K> {
    const copy = { ...value };
    for (const key of keys) delete copy[key];
    return copy;
}

function csvFile(name: string, headers: string[], rows: CsvValue[][]): ZipEntry {
    return { name, data: encoder.encode(toCsv(headers, rows)) };
}

function readme(organizationName: string, exportedAt: Date): string {
    return [
        `Praedium data export for ${organizationName}`,
        `Exported ${exportedAt.toISOString()} (UTC).`,
        "",
        "properties.csv   Properties",
        "units.csv        Units, with their property",
        "contacts.csv     Tenants, contractors and other contacts",
        "work_orders.csv  Work orders, with the contractor and tenant details as they were on the work order",
        "line_items.csv   Line items, with their work order, area, priority, completion and photo file names",
        "activity.csv     The history of every work order",
        "emails.csv       Emails Praedium sent for the organization, and what became of them",
        "data.json        All of the above in one structured file",
        "",
        "Dates and times are in UTC (ISO 8601). Photos are not included in this export.",
        "",
    ].join("\r\n");
}

export async function buildExport(
    organization: { id: string; name: string },
    exportedAt: Date = new Date(),
): Promise<ZipEntry[]> {
    const organizationId = organization.id;
    const [properties, units, contacts, workOrders, lineItems, events, emails] = await Promise.all([
        prisma.property.findMany({ where: { organizationId }, orderBy: { createdAt: "asc" } }),
        prisma.unit.findMany({
            where: { organizationId },
            orderBy: [{ propertyId: "asc" }, { sortOrder: "asc" }],
            include: { property: { select: { displayName: true } } },
        }),
        prisma.contact.findMany({
            where: { organizationId },
            orderBy: { createdAt: "asc" },
            include: { unit: { select: { name: true, property: { select: { displayName: true } } } } },
        }),
        prisma.workOrder.findMany({
            where: { organizationId },
            orderBy: { createdAt: "asc" },
            omit: { publicToken: true },
            include: { property: { select: { displayName: true } }, unit: { select: { name: true } } },
        }),
        prisma.lineItem.findMany({
            where: { area: { workOrder: { organizationId } } },
            orderBy: [
                { area: { workOrder: { createdAt: "asc" } } },
                { area: { sortOrder: "asc" } },
                { sortOrder: "asc" },
            ],
            include: {
                area: { select: { name: true, workOrder: { select: { id: true, jobNumber: true } } } },
                attachments: { select: { id: true, fileName: true }, orderBy: { sortOrder: "asc" } },
            },
        }),
        prisma.workOrderEvent.findMany({
            where: { organizationId },
            orderBy: { createdAt: "asc" },
            include: { workOrder: { select: { jobNumber: true } } },
        }),
        prisma.emailLog.findMany({
            where: { organizationId },
            orderBy: { createdAt: "asc" },
            omit: { resendId: true },
            include: { workOrder: { select: { jobNumber: true } } },
        }),
    ]);

    const activity = events.map((event) => ({ ...event, ...describeEvent(event) }));
    const photoNames = (item: (typeof lineItems)[number]) =>
        item.attachments.map((photo) => photo.fileName ?? photo.id).join("; ");

    return [
        { name: "README.txt", data: encoder.encode(readme(organization.name, exportedAt)) },
        csvFile(
            "properties.csv",
            [
                "id",
                "name",
                "type",
                "address_line_1",
                "address_line_2",
                "city",
                "state",
                "zip",
                "notes",
                "favorite",
                "archived",
                "created_at",
            ],
            properties.map((p) => [
                p.id,
                p.displayName,
                p.propertyType,
                p.addressLine1,
                p.addressLine2,
                p.city,
                p.state,
                p.zipCode,
                p.notes,
                p.favorite,
                p.archived,
                p.createdAt,
            ]),
        ),
        csvFile(
            "units.csv",
            ["id", "property_id", "property", "name", "archived"],
            units.map((u) => [u.id, u.propertyId, u.property.displayName, u.name, u.archived]),
        ),
        csvFile(
            "contacts.csv",
            [
                "id",
                "type",
                "name",
                "first_name",
                "last_name",
                "company",
                "email",
                "phone",
                "address_line_1",
                "address_line_2",
                "city",
                "state",
                "zip",
                "property",
                "unit",
                "in_house",
                "notes",
                "favorite",
                "archived",
                "created_at",
            ],
            contacts.map((c) => [
                c.id,
                c.contactType,
                c.displayName,
                c.firstName,
                c.lastName,
                c.company,
                c.email,
                c.phone,
                c.addressLine1,
                c.addressLine2,
                c.city,
                c.state,
                c.zipCode,
                c.unit?.property.displayName,
                c.unit?.name,
                c.inHouse,
                c.notes,
                c.favorite,
                c.archived,
                c.createdAt,
            ]),
        ),
        csvFile(
            "work_orders.csv",
            [
                "id",
                "job_number",
                "title",
                "status",
                "property",
                "unit",
                "in_house",
                "contractor",
                "contractor_phone",
                "contractor_email",
                "tenant",
                "tenant_phone",
                "tenant_email",
                "notify_tenant",
                "notes",
                "due_date",
                "delivery_method",
                "created_at",
                "sent_at",
                "started_at",
                "completed_at",
                "closed_at",
                "cancelled_at",
                "cancel_reason",
                "completion_notes",
                "archived",
            ],
            workOrders.map((w) => [
                w.id,
                w.jobNumber,
                w.title,
                w.status,
                w.property.displayName,
                w.unit?.name,
                w.inHouse,
                w.contractorName,
                w.contractorPhone,
                w.contractorEmail,
                w.tenantName,
                w.tenantPhone,
                w.tenantEmail,
                w.notifyTenant,
                w.notes,
                w.dueDate?.toISOString().slice(0, 10),
                w.deliveryMethod,
                w.createdAt,
                w.sentAt,
                w.startedAt,
                w.completedAt,
                w.closedAt,
                w.cancelledAt,
                w.cancelReason,
                w.completionNotes,
                w.archived,
            ]),
        ),
        csvFile(
            "line_items.csv",
            [
                "id",
                "work_order_id",
                "job_number",
                "area",
                "description",
                "priority",
                "done",
                "done_at",
                "contractor_notes",
                "photos",
            ],
            lineItems.map((item) => [
                item.id,
                item.area.workOrder.id,
                item.area.workOrder.jobNumber,
                item.area.name,
                item.description,
                item.priority,
                item.completed,
                item.completedAt,
                item.contractorNotes,
                photoNames(item),
            ]),
        ),
        csvFile(
            "activity.csv",
            ["time", "job_number", "type", "by", "what_happened", "note"],
            activity.map((event) => [
                event.createdAt,
                event.workOrder.jobNumber,
                event.type,
                event.actorName ?? (event.byContractor ? "Contractor" : ""),
                event.text,
                event.note,
            ]),
        ),
        csvFile(
            "emails.csv",
            ["time", "kind", "to", "subject", "status", "detail", "job_number"],
            emails.map((email) => [
                email.createdAt,
                email.kind,
                email.to,
                email.subject,
                email.status,
                email.error,
                email.workOrder?.jobNumber,
            ]),
        ),
        {
            name: "data.json",
            data: encoder.encode(
                JSON.stringify(
                    {
                        organization: organization.name,
                        exportedAt: exportedAt.toISOString(),
                        properties,
                        units: units.map((unit) => omitKeys(unit, ["property"])),
                        contacts: contacts.map((contact) => omitKeys(contact, ["unit"])),
                        workOrders: workOrders.map((workOrder) => omitKeys(workOrder, ["property", "unit"])),
                        lineItems: lineItems.map(({ area, attachments, ...item }) => ({
                            ...item,
                            area: area.name,
                            workOrderId: area.workOrder.id,
                            photos: attachments.map((photo) => photo.fileName ?? photo.id),
                        })),
                        activity: activity.map(({ workOrder, detail, ...event }) => ({
                            ...event,
                            jobNumber: workOrder.jobNumber,
                            detail,
                        })),
                        emails: emails.map(({ workOrder, ...email }) => ({
                            ...email,
                            jobNumber: workOrder?.jobNumber,
                        })),
                    },
                    null,
                    2,
                ),
            ),
        },
    ];
}
