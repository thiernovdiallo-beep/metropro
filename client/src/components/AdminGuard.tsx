import { useAuth } from "@/_core/hooks/useAuth";
import { AdminAuthLayout } from "@/layouts/AdminLayout";
import { Redirect } from "wouter";

export function AdminGuard({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <AdminAuthLayout>
        <div className="container py-16 text-sm text-muted-foreground" role="status">
          Checking administrator access…
        </div>
      </AdminAuthLayout>
    );
  }

  if (user?.role !== "admin") return <Redirect to="/admin/login" replace />;
  return <>{children}</>;
}
