import { NextResponse } from "next/server";

import { getDb } from "@/db/client";
import { CLIMB_SENDS_PAGE_SIZE, getClimb, getSendsForClimb } from "@/db/queries";
import { parseId } from "@/lib/parse-id";
import { offsetReachesPaginationLimit, parseOffset } from "@/lib/search-params";
import { getSession } from "@/lib/session";

const headers = { "Cache-Control": "private, no-store" };

type RouteParams = { params: Promise<{ id: string }> };

/** Incremental "load more" for a climb's community-ascents list — the
 * initial page is server-rendered (app/climbs/[id]/page.tsx); this backs
 * subsequent pages so a popular climb's full send history never ships in
 * one payload. */
export async function GET(request: Request, { params }: RouteParams) {
  const { id } = await params;
  const climbId = parseId(id);
  const url = new URL(request.url);

  const safeOffset = parseOffset(url.searchParams);

  const [db, session] = await Promise.all([getDb(), getSession()]);
  // A real error shape, not a valid-looking empty page — the client checks
  // res.ok, and an empty 200 would read as "end of list".
  const climb = climbId === null ? undefined : await getClimb(db, climbId);
  if (!climb) {
    return NextResponse.json({ error: "Climb not found" }, { status: 404, headers });
  }

  if (safeOffset === null) {
    return NextResponse.json({ sends: [], hasMore: false }, { headers });
  }

  const page = await getSendsForClimb(
    db,
    climb.id,
    safeOffset,
    CLIMB_SENDS_PAGE_SIZE,
    session?.user.id ?? null,
  );
  return NextResponse.json(
    {
      ...page,
      hasMore: page.hasMore && !offsetReachesPaginationLimit(safeOffset, CLIMB_SENDS_PAGE_SIZE),
    },
    { headers },
  );
}
