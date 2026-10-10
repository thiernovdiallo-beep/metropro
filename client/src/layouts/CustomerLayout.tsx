import React from "react";
import { PageShell } from "@/components/Brand";

/** Customer-facing shell: public navigation, booking actions, and customer footer. */
export function CustomerLayout({ children }: { children: React.ReactNode }) {
  return <PageShell>{children}</PageShell>;
}

export default CustomerLayout;
