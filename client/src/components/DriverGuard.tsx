import { useAuth } from "@/_core/hooks/useAuth";
import { DriverAuthLayout } from "@/layouts/DriverLayout";
import { Redirect } from "wouter";

export function DriverGuard({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <DriverAuthLayout><div className="container py-16 text-sm text-slate-300" role="status">Checking driver access…</div></DriverAuthLayout>;
  if (user?.role !== "driver" && user?.role !== "admin") return <Redirect to="/driver/login" replace />;
  return <>{children}</>;
}
