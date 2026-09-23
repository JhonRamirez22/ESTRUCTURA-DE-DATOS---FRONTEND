import type { ReactNode } from "react";
import BackendAccessGuard from "@/components/BackendAccessGuard";

export default function StaffLayout({ children }: { children: ReactNode }) {
  return <BackendAccessGuard>{children}</BackendAccessGuard>;
}
