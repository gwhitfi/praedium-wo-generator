"use server";

import { getCurrentUser } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { COLOR_SECTIONS_COOKIE, SPLIT_VIEW_COOKIE } from "@/lib/workOrders";
import { z } from "zod";

// Saves the work order list's "Split view by status" setting in a cookie, so the page renders the right view.
export async function setSplitView(enabled: boolean): Promise<void> {
    const result = await getCurrentUser();
    if (result.state !== "ready") throw new Error("Not authorized");

    const on = z.boolean().parse(enabled);
    (await cookies()).set(SPLIT_VIEW_COOKIE, on ? "1" : "0", {
        path: "/work-orders",
        maxAge: 60 * 60 * 24 * 365,
        sameSite: "lax",
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
    });

    revalidatePath("/work-orders");
}

// Saves the work order list's "Color sections" setting in a cookie, like setSplitView.
export async function setColorSections(enabled: boolean): Promise<void> {
    const result = await getCurrentUser();
    if (result.state !== "ready") throw new Error("Not authorized");

    const on = z.boolean().parse(enabled);
    (await cookies()).set(COLOR_SECTIONS_COOKIE, on ? "1" : "0", {
        path: "/work-orders",
        maxAge: 60 * 60 * 24 * 365,
        sameSite: "lax",
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
    });

    revalidatePath("/work-orders");
}
