import type { ReactNode } from "react";
import BackendAccessGuard from "@/components/BackendAccessGuard";

export default function HistoryLayout({ children }: { children: ReactNode }) {
  return <BackendAccessGuard>{children}</BackendAccessGuard>;
}
