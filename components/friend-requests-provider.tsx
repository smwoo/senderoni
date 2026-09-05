"use client";

import { usePathname } from "next/navigation";
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";

import { useMounted } from "@/hooks/use-mounted";
import { authClient } from "@/lib/auth-client";
import { createFriendRequestCountStore } from "@/lib/friend-request-count";

const FriendRequestsContext = createContext({
  userId: null as string | null,
  count: null as number | null,
  refresh: async () => {},
});

export function FriendRequestsProvider({ children }: { children: ReactNode }) {
  const mounted = useMounted();
  const { data: session, isPending } = authClient.useSession();
  const userId = mounted && !isPending ? (session?.user.id ?? null) : null;
  const pathname = usePathname();
  const previousPath = useRef(pathname);
  const [store] = useState(() => createFriendRequestCountStore());
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);

  useEffect(() => {
    store.setUser(userId);
    if (!userId) return;
    function refreshVisible() {
      if (document.visibilityState === "visible") void store.refresh();
    }
    refreshVisible();
    window.addEventListener("focus", refreshVisible);
    document.addEventListener("visibilitychange", refreshVisible);
    const timer = window.setInterval(refreshVisible, 60_000);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", refreshVisible);
      document.removeEventListener("visibilitychange", refreshVisible);
      store.setUser(null);
    };
  }, [store, userId]);

  useEffect(() => {
    if (previousPath.current !== pathname) {
      previousPath.current = pathname;
      void store.refresh();
    }
  }, [pathname, store]);

  const value = useMemo(
    () => ({
      userId,
      count: snapshot.userId === userId ? snapshot.count : null,
      refresh: store.refresh,
    }),
    [userId, snapshot, store],
  );
  return <FriendRequestsContext value={value}>{children}</FriendRequestsContext>;
}

export function useFriendRequests() {
  return useContext(FriendRequestsContext);
}
