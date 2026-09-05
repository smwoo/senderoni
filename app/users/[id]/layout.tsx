import type { ReactNode } from "react";

import { ViewerBoundary } from "@/components/viewer-boundary";
import { getSession } from "@/lib/session";

export default async function UserLayout({ children }: { children: ReactNode }) {
  const session = await getSession();
  return <ViewerBoundary viewerId={session?.user.id ?? null}>{children}</ViewerBoundary>;
}
