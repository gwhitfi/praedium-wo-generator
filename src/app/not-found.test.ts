// The 404 page renders for every missing path, including the static-looking ones the proxy skips (/favicon.ico,
// /_next/...). Clerk's auth() throws on those, so the page must not ask who the visitor is unless Clerk ran.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const requestHeaders = vi.hoisted(() => ({ current: new Headers() }));

vi.mock("next/headers", () => ({ headers: vi.fn(async () => requestHeaders.current) }));
vi.mock("@/lib/auth", () => ({ getCurrentUser: vi.fn() }));
vi.mock("@/lib/notifications", () => ({ navUnreadCount: vi.fn() }));
// The real headers use Clerk's hooks; stand-ins show which one the page chose.
vi.mock("@/components/Nav", () => ({
    default: ({ unreadCount }: { unreadCount: number }) => `[signed-in nav, ${unreadCount} unread]`,
}));
vi.mock("@/components/PublicHeader", () => ({ default: () => "[public header]" }));

import { getCurrentUser } from "@/lib/auth";
import { navUnreadCount } from "@/lib/notifications";
import NotFound from "./not-found";

const user = { id: "user1", aiEnabled: true };
const organization = { id: "org1", name: "Acme Property" };

async function render(): Promise<string> {
    return renderToStaticMarkup(await NotFound());
}

beforeEach(() => {
    vi.clearAllMocks();
    requestHeaders.current = new Headers();
    vi.mocked(navUnreadCount).mockResolvedValue(3);
});

describe("NotFound", () => {
    it("shows the signed-out page without asking Clerk when Clerk's middleware didn't run", async () => {
        vi.mocked(getCurrentUser).mockRejectedValue(new Error("auth() was called without Clerk's middleware"));

        const html = await render();

        expect(getCurrentUser).not.toHaveBeenCalled();
        expect(navUnreadCount).not.toHaveBeenCalled();
        expect(html).toContain("[public header]");
        expect(html).toContain("Go to the home page");
        expect(html).not.toContain("Go to the dashboard");
    });

    it("shows the signed-in page with the unread count when Clerk ran and the user is ready", async () => {
        requestHeaders.current = new Headers({ "x-clerk-auth-status": "signed-in" });
        vi.mocked(getCurrentUser).mockResolvedValue({ state: "ready", user, organization } as never);

        const html = await render();

        expect(getCurrentUser).toHaveBeenCalledTimes(1);
        expect(navUnreadCount).toHaveBeenCalledWith(user, "org1");
        expect(html).toContain("[signed-in nav, 3 unread]");
        expect(html).toContain("Go to the dashboard");
        expect(html).toContain("Archived items are still there");
        expect(html).not.toContain("Go to the home page");
    });

    it.each(["signed-out", "needs-org"])(
        "shows the signed-out page when Clerk ran but the user isn't ready (%s)",
        async (state) => {
            requestHeaders.current = new Headers({ "x-clerk-auth-status": "signed-out" });
            vi.mocked(getCurrentUser).mockResolvedValue({ state } as never);

            const html = await render();

            expect(getCurrentUser).toHaveBeenCalledTimes(1);
            expect(navUnreadCount).not.toHaveBeenCalled();
            expect(html).toContain("[public header]");
            expect(html).toContain("Go to the home page");
        },
    );
});
