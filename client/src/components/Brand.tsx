import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Menu, X } from "lucide-react";
import { useState } from "react";
import { Link, useLocation } from "wouter";

export function LogoMark({ className = "h-9 w-9" }: { className?: string }) {
  return <img src="/logo.png" alt="Metro Pro" className={`${className} rounded-none object-cover`} />;
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

const HOME_LINKS = [
  { label: "Home", href: "/" },
  { label: "Routes", href: "/#popular-routes" },
  { label: "Schedules", href: "/#trip-search" },
  { label: "About", href: "/#why-metro-pro" },
  { label: "Contact", href: "/#contact" },
];

export function SiteHeader() {
  const { user, isAuthenticated, logout } = useAuth();
  const [location, setLocation] = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
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

  if (location === "/") {
    return (
      <header className="relative z-30 border-b border-[#e4e7ec] bg-white text-[#17202a]">
        <div className="container flex min-h-16 items-center justify-between gap-4 lg:min-h-20">
          <Link href="/" className="shrink-0 no-underline" aria-label="Metro Pro home"><Wordmark /></Link>
          <nav className="hidden items-center gap-5 lg:flex xl:gap-7" aria-label="Main navigation">
            {HOME_LINKS.map(({ label, href }) => (
              <a key={label} href={href} aria-current={label === "Home" ? "page" : undefined}
                className={`inline-flex min-h-11 items-center border-b-2 text-sm font-semibold transition-colors ${label === "Home" ? "border-primary text-primary" : "border-transparent text-[#526473] hover:border-primary hover:text-primary"}`}>
                {label}
              </a>
            ))}
          </nav>
          <div className="hidden items-center gap-2 lg:flex">
            <a href={isAuthenticated ? "/account" : "/#member-sign-in"} className="inline-flex min-h-11 items-center rounded-lg px-4 text-sm font-semibold text-[#314d59] hover:bg-[#f7f8fa] hover:text-primary">{isAuthenticated ? "My trips" : "Sign In"}</a>
            <a href="/#trip-search" className="inline-flex min-h-11 items-center rounded-lg bg-primary px-5 text-sm font-bold uppercase tracking-wide text-white hover:bg-[#0c6670] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">Book Now</a>
          </div>
          <button type="button" className="inline-flex h-11 w-11 items-center justify-center rounded-lg border border-[#e4e7ec] text-primary hover:bg-[#f7f8fa] lg:hidden"
            aria-label={mobileOpen ? "Close navigation" : "Open navigation"} aria-controls="metro-mobile-navigation" aria-expanded={mobileOpen}
            onClick={() => setMobileOpen(!mobileOpen)}>
            {mobileOpen ? <X size={23} aria-hidden="true" /> : <Menu size={23} aria-hidden="true" />}
          </button>
        </div>
        {mobileOpen ? (
          <nav id="metro-mobile-navigation" className="border-t border-[#e4e7ec] bg-white px-4 py-3 shadow-lg lg:hidden" aria-label="Mobile navigation">
            {HOME_LINKS.map(({ label, href }) => (
              <a key={label} href={href} aria-current={label === "Home" ? "page" : undefined} onClick={() => setMobileOpen(false)}
                className={`flex min-h-11 items-center rounded-lg px-3 text-sm font-semibold ${label === "Home" ? "bg-[#e7f4f3] text-primary" : "text-[#314d59] hover:bg-[#f7f8fa]"}`}>
                {label}
              </a>
            ))}
            <a href={isAuthenticated ? "/account" : "/#member-sign-in"} onClick={() => setMobileOpen(false)} className="flex min-h-11 items-center rounded-lg px-3 text-sm font-semibold text-[#314d59] hover:bg-[#f7f8fa]">{isAuthenticated ? "My trips" : "Sign In"}</a>
            <a href="/#trip-search" onClick={() => setMobileOpen(false)} className="mt-2 flex min-h-12 items-center justify-center rounded-lg bg-primary px-4 text-sm font-bold uppercase tracking-wide text-white">Book Now</a>
          </nav>
        ) : null}
      </header>
    );
  }

  // Staff and account screens keep their original navigation and access behavior.
  return (
    <header className="sticky top-0 z-40 border-b border-border/75 bg-white/95 shadow-[0_2px_16px_-12px_rgba(17,70,85,0.35)] backdrop-blur">
      <div className="container flex min-h-16 flex-wrap items-center justify-between gap-2 py-2">
        <Link href="/" className="no-underline"><Wordmark /></Link>
        <nav className="hidden items-center gap-6 text-sm font-medium md:flex">
          <Link href="/" className="text-foreground/80 hover:text-foreground">Book</Link>
          <Link href="/membership" className="text-foreground/80 hover:text-foreground">Membership</Link>
          {user?.role === "driver" || user?.role === "admin" ? <Link href="/driver" className="text-foreground/80 hover:text-foreground">Driver</Link> : null}
          {user?.role === "admin" ? <Link href="/admin" className="text-foreground/80 hover:text-foreground">Admin</Link> : null}
        </nav>
        <div className="flex items-center gap-2">
          {location === "/admin/login" || location === "/admin/setup" || location === "/driver/login" || location === "/driver/setup" ? null : isAuthenticated ? (
            <>
              {!isOps ? <Link href="/account"><Button variant="ghost">My trips</Button></Link> : null}
              <Button variant="outline" onClick={() => logout()}>Sign out</Button>
            </>
          ) : <Button onClick={memberEntry}>Member sign in</Button>}
        </div>
      </div>
    </header>
  );
}

export function SiteFooter() {
  const [location] = useLocation();
  if (location === "/") {
    return (
      <footer className="border-t border-[#e4e7ec] bg-[#f7f8fa] text-[#17202a]">
        <div className="container grid gap-9 py-14 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1fr]">
          <div>
            <Wordmark />
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-[#667085]">Scheduled passenger-van journeys between New York City and Columbus, Ohio. Clear booking, assigned seats and digital tickets.</p>
          </div>
          <FooterGroup title="Metro Pro" links={[["About Us", "/#why-metro-pro"], ["Contact", "/#contact"], ["Membership", "/membership"]]} />
          <FooterGroup title="Travel" links={[["Routes", "/#popular-routes"], ["Schedules", "/#trip-search"], ["Book a Trip", "/#trip-search"], ["Boarding Information", "/#ticket-explainer"]]} />
          <div>
            <FooterGroup title="Support" links={[["Help", "/#frequently-asked-questions"], ["Contact", "/#contact"], ["FAQ", "/#frequently-asked-questions"], ["Member support", "/account/support"]]} />
            <div className="mt-5"><FooterGroup title="Account" links={[["Sign In", "/#member-sign-in"], ["My Bookings", "/#booking-lookup"], ["Profile", "/account/settings"]]} /></div>
          </div>
        </div>
        <div className="border-t border-[#e4e7ec]">
          <div className="container flex flex-wrap items-center justify-between gap-x-5 gap-y-1 py-4 text-xs text-[#667085]">
            <span>© 2026 Metro Pro</span>
            <span>Terms and privacy policies are not yet published.</span>
          </div>
        </div>
        <div className="border-t border-[#e4e7ec]">
          <div className="container flex justify-end gap-6">
            <Link href="/driver/login" className="inline-flex min-h-11 items-center text-xs text-[#667085] underline-offset-4 hover:text-primary hover:underline">Driver sign in</Link>
            <Link href="/admin/login" className="inline-flex min-h-11 items-center text-xs text-[#667085] underline-offset-4 hover:text-primary hover:underline">Admin sign in</Link>
          </div>
        </div>
      </footer>
    );
  }
  return (
    <footer className="border-t border-border bg-gradient-to-br from-white via-[#f2fbfc] to-[#e7f4f3] text-foreground">
      <div className="container grid gap-7 py-12 md:grid-cols-3">
        <div><Wordmark /><p className="mt-3 max-w-xs text-sm leading-relaxed text-muted-foreground">Scheduled passenger-van service between New York City and Columbus. Reliable seats, clear prices, digital tickets.</p></div>
        <div className="text-sm leading-relaxed text-foreground/85"><div className="font-semibold">NYC ↔ Columbus</div><div className="mt-1">Regular $150 · Member's regular seat $100 · Front $200</div><div className="mt-1">Pickup: Port Authority · Columbus Convention Center</div></div>
        <div className="text-sm leading-relaxed text-muted-foreground">Payments by Stripe. Card numbers are never stored by Metro Pro. Membership is $25/month and discounts only the member's own regular seat, not the front seat.</div>
      </div>
      <div className="border-t border-border/60"><div className="container flex justify-end gap-6">
        <Link href="/driver/login" className="inline-flex min-h-11 items-center text-xs text-muted-foreground/90 underline-offset-4 hover:text-primary hover:underline focus-visible:rounded focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">Driver sign in</Link>
        <Link href="/admin/login" className="inline-flex min-h-11 items-center text-xs text-muted-foreground/90 underline-offset-4 hover:text-primary hover:underline focus-visible:rounded focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">Admin sign in</Link>
      </div></div>
    </footer>
  );
}

function FooterGroup({ title, links }: { title: string; links: [string, string][] }) {
  return (
    <div>
      <h2 className="text-sm font-bold uppercase tracking-wider text-[#17202a]">{title}</h2>
      <ul className="mt-4 space-y-1 text-sm text-[#526473]">
        {links.map(([label, href]) => <li key={`${title}-${label}`}><a href={href} className="inline-flex min-h-9 items-center hover:text-primary hover:underline">{label}</a></li>)}
      </ul>
    </div>
  );
}

export function PageShell({ children }: { children: React.ReactNode }) {
  return <div className="flex min-h-screen flex-col"><SiteHeader /><main className="flex-1">{children}</main><SiteFooter /></div>;
}
