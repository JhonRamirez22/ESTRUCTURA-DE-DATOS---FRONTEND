import type { ReactNode } from "react";
import BackendAccessGuard from "@/components/BackendAccessGuard";

export default function AuditLayout({ children }: { children: ReactNode }) {
  return <BackendAccessGuard>{children}</BackendAccessGuard>;
}
