import { getDb } from "@/db/client";
import { getClimbersPage } from "@/db/queries";
import { parseOffset, offsetReachesPaginationLimit } from "@/lib/search-params";
import { getSession } from "@/lib/session";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const offset = parseOffset(params);
  const session = await getSession();
  const page =
    offset === null
      ? { climbers: [], hasMore: false }
      : await getClimbersPage(await getDb(), session?.user.id ?? null, {
          name: params.get("name") ?? "",
          offset,
        });
  return Response.json(
    { ...page, hasMore: page.hasMore && !offsetReachesPaginationLimit(offset ?? 0, 20) },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
