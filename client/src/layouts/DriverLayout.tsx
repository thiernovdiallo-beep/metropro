import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { CalendarDays, CircleHelp, LogOut, Menu, UserRound, X } from "lucide-react";
import { useState } from "react";
import { Link, useLocation } from "wouter";

const DRIVER_LINKS = [
  ["Today's Trip", "/driver", CalendarDays],
  ["Upcoming", "/driver#upcoming-assignments-heading", CalendarDays],
  ["Profile", "/driver#driver-profile", UserRound],
  ["Support", "/driver/support", CircleHelp],
] as const;

export function DriverAuthLayout({ children }: { children: React.ReactNode }) {
  return <div className="flex min-h-screen items-center justify-center bg-[#F5F7F5] px-4 py-10 text-[#2D3E40]">{children}</div>;
}

export function DriverLayout({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const [location] = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  return (
    <div className="min-h-screen bg-[#F5F7F5] text-[#2D3E40]">
      <header className="sticky top-0 z-40 border-b border-[#DDE4E0] bg-white text-[#2D3E40] shadow-sm">
        <div className="mx-auto flex min-h-16 max-w-3xl items-center gap-3 px-4 py-2">
          <Link href="/driver" className="flex min-w-0 items-center gap-3" aria-label="Metro Pro Driver home">
            <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#EAF2F1] text-xs font-extrabold tracking-tight text-[#466D72]">MP</span>
            <span className="truncate text-sm font-bold uppercase tracking-[0.14em] text-[#466D72]">Metro Pro Driver</span>
          </Link>
          <div className="ml-auto hidden items-center gap-3 sm:flex">
            <span className="max-w-40 truncate text-sm text-[#6B7B7D]">{user?.name || user?.email || "Driver"}</span>
            <Button type="button" variant="ghost" size="sm" className="text-[#6B7B7D] hover:bg-[#ECFDF5] hover:text-[#0891B2]" onClick={() => void logout()}><LogOut className="mr-2 h-4 w-4" />Sign out</Button>
          </div>
          <button type="button" className="ml-auto inline-flex h-10 w-10 items-center justify-center rounded-lg border border-[#A8C5D6] text-[#5B8A9A] hover:bg-[#ECFDF5] sm:hidden" aria-label={mobileOpen ? "Close driver navigation" : "Open driver navigation"} aria-expanded={mobileOpen} onClick={() => setMobileOpen(value => !value)}>
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
        <nav aria-label="Driver navigation" className={cn("mx-auto max-w-3xl px-4 pb-3", mobileOpen ? "grid gap-1" : "hidden sm:flex sm:items-center sm:gap-1")}>
          {DRIVER_LINKS.map(([label, path, Icon], index) => {
            const active = index === 0
              ? location === "/driver" || location.startsWith("/driver/trip/")
              : label === "Support" ? location === "/driver/support" : false;
            return <Link key={label} href={path} onClick={() => setMobileOpen(false)} aria-current={active ? "page" : undefined} className={cn("group inline-flex min-h-10 items-center gap-2 rounded-lg px-3 text-sm font-semibold text-[#6B7B7D] transition-colors hover:bg-[#ECFDF5] hover:text-[#0891B2] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#5B8A9A]", mobileOpen && "w-full")}><Icon className="h-4 w-4" aria-hidden="true" /><span className={cn("border-b-2 border-transparent pb-1 transition-colors", active ? "border-[#7FB069] text-[#166534]" : "group-hover:border-[#7FB069]")}>{label}</span></Link>;
          })}
          {mobileOpen ? <Button type="button" variant="ghost" className="mt-2 justify-start text-[#6B7B7D] hover:bg-[#ECFDF5] hover:text-[#0891B2]" onClick={() => void logout()}><LogOut className="mr-2 h-4 w-4" />Sign out</Button> : null}
        </nav>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-6 sm:py-8">{children}</main>
    </div>
  );
}

export default DriverLayout;
