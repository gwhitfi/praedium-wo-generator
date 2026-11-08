import { z } from "zod";

// How many notifications the inbox shows at first, and how many each "Show more" adds.
export const INBOX_PAGE_SIZE = 15;
// Each load reads every notification up to its end (see notificationsPage()), so "Show more" stops here.
export const INBOX_MAX_ITEMS = 1000;

// "Show more": where to continue from, and the unread cut-off the page was first shown with (the inbox marks
// everything seen when it opens, so later loads would otherwise show nothing as unread).
export const loadMoreInput = z.object({
    offset: z.number().int().min(0).max(INBOX_MAX_ITEMS),
    unreadAfter: z.iso.datetime().transform((value) => new Date(value)),
});
