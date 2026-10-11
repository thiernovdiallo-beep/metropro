import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { BarChart3, CalendarDays, CreditCard, Gauge, LogOut, Menu, Route as RouteIcon, Settings, Truck, Users, X } from "lucide-react";
import { useState } from "react";
import { Link, useLocation } from "wouter";

const ADMIN_LINKS = [
  ["Dashboard", "/admin", Gauge],
  ["Bookings", "/admin/bookings", Users],
  ["Trips", "/admin#today-trips", CalendarDays],
  ["Dispatch", "/admin/dispatch", Truck],
  ["Schedule", "/admin/schedule", CalendarDays],
  ["Fleet", "/admin/fleet", Truck],
  ["Routes", "/admin/routes", RouteIcon],
  ["Payments", "/admin/payments", CreditCard],
  ["Support", "/admin/support", Users],
  ["Analytics", "/admin/analytics", BarChart3],
  ["Settings", "/admin/settings", Settings],
] as const;

function isActive(path: string, location: string) {
  if (path === "/admin" || path === "/admin#today-trips") return location === "/admin" || location.startsWith("/admin/trips/");
  return location === path || location.startsWith(`${path}/`);
}

export function AdminNav({ mobile = false, onNavigate }: { mobile?: boolean; onNavigate?: () => void }) {
  const [location] = useLocation();
  return (
    <nav aria-label="Admin navigation" className={mobile ? "grid gap-1" : "hidden lg:flex lg:flex-wrap lg:items-center lg:gap-1"}>
      {ADMIN_LINKS.map(([label, path, Icon]) => {
        const active = isActive(path, location);
        return (
          <Link
            key={`${label}-${path}`}
            href={path}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={cn(
              "group inline-flex min-h-10 items-center gap-2 rounded-lg px-3 text-sm font-semibold text-[#64748B] transition-colors hover:bg-[#FFF1ED] hover:text-[#F04424] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#F04424]",
              mobile && "w-full justify-start"
            )}
          >
            <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span className={cn("border-b-2 border-transparent pb-1 transition-colors", active ? "border-[#F04424] text-[#0D2B55]" : "group-hover:border-[#F04424]")}>{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

export function AdminAuthLayout({ children }: { children: React.ReactNode }) {
  return <div className="flex min-h-screen items-center justify-center bg-[#F3F5F8] px-4 py-10 text-[#172033]">{children}</div>;
}

export function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  return (
    <div className="min-h-screen bg-[#F3F5F8] text-[#172033]">
      <header className="sticky top-0 z-40 border-b border-[#E2E8F0] bg-white text-[#172033] shadow-sm">
        <div className="mx-auto flex min-h-16 max-w-[1600px] items-center gap-4 px-4 py-2 sm:px-6">
          <Link href="/admin" className="flex min-w-0 items-center gap-3" aria-label="Metro Pro Admin dashboard">
            <img src="/metropro-transit-corp.png" className="h-10 w-auto max-w-[210px] object-contain object-left" alt="MetroPro Transit Corp. Admin" />
            <span className="sr-only">Admin portal</span>
          </Link>
          <div className="ml-auto hidden min-w-0 items-center gap-3 lg:flex">
            <span className="max-w-52 truncate text-sm text-[#64748B]">{user?.name || user?.email || "Administrator"}</span>
            <Button type="button" variant="ghost" size="sm" className="text-[#64748B] hover:bg-[#FFF1ED] hover:text-[#F04424]" onClick={() => void logout()}>
              <LogOut className="mr-2 h-4 w-4" aria-hidden="true" /> Sign out
            </Button>
          </div>
          <button type="button" className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-[#E2E8F0] text-[#0D2B55] hover:bg-[#FFF1ED] lg:hidden" aria-label={mobileOpen ? "Close admin navigation" : "Open admin navigation"} aria-expanded={mobileOpen} onClick={() => setMobileOpen(value => !value)}>
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
        <div className="mx-auto hidden max-w-[1600px] px-4 pb-3 sm:px-6 lg:block"><AdminNav /></div>
        {mobileOpen ? <div className="border-t border-[#E2E8F0] px-4 py-3 lg:hidden"><AdminNav mobile onNavigate={() => setMobileOpen(false)} /><Button type="button" variant="ghost" className="mt-3 w-full justify-start text-[#64748B] hover:bg-[#FFF1ED] hover:text-[#F04424]" onClick={() => void logout()}><LogOut className="mr-2 h-4 w-4" />Sign out</Button></div> : null}
      </header>
      <main className="mx-auto max-w-[1600px] px-4 py-6 sm:px-6 sm:py-8">{children}</main>
    </div>
  );
}

export default AdminLayout;
