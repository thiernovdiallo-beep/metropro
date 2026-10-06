import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Menu, X } from "lucide-react";
import React, { Children, isValidElement, useState } from "react";
import { Link, useLocation } from "wouter";

export function LogoMark({ className = "h-9 w-9" }: { className?: string }) {
  return <img src="/logo.png" alt="Metro Pro" className={`${className} shrink-0 rounded-none object-cover`} />;
}

export function Wordmark() {
  return <div className="flex items-center gap-2.5">
    <LogoMark />
    <div className="leading-none">
      <div className="font-serif text-lg tracking-tight text-primary">METRO</div>
      <div className="text-[10px] font-semibold tracking-[0.28em] text-accent">PRO</div>
    </div>
  </div>;
}

type NavItem = { label: string; href: string; active: boolean };
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
  const isHome = location === "/";
  const isOps = location.startsWith("/admin") || location.startsWith("/driver");
  const isStaffLogin = ["/admin/login", "/admin/setup", "/driver/login", "/driver/setup"].includes(location);
  const links: NavItem[] = isHome
    ? HOME_LINKS.map(item => ({ ...item, active: item.label === "Home" }))
    : isOps
      ? [
          { label: "Book", href: "/#trip-search", active: false },
          ...(user?.role === "admin" ? [{ label: "Operations", href: "/admin", active: location.startsWith("/admin") }] : []),
          ...(user?.role === "admin" || user?.role === "driver" ? [{ label: "Driver portal", href: "/driver", active: location.startsWith("/driver") }] : []),
        ]
      : [
          { label: "Home", href: "/", active: false },
          { label: "Routes", href: "/#popular-routes", active: location.startsWith("/search") || location.startsWith("/trip") },
          { label: "Membership", href: "/membership", active: location === "/membership" },
          ...(isAuthenticated ? [{ label: "My trips", href: "/account", active: location.startsWith("/account") }] : []),
        ];
  const memberEntry = () => {
    if (isAuthenticated) { setLocation("/account/settings"); return; }
    if (!isHome) { window.location.href = "/#member-sign-in"; return; }
    document.getElementById("member-sign-in")?.scrollIntoView({ block: "start", behavior: "smooth" });
    document.getElementById("member-login-email")?.focus();
  };
  const navClass = (active: boolean) => `inline-flex min-h-11 items-center rounded-xl px-3 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${active ? "bg-secondary text-primary" : "text-foreground/75 hover:bg-secondary hover:text-primary"}`;
  const renderLink = (item: NavItem, mobile = false) => <a key={`${mobile ? "mobile" : "desktop"}-${item.label}`} href={item.href}
    aria-current={item.active ? "page" : undefined} onClick={mobile ? () => setMobileOpen(false) : undefined}
    className={`${navClass(false)} group ${item.active ? "text-primary" : ""} ${mobile ? "w-full" : ""}`}>
    <span className={`inline-flex border-b-2 pb-1 transition-[border-color] duration-150 motion-reduce:transition-none ${item.active ? "border-primary" : "border-transparent group-hover:border-primary"}`}>
      {item.label}
    </span>
  </a>;
  const authAction = !isStaffLogin && (isAuthenticated && !isHome
    ? <Button type="button" variant="outline" onClick={() => logout()}>Sign out</Button>
    : <button type="button" onClick={memberEntry} className={navClass(false)}>{isAuthenticated ? "My trips" : "Sign In"}</button>);

  return <header className="relative z-40 border-b border-border bg-white text-foreground">
    <div className="container flex min-h-16 items-center justify-between gap-3 py-2 lg:min-h-20">
      <Link href="/" className="shrink-0 no-underline focus-visible:rounded-xl" aria-label="Metro Pro home"><Wordmark /></Link>
      <nav className="hidden items-center gap-1 lg:flex" aria-label={isOps ? "Operations navigation" : "Main navigation"}>
        {links.map(item => renderLink(item))}
      </nav>
      <div className="ml-auto hidden items-center gap-2 lg:flex">
        {authAction}
        <a href="/#trip-search" className="metro-action-link metro-action-link--primary min-h-11 px-5 text-sm font-bold uppercase tracking-wide">Book Now</a>
      </div>
      <button type="button" className="ml-auto inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-border text-primary hover:bg-secondary lg:hidden"
        aria-label={mobileOpen ? "Close navigation" : "Open navigation"} aria-controls="metro-mobile-navigation" aria-expanded={mobileOpen}
        onClick={() => setMobileOpen(!mobileOpen)}>
        {mobileOpen ? <X size={22} aria-hidden="true" /> : <Menu size={22} aria-hidden="true" />}
      </button>
    </div>
    {mobileOpen ? <nav id="metro-mobile-navigation" className="border-t border-border bg-white px-4 py-3 shadow-lg lg:hidden" aria-label="Mobile navigation">
      <div className="container flex flex-col gap-1 px-0 sm:px-0">{links.map(item => renderLink(item, true))}
        {!isStaffLogin && <div className="pt-1">{authAction}</div>}
        <a href="/#trip-search" onClick={() => setMobileOpen(false)} className="metro-action-link metro-action-link--primary mt-1 w-full min-h-12 font-bold uppercase tracking-wide">Book Now</a>
      </div>
    </nav> : null}
  </header>;
}

function FooterGroup({ title, links }: { title: string; links: [string, string][] }) {
  return <div>
    <h2 className="text-sm font-bold uppercase tracking-wider text-foreground">{title}</h2>
    <ul className="mt-4 space-y-1 text-sm text-muted-foreground">
      {links.map(([label, href]) => <li key={`${title}-${label}`}><a href={href} className="inline-flex min-h-11 items-center rounded-sm hover:text-primary hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">{label}</a></li>)}
    </ul>
  </div>;
}

export function SiteFooter() {
  const [location] = useLocation();
  if (location.startsWith("/admin") || location.startsWith("/driver")) return null;
  return <footer className="mt-auto border-t border-border bg-[#f7f8fa] text-foreground">
    <div className="container grid gap-8 py-12 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1fr] lg:py-14">
      <div><Wordmark /><p className="mt-4 max-w-xs text-sm leading-relaxed text-muted-foreground">Scheduled passenger-van journeys between New York City and Columbus, Ohio. Clear booking, assigned seats and digital tickets.</p></div>
      <FooterGroup title="Metro Pro" links={[["About Us", "/#why-metro-pro"], ["Contact", "/#contact"], ["Membership", "/membership"]]} />
      <FooterGroup title="Travel" links={[["Routes", "/#popular-routes"], ["Schedules", "/#trip-search"], ["Book a Trip", "/#trip-search"], ["Boarding Information", "/#ticket-explainer"]]} />
      <div><FooterGroup title="Support" links={[["Help", "/#frequently-asked-questions"], ["Contact", "/#contact"], ["FAQ", "/#frequently-asked-questions"], ["Member support", "/account/support"]]} />
        <div className="mt-4"><FooterGroup title="Account" links={[["Sign In", "/#member-sign-in"], ["My Bookings", "/#booking-lookup"], ["Profile", "/account/settings"]]} /></div>
      </div>
    </div>
    <div className="border-t border-border"><div className="container flex flex-wrap items-center justify-between gap-x-5 gap-y-1 py-4 text-xs text-muted-foreground">
      <span>© 2026 Metro Pro</span><span>Terms and privacy policies are not yet published.</span>
    </div></div>
    <div className="border-t border-border"><div className="container flex justify-end gap-6">
      <Link href="/driver/login" className="inline-flex min-h-11 items-center text-xs text-muted-foreground underline-offset-4 hover:text-primary hover:underline">Driver sign in</Link>
      <Link href="/admin/login" className="inline-flex min-h-11 items-center text-xs text-muted-foreground underline-offset-4 hover:text-primary hover:underline">Admin sign in</Link>
    </div></div>
  </footer>;
}

export function PageShell({ children }: { children: React.ReactNode }) {
  const pageProvidesMain = Children.toArray(children).some(child => isValidElement(child) && child.type === "main");
  return <div className="flex min-h-screen flex-col"><SiteHeader />{pageProvidesMain ? <div className="flex-1">{children}</div> : <main className="flex-1">{children}</main>}<SiteFooter /></div>;
}
