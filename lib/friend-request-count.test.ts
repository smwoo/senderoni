import { expect, it, vi } from "vitest";

import { createFriendRequestCountStore } from "@/lib/friend-request-count";

function deferred() {
  let resolve!: (response: Response) => void;
  const promise = new Promise<Response>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

it("does no work until signed in and refreshed, then replaces the count after a request is handled", async () => {
  const fetcher = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(Response.json({ userId: "owner", count: 2 }))
    .mockResolvedValueOnce(Response.json({ userId: "owner", count: 1 }));
  const store = createFriendRequestCountStore(fetcher);
  await store.refresh();
  expect(fetcher).not.toHaveBeenCalled();
  store.setUser("owner");
  expect(fetcher).not.toHaveBeenCalled();
  const changed = vi.fn<() => void>();
  const unsubscribe = store.subscribe(changed);
  await store.refresh();
  expect(fetcher).toHaveBeenCalledWith(
    "/api/friends?view=count",
    expect.objectContaining({ cache: "no-store", signal: expect.any(AbortSignal) }),
  );
  expect(store.getSnapshot()).toEqual({ userId: "owner", count: 2 });
  await store.refresh();
  expect(store.getSnapshot()).toEqual({ userId: "owner", count: 1 });
  expect(changed).toHaveBeenCalledTimes(2);
  unsubscribe();
  store.setUser(null);
  expect(changed).toHaveBeenCalledTimes(2);
  expect(store.getSnapshot()).toEqual({ userId: null, count: null });
});

it("clears account data immediately and ignores a previous account's late response", async () => {
  const pending = deferred();
  const fetcher = vi
    .fn<typeof fetch>()
    .mockReturnValueOnce(pending.promise)
    .mockResolvedValueOnce(Response.json({ userId: "second", count: 1 }));
  const store = createFriendRequestCountStore(fetcher);
  store.setUser("first");
  const first = store.refresh();
  store.setUser("second");
  expect(store.getSnapshot()).toEqual({ userId: "second", count: null });
  expect(fetcher.mock.calls[0][1]!.signal?.aborted).toBe(true);
  await store.refresh();
  pending.resolve(Response.json({ userId: "first", count: 9 }));
  await first;
  expect(store.getSnapshot()).toEqual({ userId: "second", count: 1 });
});

it("keeps the refreshed count when an older response arrives after accepting a request", async () => {
  const pending = deferred();
  const fetcher = vi
    .fn<typeof fetch>()
    .mockReturnValueOnce(pending.promise)
    .mockResolvedValueOnce(Response.json({ userId: "owner", count: 0 }));
  const store = createFriendRequestCountStore(fetcher);
  store.setUser("owner");
  const old = store.refresh();
  await store.refresh();
  pending.resolve(Response.json({ userId: "owner", count: 3 }));
  await old;
  expect(store.getSnapshot()).toEqual({ userId: "owner", count: 0 });
});

it("ignores a response after signing out", async () => {
  const pending = deferred();
  const store = createFriendRequestCountStore(
    vi.fn<typeof fetch>().mockReturnValue(pending.promise),
  );
  store.setUser("owner");
  const old = store.refresh();
  store.setUser(null);
  pending.resolve(Response.json({ userId: "owner", count: 3 }));
  await old;
  expect(store.getSnapshot()).toEqual({ userId: null, count: null });
});

it.each([
  new Response(null, { status: 401 }),
  new Response(null, { status: 500 }),
  Response.json({ userId: "other", count: 2 }),
  Response.json({ userId: "owner", count: -1 }),
  Response.json({ userId: "owner", count: "2" }),
  Response.json(null),
])("hides an unavailable or invalid count and can retry", async (response) => {
  const fetcher = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(Response.json({ userId: "owner", count: 1 }))
    .mockResolvedValueOnce(response)
    .mockResolvedValueOnce(Response.json({ userId: "owner", count: 2 }));
  const store = createFriendRequestCountStore(fetcher);
  store.setUser("owner");
  await store.refresh();
  expect(store.getSnapshot().count).toBe(1);
  await store.refresh();
  expect(store.getSnapshot().count).toBeNull();
  await store.refresh();
  expect(store.getSnapshot().count).toBe(2);
});
