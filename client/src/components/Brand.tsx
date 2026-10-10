import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Menu, X } from "lucide-react";
import React, { Children, isValidElement, useState } from "react";
import { Link, useLocation } from "wouter";

export function LogoMark({ className = "h-9 w-9" }: { className?: string }) {
  return <span className={`${className} inline-flex shrink-0 items-center justify-center whitespace-nowrap text-[10px] font-bold uppercase tracking-[0.08em] text-[#166534]`} aria-label="Work in Progress">Work in Progress</span>;
}

export function Wordmark({ className = "h-9 w-auto max-w-[220px]" }: { className?: string }) {
  return <span className={`${className} inline-flex shrink-0 items-center whitespace-nowrap font-semibold tracking-tight text-[#166534]`} aria-label="Work in Progress">Work in Progress</span>;
}

type NavItem = { label: string; href: string; active: boolean };
const CUSTOMER_LINKS = [
  { label: "Home", href: "/" },
  { label: "Routes", href: "/routes" },
  { label: "Membership", href: "/membership" },
  { label: "My trips", href: "/account" },
];

export function SiteHeader() {
  const { isAuthenticated, logout } = useAuth();
  const [location, setLocation] = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const isHome = location === "/";
  const links: NavItem[] = CUSTOMER_LINKS.map(item => ({
    ...item,
    active: item.label === "Home"
      ? location === "/"
      : item.label === "Routes"
        ? location.startsWith("/routes") || location.startsWith("/search") || location.startsWith("/trip")
        : item.label === "Membership"
          ? location === "/membership"
          : location.startsWith("/account") && !location.includes("/support"),
  }));
  const memberEntry = () => {
    if (isAuthenticated) { setLocation("/account/settings"); return; }
    if (!isHome) { window.location.href = "/#member-sign-in"; return; }
    document.getElementById("member-sign-in")?.scrollIntoView({ block: "start", behavior: "smooth" });
    document.getElementById("member-login-email")?.focus();
  };
  const navClass = (active: boolean) => `inline-flex min-h-11 items-center rounded-xl px-3 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#38BDF8] ${active ? "bg-[#DCFCE7] text-[#166534]" : "text-[#64748B] hover:bg-[#ECFDF5] hover:text-[#0891B2]"}`;
  const renderLink = (item: NavItem, mobile = false) => <a key={`${mobile ? "mobile" : "desktop"}-${item.label}`} href={item.href}
    aria-current={item.active ? "page" : undefined} onClick={mobile ? () => setMobileOpen(false) : undefined}
    className={`${navClass(false)} group ${item.active ? "text-white" : ""} ${mobile ? "w-full" : ""}`}>
    <span className={`inline-flex border-b-2 pb-1 transition-colors duration-200 motion-reduce:transition-none ${item.active ? "border-[#16A34A] text-[#166534]" : "border-transparent group-hover:border-[#16A34A] group-hover:text-[#0891B2]"}`}>
      {item.label}
    </span>
  </a>;
  const authAction = isAuthenticated
    ? <Button type="button" variant="outline" onClick={() => logout()}>Sign out</Button>
    : <button type="button" onClick={memberEntry} className={navClass(false)}>Sign In</button>;

  return <header className="metro-site-header relative z-40 border-b border-[#E2E8F0] bg-white text-[#0F172A]">
    <div className="container flex min-h-16 items-center justify-between gap-3 py-2 lg:grid lg:min-h-20 lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
      <Link href="/" className="shrink-0 no-underline focus-visible:rounded-xl" aria-label="Metro Pro home"><Wordmark /></Link>
      <nav className="hidden items-center gap-1 lg:flex lg:justify-self-center" aria-label="Main navigation">
        {links.map(item => renderLink(item))}
      </nav>
      <div className="ml-auto hidden items-center gap-2 lg:ml-0 lg:flex lg:justify-self-end">
        {authAction}
        <a href="/#trip-search" className="metro-action-link metro-header-action min-h-11 px-5 text-sm font-bold uppercase tracking-wide">Book Now</a>
      </div>
      <button type="button" className="ml-auto inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-[#A8C5D6] text-[#0891B2] hover:bg-[#ECFDF5] lg:hidden"
        aria-label={mobileOpen ? "Close navigation" : "Open navigation"} aria-controls="metro-mobile-navigation" aria-expanded={mobileOpen}
        onClick={() => setMobileOpen(!mobileOpen)}>
        {mobileOpen ? <X size={22} aria-hidden="true" /> : <Menu size={22} aria-hidden="true" />}
      </button>
    </div>
    {mobileOpen ? <nav id="metro-mobile-navigation" className="border-t border-[#DDE4E0] bg-[#F5F7F5] px-4 py-3 shadow-lg lg:hidden" aria-label="Mobile navigation">
      <div className="container flex flex-col gap-1 px-0 sm:px-0">{links.map(item => renderLink(item, true))}
        <div className="pt-1">{authAction}</div>
        <a href="/#trip-search" onClick={() => setMobileOpen(false)} className="metro-action-link metro-header-action mt-1 w-full min-h-12 font-bold uppercase tracking-wide">Book Now</a>
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
  return <footer className="metro-site-footer mt-auto border-t border-border bg-background text-foreground">
    <div className="container grid gap-8 py-12 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1fr] lg:py-14">
      <div><Wordmark /><p className="mt-4 max-w-xs text-sm leading-relaxed text-muted-foreground">Scheduled passenger-van journeys between New York City and Columbus, Ohio. Clear booking, assigned seats and digital tickets.</p></div>
      <FooterGroup title="Metro Pro" links={[["About Us", "/about"], ["Contact", "/contact"], ["Membership", "/membership"]]} />
      <FooterGroup title="Travel" links={[["Routes", "/routes"], ["Schedules", "/schedules"], ["Book a Trip", "/#trip-search"], ["Boarding Information", "/travel-information"]]} />
      <div><FooterGroup title="Support" links={[["Help", "/faq"], ["Contact", "/contact"], ["FAQ", "/faq"], ["Member support", "/support"]]} />
        <div className="mt-4"><FooterGroup title="Account" links={[["Sign In", "/#member-sign-in"], ["My Bookings", "/#booking-lookup"], ["Profile", "/account/settings"]]} /></div>
      </div>
    </div>
    <div className="border-t border-border"><div className="container flex flex-wrap items-center justify-between gap-x-5 gap-y-1 py-4 text-xs text-muted-foreground">
      <span>© 2026 MetroPro</span><span><a href="/terms" className="underline underline-offset-4 hover:text-primary">Terms</a> · <a href="/privacy" className="underline underline-offset-4 hover:text-primary">Privacy</a></span>
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
