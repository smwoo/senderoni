"use client";

import { Button } from "@heroui/react";
import { useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";

import { EmptyState } from "@/components/ui/empty-state";
import { useMounted } from "@/hooks/use-mounted";
import { authClient } from "@/lib/auth-client";

/** Discard displayed data when accounts change and refresh current permissions
 * when returning to a profile or Friends list. No promise of live revocation. */
export function ViewerBoundary({
  viewerId,
  children,
}: {
  viewerId: string | null;
  children: ReactNode;
}) {
  const mounted = useMounted();
  const { data: session, isPending } = authClient.useSession();
  const router = useRouter();
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === "visible") router.refresh();
    };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [router]);
  if (mounted && !isPending && (session?.user.id ?? null) !== viewerId)
    return (
      <EmptyState
        message="Your account changed. Refresh to update this page."
        cta={<Button onPress={() => router.refresh()}>Refresh page</Button>}
      />
    );
  return children;
}
