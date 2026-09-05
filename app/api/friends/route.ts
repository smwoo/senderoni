import { getDb } from "@/db/client";
import { getFriendsPage, getPendingFriendRequestCount } from "@/db/queries";
import { parseOffset, offsetReachesPaginationLimit } from "@/lib/search-params";
import { getSession } from "@/lib/session";

const headers = { "Cache-Control": "private, no-store" };
export async function GET(request: Request) {
  const session = await getSession();
  if (!session) return Response.json({ error: "Not signed in" }, { status: 401, headers });
  const params = new URL(request.url).searchParams;
  if (params.get("view") === "count") {
    const count = await getPendingFriendRequestCount(await getDb(), session.user.id);
    return Response.json({ userId: session.user.id, count }, { headers });
  }
  const offset = parseOffset(params);
  const page =
    offset === null
      ? { friends: [], hasMore: false }
      : await getFriendsPage(
          await getDb(),
          session.user.id,
          params.get("view") === "requests",
          offset,
        );
  return Response.json(
    { ...page, hasMore: page.hasMore && !offsetReachesPaginationLimit(offset ?? 0, 20) },
    { headers },
  );
}
