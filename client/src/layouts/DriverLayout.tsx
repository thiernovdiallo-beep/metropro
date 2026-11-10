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
  return <div className="flex min-h-screen items-center justify-center bg-[#F3F5F8] px-4 py-10 text-[#172033]">{children}</div>;
}

export function DriverLayout({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const [location] = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  return (
    <div className="min-h-screen bg-[#F3F5F8] text-[#172033]">
      <header className="sticky top-0 z-40 border-b border-[#E2E8F0] bg-white text-[#172033] shadow-sm">
        <div className="mx-auto flex min-h-16 max-w-3xl items-center gap-3 px-4 py-2">
          <Link href="/driver" className="flex min-w-0 items-center gap-3" aria-label="Metro Pro Driver home">
            <img src="/metropro-transit-corp.png" className="h-10 w-auto max-w-[210px] object-contain object-left" alt="MetroPro Transit Corp. Driver" />
            <span className="sr-only">Driver portal</span>
          </Link>
          <div className="ml-auto hidden items-center gap-3 sm:flex">
            <span className="max-w-40 truncate text-sm text-[#64748B]">{user?.name || user?.email || "Driver"}</span>
            <Button type="button" variant="ghost" size="sm" className="text-[#64748B] hover:bg-[#FFF1ED] hover:text-[#F04424]" onClick={() => void logout()}><LogOut className="mr-2 h-4 w-4" />Sign out</Button>
          </div>
          <button type="button" className="ml-auto inline-flex h-10 w-10 items-center justify-center rounded-lg border border-[#E2E8F0] text-[#0D2B55] hover:bg-[#FFF1ED] sm:hidden" aria-label={mobileOpen ? "Close driver navigation" : "Open driver navigation"} aria-expanded={mobileOpen} onClick={() => setMobileOpen(value => !value)}>
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
        <nav aria-label="Driver navigation" className={cn("mx-auto max-w-3xl px-4 pb-3", mobileOpen ? "grid gap-1" : "hidden sm:flex sm:items-center sm:gap-1")}>
          {DRIVER_LINKS.map(([label, path, Icon], index) => {
            const active = index === 0
              ? location === "/driver" || location.startsWith("/driver/trip/")
              : label === "Support" ? location === "/driver/support" : false;
            return <Link key={label} href={path} onClick={() => setMobileOpen(false)} aria-current={active ? "page" : undefined} className={cn("group inline-flex min-h-10 items-center gap-2 rounded-lg px-3 text-sm font-semibold text-[#64748B] transition-colors hover:bg-[#FFF1ED] hover:text-[#F04424] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#F04424]", mobileOpen && "w-full")}><Icon className="h-4 w-4" aria-hidden="true" /><span className={cn("border-b-2 border-transparent pb-1 transition-colors", active ? "border-[#F04424] text-[#0D2B55]" : "group-hover:border-[#F04424]")}>{label}</span></Link>;
          })}
          {mobileOpen ? <Button type="button" variant="ghost" className="mt-2 justify-start text-[#64748B] hover:bg-[#FFF1ED] hover:text-[#F04424]" onClick={() => void logout()}><LogOut className="mr-2 h-4 w-4" />Sign out</Button> : null}
        </nav>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-6 sm:py-8">{children}</main>
    </div>
  );
}

export default DriverLayout;
