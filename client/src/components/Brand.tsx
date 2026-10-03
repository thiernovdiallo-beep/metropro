import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Link, useLocation } from "wouter";

export function LogoMark({ className = "h-9 w-9" }: { className?: string }) {
  return (
    <img
      src="/logo.png"
      alt="Metro Pro"
      className={`${className} rounded-none object-cover`}
    />
  );
}

export function Wordmark() {
  return (
    <div className="flex items-center gap-2.5">
      <LogoMark />
      <div className="leading-none">
        <div className="font-serif text-lg tracking-tight text-primary">METRO</div>
        <div className="text-[10px] font-semibold tracking-[0.28em] text-accent">PRO</div>
      </div>
    </div>
  );
}

export function SiteHeader() {
  const { user, isAuthenticated, logout } = useAuth();
  const [location, setLocation] = useLocation();
  const isOps = location.startsWith("/admin") || location.startsWith("/driver");
  const memberEntry = () => {
    if (isAuthenticated) {
      setLocation("/account/settings");
      return;
    }
    if (location !== "/") {
      window.location.href = "/#member-sign-in";
      return;
    }
    document.getElementById("member-sign-in")?.scrollIntoView({ block: "start", behavior: "smooth" });
    document.getElementById("member-login-email")?.focus();
  };
  return (
    <header className="sticky top-0 z-40 border-b border-border/75 bg-white/95 shadow-[0_2px_16px_-12px_rgba(17,70,85,0.35)] backdrop-blur">
      <div className="container flex min-h-16 flex-wrap items-center justify-between gap-2 py-2">
        <Link href="/" className="no-underline">
          <Wordmark />
        </Link>
        <nav className="hidden items-center gap-6 text-sm font-medium md:flex">
          <Link href="/" className="text-foreground/80 hover:text-foreground">
            Book
          </Link>
          <Link href="/membership" className="text-foreground/80 hover:text-foreground">
            Membership
          </Link>
          {user?.role === "driver" || user?.role === "admin" ? (
            <Link href="/driver" className="text-foreground/80 hover:text-foreground">
              Driver
            </Link>
          ) : null}
          {user?.role === "admin" ? (
            <Link href="/admin" className="text-foreground/80 hover:text-foreground">
              Admin
            </Link>
          ) : null}
        </nav>
        <div className="flex items-center gap-2">
          {location === "/admin/login" || location === "/admin/setup" ? null : location === "/" ? (
            <Button onClick={memberEntry}>Member sign in</Button>
          ) : isAuthenticated ? (
            <>
              {!isOps ? (
                <Link href="/account">
                  <Button variant="ghost">My trips</Button>
                </Link>
              ) : null}
              <Button variant="outline" onClick={() => logout()}>
                Sign out
              </Button>
            </>
          ) : (
            <Button onClick={memberEntry}>Member sign in</Button>
          )}
        </div>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="border-t border-border bg-gradient-to-br from-white via-[#f2fbfc] to-[#e7f4f3] text-foreground">
      <div className="container grid gap-7 py-12 md:grid-cols-3">
        <div>
          <Wordmark />
          <p className="mt-3 max-w-xs text-sm leading-relaxed text-muted-foreground">
            Scheduled passenger-van service between New York City and Columbus. Reliable seats,
            clear prices, digital tickets.
          </p>
        </div>
        <div className="text-sm leading-relaxed text-foreground/85">
          <div className="font-semibold">NYC ↔ Columbus</div>
          <div className="mt-1">Regular $150 · Member's regular seat $100 · Front $200</div>
          <div className="mt-1">Pickup: Port Authority · Columbus Convention Center</div>
        </div>
        <div className="text-sm leading-relaxed text-muted-foreground">
          Payments by Stripe. Card numbers are never stored by Metro Pro. Membership is $25/month
          and discounts only the member's own regular seat, not the front seat.
        </div>
      </div>
      <div className="border-t border-border/60">
        <div className="container flex justify-end">
          <Link
            href="/admin/login"
            className="inline-flex min-h-11 items-center text-xs text-muted-foreground/90 underline-offset-4 hover:text-primary hover:underline focus-visible:rounded focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            Admin sign in
          </Link>
        </div>
      </div>
    </footer>
  );
}

export function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="flex-1">{children}</main>
      <SiteFooter />
    </div>
  );
}
