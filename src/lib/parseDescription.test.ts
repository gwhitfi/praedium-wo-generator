import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { create, APIError } = vi.hoisted(() => {
    class APIError extends Error {
        constructor(public status: number) {
            super(`API error ${status}`);
        }
    }
    return { create: vi.fn(), APIError };
});

vi.mock("@anthropic-ai/sdk", () => ({
    default: class Anthropic {
        static APIError = APIError;
        messages = { create };
    },
}));

import { MAX_DESCRIPTION_LENGTH, parseDescription } from "./parseDescription";

const draft = {
    propertyText: "123 Maple St",
    unitText: "4B",
    contractorText: "Joe's Plumbing",
    title: "Fix kitchen sink leak",
    notes: null,
    dueDate: "2026-11-06",
    dueDateText: "by Friday",
    areas: [{ name: "Kitchen", lineItems: [{ description: "Replace P-trap under sink", priority: "HIGH" }] }],
};

const reply = (text: string, stop_reason = "end_turn") => ({ stop_reason, content: [{ type: "text", text }] });

beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
    vi.stubEnv("APP_TIMEZONE", "America/New_York");
    vi.useFakeTimers({ now: new Date("2026-11-01T16:00:00Z") });
    vi.spyOn(console, "error").mockImplementation(() => {});
    create.mockResolvedValue(reply(JSON.stringify(draft)));
});

afterEach(() => {
    vi.unstubAllEnvs();
    vi.useRealTimers();
});

describe("parseDescription", () => {
    it("returns the validated draft", async () => {
        const result = await parseDescription(
            "  Kitchen sink at 123 Maple apt 4B is leaking, Joe's Plumbing, by Friday ",
        );

        expect(result).toEqual({ ok: true, draft });
    });

    it("sends only today's date and the description, asking for structured output", async () => {
        await parseDescription("Kitchen sink is leaking");

        const request = create.mock.calls[0][0];
        expect(request.model).toBe("claude-haiku-5-5");
        expect(request.output_config.format.type).toBe("json_schema");
        expect(request.output_config.format.schema.properties).toHaveProperty("propertyText");
        expect(request.messages).toHaveLength(1);
        const content: string = request.messages[0].content;
        expect(content).toMatch(
            /^Today is Sun, Nov 1, 2026 \(2026-11-01\)\.\n\nCalendar:\nMon, Nov 2, 2026 = 2026-11-02\n/,
        );
        expect(content).toContain("\nFri, Nov 6, 2026 = 2026-11-06\n");
        expect(content).toContain(
            "\nSun, Nov 22, 2026 = 2026-11-22\n\n<description>\nKitchen sink is leaking\n</description>",
        );
        expect(content).not.toContain("Nov 23");
    });

    it("rejects an empty or overly long description without calling the API", async () => {
        expect(await parseDescription("   ")).toMatchObject({ ok: false });
        expect(await parseDescription("a".repeat(MAX_DESCRIPTION_LENGTH + 1))).toMatchObject({ ok: false });
        expect(create).not.toHaveBeenCalled();
    });

    it("reports the assistant as unavailable when the request fails or the key is missing", async () => {
        create.mockRejectedValueOnce(new APIError(529));
        expect(await parseDescription("Fix the sink")).toEqual({
            ok: false,
            error: "The assistant isn't available right now. Try again in a minute.",
        });

        vi.stubEnv("ANTHROPIC_API_KEY", "");
        expect(await parseDescription("Fix the sink")).toMatchObject({ ok: false });
        expect(create).toHaveBeenCalledTimes(1);
    });

    it.each([
        ["a refusal", reply("", "refusal")],
        ["a cut-off reply", reply('{"propertyText": "123', "max_tokens")],
        ["a reply that isn't JSON", reply("Sorry, I can't help with that.")],
        ["JSON that doesn't fit the draft", reply(JSON.stringify({ ...draft, areas: [] }))],
    ])("rejects %s", async (_name, response) => {
        create.mockResolvedValueOnce(response);

        const result = await parseDescription("Fix the sink");

        expect(result).toMatchObject({ ok: false, error: expect.stringContaining("couldn't turn that") });
    });

    it("never logs the description", async () => {
        create.mockResolvedValueOnce(reply("not json"));

        await parseDescription("Tenant Ana Ruiz, gate code 4321");

        expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain("4321");
    });
});

describe("weekday deadlines", () => {
    // The model's dueDate is deliberately wrong, to show the server replaces it.
    async function dueDateFor(dueDateText: string | null, modelDate: string | null = "2026-12-31") {
        create.mockResolvedValueOnce(reply(JSON.stringify({ ...draft, dueDate: modelDate, dueDateText })));
        const result = await parseDescription("Fix the sink");
        return result.ok ? result.draft.dueDate : "failed";
    }

    it("uses the first matching weekday after today, however it's phrased", async () => {
        // Today is Sunday, Nov 1.
        expect(await dueDateFor("Friday")).toBe("2026-11-06");
        expect(await dueDateFor("this Friday")).toBe("2026-11-06");
        expect(await dueDateFor("next friday")).toBe("2026-11-06");
        expect(await dueDateFor("by next Wednesday")).toBe("2026-11-04");
        expect(await dueDateFor("Sunday")).toBe("2026-11-08");
    });

    it("never uses today, even when today is that weekday", async () => {
        vi.setSystemTime(new Date("2026-11-06T16:00:00Z")); // Friday, Nov 6

        expect(await dueDateFor("next Friday")).toBe("2026-11-13");
        expect(await dueDateFor("Saturday")).toBe("2026-11-07");
    });

    it("leaves other deadlines to the model", async () => {
        expect(await dueDateFor("by the 20th", "2026-11-20")).toBe("2026-11-20");
        expect(await dueDateFor("Friday the 20th", "2026-11-20")).toBe("2026-11-20");
        expect(await dueDateFor(null, null)).toBeNull();
    });
});
