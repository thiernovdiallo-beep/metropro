import { startLogin } from "@/const";
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
  const [location] = useLocation();
  const isOps = location.startsWith("/admin") || location.startsWith("/driver");
  return (
    <header className="sticky top-0 z-40 border-b border-border/80 bg-[#f6f1e8]/90 backdrop-blur">
      <div className="container flex h-16 items-center justify-between">
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
          {isAuthenticated ? (
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
            <Button onClick={() => startLogin()}>Sign in</Button>
          )}
        </div>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="border-t border-border bg-primary text-primary-foreground">
      <div className="container grid gap-6 py-10 md:grid-cols-3">
        <div>
          <Wordmark />
          <p className="mt-3 max-w-xs text-sm text-primary-foreground/70">
            Scheduled passenger-van service between New York City and Columbus. Reliable seats,
            clear prices, digital tickets.
          </p>
        </div>
        <div className="text-sm text-primary-foreground/80">
          <div className="font-semibold">NYC ↔ Columbus</div>
          <div className="mt-1">Standard $150 · Member $125</div>
          <div className="mt-1">Pickup: Port Authority · Columbus Convention Center</div>
        </div>
        <div className="text-sm text-primary-foreground/70">
          Payments by Stripe. Never stored as card numbers. Metro Pro Member is $29.99/month and
          is not unlimited travel.
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
