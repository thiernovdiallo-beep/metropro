import { useAuth } from "@/_core/hooks/useAuth";
import { PageShell } from "@/components/Brand";
import { Redirect } from "wouter";

export function DriverGuard({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <PageShell><div className="container py-16 text-sm text-muted-foreground" role="status">Checking driver access…</div></PageShell>;
  if (user?.role !== "driver" && user?.role !== "admin") return <Redirect to="/driver/login" replace />;
  return <>{children}</>;
}
