"use client";

import { useTheme } from "@heroui/react";
import { useRouter } from "next/navigation";
import { RouterProvider } from "react-aria-components";

import { FriendRequestsProvider } from "@/components/friend-requests-provider";

export function Providers({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  // The theme-picker dropdown on the account page has its own `useTheme()`
  // call, but that hook is what actually applies the saved theme to <html> —
  // calling it here too keeps it mounted (and applied) on every page, not
  // just while the account page happens to be on screen.
  useTheme("system");
  return (
    <RouterProvider navigate={router.push}>
      <FriendRequestsProvider>{children}</FriendRequestsProvider>
    </RouterProvider>
  );
}
