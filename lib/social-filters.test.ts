import { expect, it } from "vitest";

import { journalFilterToSearchParams, parseJournalFilter } from "./journal-filter";
import { parseUserSendsFilter, userSendsFilterToSearchParams } from "./user-sends-filter";

it("keeps an exact day in journal and sends URLs, rejecting impossible dates", () => {
  const journal = parseJournalFilter({ date: "2026-09-01" });
  const sends = parseUserSendsFilter({ date: "2026-09-01" });
  expect(journal.date).toBe("2026-09-01");
  expect(sends.date).toBe("2026-09-01");
  expect(journalFilterToSearchParams(journal).get("date")).toBe("2026-09-01");
  expect(userSendsFilterToSearchParams(sends).get("date")).toBe("2026-09-01");
  expect(parseJournalFilter({ date: "2026-02-30" }).date).toBeUndefined();
  expect(parseUserSendsFilter({ date: "2026-02-30" }).date).toBeUndefined();
});
