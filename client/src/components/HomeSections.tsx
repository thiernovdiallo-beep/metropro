import React from "react";
import { Wordmark } from "@/components/Brand";
import { ResourceState } from "@/components/MetroUI";
import { isoDate, money } from "@/lib/format";
import {
  Armchair, ArrowRight, CalendarDays, CircleHelp, Clock3,
  MapPinned, QrCode, ShieldCheck, TicketCheck,
} from "lucide-react";
import { Link } from "wouter";

type RouteInfo = {
  id: number;
  originCityId: number;
  destinationCityId: number;
  origin: { name: string; code: string };
  destination: { name: string; code: string };
  standardFareCents: number;
};

const CITY_IMAGES: Record<string, string> = {
  NYC: "/manus-storage/async-images/tDmJ4PSy5Hs9geolWVIGfD/image-2.webp",
  CMH: "/manus-storage/async-images/tDmJ4PSy5Hs9geolWVIGfD/image-3.webp",
};
const DEFAULT_IMAGE = "/manus-storage/async-images/IhzIbhghbmJ0tnSZuu0a46/image-1.webp";

export function PopularRoutes({ routes, date, loading = false, error = false, onRetry }: {
  routes: RouteInfo[]; date: string; loading?: boolean; error?: boolean; onRetry?: () => void;
}) {
  return (
    <section id="popular-routes" className="scroll-mt-24 bg-white py-16 md:py-20" aria-labelledby="routes-title">
      <div className="container">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-primary">The routes</p>
        <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 id="routes-title" className="font-serif text-3xl tracking-tight md:text-4xl">Popular routes</h2>
            <p className="mt-2 text-muted-foreground">Explore our current intercity routes.</p>
          </div>
          <a href="/#trip-search" className="inline-flex min-h-11 items-center gap-2 font-semibold text-primary underline-offset-4 hover:underline">Find a departure <ArrowRight size={17} aria-hidden="true" /></a>
        </div>
        <div className="mt-8"><ResourceState loading={loading} error={error ? "Routes could not be loaded. Please try again." : null}
          empty={routes.length === 0} emptyTitle="No routes to show" emptyDescription="Current routes will appear here when schedules are available." onRetry={onRetry}>
          <div className="mt-8 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {routes.map(route => {
              const params = new URLSearchParams({
                origin: String(route.originCityId), dest: String(route.destinationCityId),
                date: date || isoDate(), pax: "1", type: "one_way",
              });
              return (
                <article key={route.id} className="ticket-card overflow-hidden transition-shadow hover:shadow-lg">
                  <img
                    src={CITY_IMAGES[route.destination.code] ?? DEFAULT_IMAGE}
                    alt={`${route.destination.name} travel destination photograph`}
                    loading="lazy"
                    decoding="async"
                    className="h-40 w-full object-cover"
                  />
                  <div className="p-5">
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">One-way travel</p>
                    <h3 className="mt-2 text-lg font-bold text-foreground">{route.origin.name} <ArrowRight size={16} className="inline text-primary" aria-hidden="true" /> {route.destination.name}</h3>
                    <div className="mt-5 flex flex-wrap items-end justify-between gap-3 border-t border-border pt-4">
                      <p className="text-sm text-muted-foreground">Regular fare <strong className="block text-xl text-foreground">{money(route.standardFareCents)}</strong></p>
                      <Link href={`/search?${params.toString()}`} className="inline-flex min-h-11 items-center gap-2 text-sm font-bold text-primary hover:underline">View schedule <ArrowRight size={16} aria-hidden="true" /></Link>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </ResourceState></div>
      </div>
    </section>
  );
}

const REASONS = [
  { icon: Armchair, title: "Comfortable travel", text: "Enjoy a better journey from departure to arrival." },
  { icon: TicketCheck, title: "Easy booking", text: "Choose your route, seat and trip in a few simple steps." },
  { icon: ShieldCheck, title: "Secure payments", text: "Pay securely through our available payment system." },
  { icon: Clock3, title: "Reliable service", text: "Clear schedules and organized boarding." },
];

export function WhyMetroPro() {
  return (
    <section id="why-metro-pro" className="scroll-mt-24 bg-background py-16 md:py-20" aria-labelledby="why-title">
      <div className="container">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-primary">The Metro Pro difference</p>
        <h2 id="why-title" className="mt-3 font-serif text-3xl tracking-tight md:text-4xl">Why travel with Metro Pro?</h2>
        <div className="mt-9 grid gap-7 sm:grid-cols-2 lg:grid-cols-4">
          {REASONS.map(({ icon: Icon, title, text }) => (
            <div key={title} className="border-t-2 border-primary/60 pt-5">
              <Icon size={30} strokeWidth={1.7} className="text-primary" aria-hidden="true" />
              <h3 className="mt-4 text-lg font-bold text-[#2D3E40]">{title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{text}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

const STEPS = [
  ["01", "Search", "Choose your route and travel date."],
  ["02", "Choose", "Select your preferred trip and available seat."],
  ["03", "Travel", "Complete your booking and receive your digital ticket."],
];

export function HowItWorks() {
  return (
    <section className="bg-white py-16 md:py-20" aria-labelledby="how-title">
      <div className="container">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-primary">Simple from start to finish</p>
        <h2 id="how-title" className="mt-3 font-serif text-3xl tracking-tight md:text-4xl">How it works</h2>
        <div className="mt-9 grid gap-7 md:grid-cols-3">
          {STEPS.map(([number, title, description]) => (
            <div key={number} className="border-t border-border pt-4">
              <span className="font-serif text-5xl text-[#15803D]" aria-hidden="true">{number}</span>
              <h3 className="mt-3 text-lg font-bold uppercase tracking-wide text-[#2D3E40]">{title}</h3>
              <p className="mt-2 text-muted-foreground">{description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export function DigitalTicketStory({ route }: { route?: RouteInfo }) {
  return (
    <section id="ticket-explainer" className="scroll-mt-24 overflow-hidden bg-[#0D2B55] py-16 text-white md:py-20" aria-labelledby="ticket-story-title">
      <div className="container grid items-center gap-12 lg:grid-cols-2">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#E6EEF7]">Ready to board</p>
          <h2 id="ticket-story-title" className="mt-4 max-w-xl font-serif text-4xl leading-tight md:text-5xl">Your ticket, always with you.</h2>
          <p className="mt-5 max-w-lg text-lg leading-relaxed text-white/80">Receive your Metro Pro ticket digitally and present your QR code when boarding.</p>
          <Link href="/account/tickets" className="mt-8 inline-flex min-h-12 items-center rounded-lg bg-white px-6 font-bold text-[#15803D] hover:bg-secondary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white">View my booking <ArrowRight size={17} className="ml-2" aria-hidden="true" /></Link>
          <p className="mt-3 text-sm text-white/65">For guest tickets, use the private booking link provided at checkout.</p>
        </div>
        <div className="mx-auto w-full max-w-sm rounded-[2rem] border-[8px] border-[#A8C5D6] bg-white p-4 text-foreground shadow-2xl" aria-label="Illustration of the information shown on a paid Metro Pro digital ticket; this is not a boarding pass">
          <div className="flex items-center justify-between gap-2 border-b border-dashed border-border pb-4">
            <Wordmark className="h-7 w-auto max-w-[145px]" />
            <span className="rounded-md bg-secondary px-2 py-1 text-[10px] font-bold uppercase tracking-widest text-primary">Ticket preview</span>
          </div>
          <p className="mt-5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Route</p>
          <p className="mt-1 text-lg font-bold">{route ? `${route.origin.name} → ${route.destination.name}` : "Your route appears after booking"}</p>
          <div className="mt-6 grid grid-cols-2 gap-3 border-y border-dashed border-border py-4 text-sm">
            <div><p className="text-muted-foreground">Departure</p><strong>Shown after booking</strong></div>
            <div><p className="text-muted-foreground">Assigned seat</p><strong>Shown after booking</strong></div>
          </div>
          <p className="mt-4 text-xs text-muted-foreground">Booking reference is provided after payment.</p>
          <div className="mt-5 flex items-center justify-center gap-3 rounded-xl bg-background px-3 py-6 text-center text-muted-foreground">
            <QrCode size={52} strokeWidth={1.4} aria-hidden="true" />
            <span className="max-w-32 text-xs">Your private QR code appears on a confirmed ticket.</span>
          </div>
          <p className="mt-3 text-center text-[11px] font-medium text-muted-foreground">Illustration only — not valid for boarding</p>
        </div>
      </div>
    </section>
  );
}

export function TravelInformation() {
  const cards = [
    { icon: MapPinned, title: "Routes & schedules", text: "Find available routes and departure times.", href: "/#trip-search", link: "Search departures" },
    { icon: CalendarDays, title: "Boarding", text: "Find your pickup point and bring your QR ticket to board.", href: "/#ticket-explainer", link: "About digital tickets" },
    { icon: CircleHelp, title: "Support", text: "Need help with your journey or booking? Members can contact support from their account.", href: "/support", link: "Go to support" },
  ];
  return (
    <section id="contact" className="scroll-mt-24 bg-background py-16 md:py-20" aria-labelledby="travel-info-title">
      <div className="container">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-primary">Plan with confidence</p>
        <h2 id="travel-info-title" className="mt-3 font-serif text-3xl tracking-tight md:text-4xl">Travel information</h2>
        <div className="mt-8 grid gap-5 md:grid-cols-3">
          {cards.map(({ icon: Icon, title, text, href, link }) => (
            <article key={title} className="rounded-xl border border-border bg-white p-6">
              <Icon size={29} strokeWidth={1.7} className="text-primary" aria-hidden="true" />
              <h3 className="mt-5 text-lg font-bold">{title}</h3>
              <p className="mt-2 min-h-12 text-sm leading-relaxed text-muted-foreground">{text}</p>
              <a href={href} className="mt-4 inline-flex min-h-11 items-center gap-2 text-sm font-bold text-primary hover:underline">{link} <ArrowRight size={16} aria-hidden="true" /></a>
            </article>
          ))}
        </div>
        <div id="frequently-asked-questions" className="mt-10 scroll-mt-24 border-t border-border pt-8">
          <h3 className="font-serif text-2xl">Common questions</h3>
          <div className="mt-5 grid gap-4 text-sm text-muted-foreground md:grid-cols-3">
            <p><strong className="block text-[#2D3E40]">Can I book without an account?</strong> Yes. Save the private booking link provided at checkout to access your trip later.</p>
            <p><strong className="block text-[#2D3E40]">When do I select a seat?</strong> Choose an available numbered seat after selecting your departure.</p>
            <p><strong className="block text-[#2D3E40]">Where is my QR ticket?</strong> It appears on your digital ticket after payment is confirmed.</p>
          </div>
        </div>
      </div>
    </section>
  );
}

export function FinalBookingCta() {
  return (
    <section className="bg-[#15803D] px-4 py-16 text-center text-white md:py-20" aria-labelledby="final-cta-title">
      <h2 id="final-cta-title" className="font-serif text-3xl md:text-4xl">Ready for your next journey?</h2>
      <p className="mt-3 text-white/80">Book your Metro Pro trip today.</p>
      <a href="/#trip-search" className="mt-7 inline-flex min-h-12 items-center justify-center rounded-lg bg-white px-7 text-sm font-bold uppercase tracking-wide text-[#15803D] hover:bg-secondary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white">Book your trip <ArrowRight size={17} className="ml-2" aria-hidden="true" /></a>
    </section>
  );
}
