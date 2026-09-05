import { getDb } from "@/db/client";
import { getFeedPage } from "@/db/queries";
import { parseFeedCursor, parseFeedView } from "@/lib/feed";
import { getSession } from "@/lib/session";

const headers = { "Cache-Control": "private, no-store" };

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) return Response.json({ error: "Not signed in" }, { status: 401, headers });
  const params = new URL(request.url).searchParams;
  const view = parseFeedView(params.get("view"));
  let cursor;
  try {
    cursor = parseFeedCursor(params.get("cursor"), view);
  } catch {
    return Response.json({ error: "Invalid feed cursor" }, { status: 400, headers });
  }
  return Response.json(await getFeedPage(await getDb(), session.user.id, view, cursor), {
    headers,
  });
}
