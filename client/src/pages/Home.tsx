import { PageShell } from "@/components/Brand";
import { startLogin } from "@/const";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { isoDate, money } from "@/lib/format";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { ArrowRightLeft, IdCard, Ticket } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";

export default function Home() {
  const [, setLocation] = useLocation();
  const { isAuthenticated } = useAuth();
  const citiesQuery = trpc.public.cities.useQuery();
  const settingsQuery = trpc.public.settings.useQuery();
  const cities = citiesQuery.data ?? [];
  const nyc = cities.find(c => c.code === "NYC");
  const cmh = cities.find(c => c.code === "CMH");
  const [originId, setOriginId] = useState<number | null>(null);
  const [destId, setDestId] = useState<number | null>(null);
  const [tripType, setTripType] = useState<"one_way" | "round_trip">("one_way");
  const [departDate, setDepartDate] = useState(isoDate());
  const [returnDate, setReturnDate] = useState(isoDate(new Date(Date.now() + 86400000 * 2)));
  const [passengers, setPassengers] = useState(1);

  const origin = originId ?? nyc?.id ?? 0;
  const dest = destId ?? cmh?.id ?? 0;
  const cityOptions = useMemo(
    () => cities.filter(c => c.code === "NYC" || c.code === "CMH"),
    [cities]
  );

  function swap() {
    setOriginId(dest);
    setDestId(origin);
  }

  function search(e: React.FormEvent) {
    e.preventDefault();
    const params = new URLSearchParams({
      origin: String(origin),
      dest: String(dest),
      date: departDate,
      pax: String(passengers),
      type: tripType,
    });
    if (tripType === "round_trip") params.set("return", returnDate);
    setLocation(`/search?${params.toString()}`);
  }

  const standard = settingsQuery.data?.standardFareCents ?? 15000;
  const member = settingsQuery.data?.memberFareCents ?? 10000;
  const front = settingsQuery.data?.frontFareCents ?? 20000;

  useEffect(() => {
    if (isAuthenticated && sessionStorage.getItem("metropro-member-onboarding") === "1") {
      sessionStorage.removeItem("metropro-member-onboarding");
      setLocation("/account/settings");
    }
  }, [isAuthenticated, setLocation]);

  useEffect(() => {
    if (window.location.hash === "#trip-search") {
      document.getElementById("trip-search")?.scrollIntoView({ block: "start" });
    }
  }, []);

  function memberEntry() {
    if (isAuthenticated) { setLocation("/account/settings"); return; }
    sessionStorage.setItem("metropro-member-onboarding", "1");
    startLogin();
  }

  return (
    <PageShell>
      <section className="relative overflow-hidden bg-gradient-to-br from-[#e8f6fb] via-[#f6fbfd] to-[#e9f6ef] text-foreground">
        <div className="pointer-events-none absolute -right-24 -top-36 h-80 w-80 rounded-full bg-[#d4eff1] blur-3xl" />
        <div className="pointer-events-none absolute -bottom-40 left-1/3 h-80 w-80 rounded-full bg-[#dff0fb] blur-3xl" />
        <div className="container relative grid items-center gap-9 py-12 md:grid-cols-[1.05fr_0.95fr] md:gap-12 md:py-20">
          <div className="min-w-0">
            <p className="inline-flex rounded-full border border-primary/20 bg-white/80 px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-primary">
              Reliable travel · NYC ↔ Columbus
            </p>
            <h1 className="mt-6 max-w-xl font-serif text-4xl leading-[1.14] tracking-tight md:text-5xl">
              New York to Columbus, with a seat you can count on.
            </h1>
            <p className="mt-5 max-w-md text-base leading-relaxed text-muted-foreground">
              Scheduled departures between NYC and Columbus. Nine regular seats at {money(standard)}
              and one front passenger seat at {money(front)}. A traveling member pays {money(member)}{" "}
              for their own regular seat.
            </p>
            <div className="mt-8 grid min-w-0 gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-[#badfdf] bg-white/90 p-4 shadow-sm">
                <IdCard className="h-6 w-6 text-primary" aria-hidden="true" />
                <h2 className="mt-3 font-serif text-xl">Member profile</h2>
                <p className="mt-1 min-h-12 text-xs leading-relaxed text-muted-foreground">Sign in, add your name, email, phone and ID photo, then join for $25/month.</p>
                <Button type="button" className="mt-4 min-h-11 w-full" onClick={memberEntry}>
                  {isAuthenticated ? "My member profile" : "Log in / Create profile"}
                </Button>
              </div>
              <div className="rounded-2xl border border-[#c6e3eb] bg-white/90 p-4 shadow-sm">
                <Ticket className="h-6 w-6 text-primary" aria-hidden="true" />
                <h2 className="mt-3 font-serif text-xl">{isAuthenticated ? "Book a ticket" : "Book as a guest"}</h2>
                <p className="mt-1 min-h-12 text-xs leading-relaxed text-muted-foreground">{isAuthenticated ? "Choose a departure and keep your trip in your account. No extra profile steps to buy a regular ticket." : "No sign-in or ID upload. Choose a departure and pay only for your ticket."}</p>
                <a href="#trip-search" className="mt-4 inline-flex min-h-11 w-full items-center justify-center rounded-lg border border-primary/40 bg-white px-4 text-sm font-semibold text-primary hover:bg-secondary">{isAuthenticated ? "Find a departure" : "Book without signing in"}</a>
              </div>
            </div>
          </div>
          <form id="trip-search" onSubmit={search} className="ticket-card min-w-0 scroll-mt-24 p-5 text-foreground sm:p-7">
            <p className="mb-4 font-serif text-xl">Find your seat</p>
            <p className="mb-5 text-xs text-muted-foreground">Search and book with or without a member account.</p>
            <div className="mb-5 flex rounded-xl bg-secondary p-1 text-sm font-semibold">
              <button
                type="button"
                className={`min-h-11 flex-1 rounded-lg px-3 py-2 ${tripType === "one_way" ? "bg-card text-primary shadow-sm" : "text-secondary-foreground"}`}
                onClick={() => setTripType("one_way")}
              >
                One-way
              </button>
              <button
                type="button"
                className={`min-h-11 flex-1 rounded-lg px-3 py-2 ${tripType === "round_trip" ? "bg-card text-primary shadow-sm" : "text-secondary-foreground"}`}
                onClick={() => setTripType("round_trip")}
              >
                Round trip
              </button>
            </div>
            <div className="grid min-w-0 gap-4">
              <div className="form-field">
                <Label>Departure city</Label>
                <select
                  className="h-12 w-full min-w-0 rounded-lg border border-input bg-card px-3 text-base"
                  value={origin}
                  onChange={e => setOriginId(Number(e.target.value))}
                >
                  {cityOptions.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.name}, {c.state}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex justify-center py-0.5">
                <Button type="button" variant="outline" size="icon" className="h-10 w-10 rounded-full bg-white" onClick={swap} aria-label="Swap cities">
                  <ArrowRightLeft className="h-4 w-4" />
                </Button>
              </div>
              <div className="form-field">
                <Label>Destination city</Label>
                <select
                  className="h-12 w-full min-w-0 rounded-lg border border-input bg-card px-3 text-base"
                  value={dest}
                  onChange={e => setDestId(Number(e.target.value))}
                >
                  {cityOptions.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.name}, {c.state}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid min-w-0 gap-4 sm:grid-cols-2">
                <div className="form-field">
                  <Label>Departure date</Label>
                  <Input
                    type="date"
                    className="h-12 min-w-0 bg-white"
                    value={departDate}
                    onChange={e => setDepartDate(e.target.value)}
                    required
                  />
                </div>
                {tripType === "round_trip" ? (
                  <div className="form-field">
                    <Label>Return date</Label>
                    <Input
                      type="date"
                      className="h-12 min-w-0 bg-white"
                      value={returnDate}
                      onChange={e => setReturnDate(e.target.value)}
                      required
                    />
                  </div>
                ) : (
                  <div className="form-field">
                    <Label>Passengers</Label>
                    <Input
                      type="number"
                      min={1}
                      max={10}
                      className="h-12 bg-white"
                      value={passengers}
                      onChange={e => setPassengers(Number(e.target.value))}
                    />
                  </div>
                )}
              </div>
              {tripType === "round_trip" ? (
                <div className="form-field">
                  <Label>Passengers</Label>
                  <Input
                    type="number"
                    min={1}
                    max={10}
                    className="h-12 bg-white"
                    value={passengers}
                    onChange={e => setPassengers(Number(e.target.value))}
                  />
                </div>
              ) : null}
              <Button type="submit" className="mt-1 h-12 w-full text-base" disabled={!origin || !dest || origin === dest}>
                Find departures
              </Button>
            </div>
          </form>
        </div>
      </section>
      <section className="container grid gap-5 py-14 md:grid-cols-3">
        {[
          ["Nine regular, one front", `Regular seats are ${money(standard)}; the front passenger seat is ${money(front)} for everyone.`],
          ["Member regular seat $100", `Membership is $25/month. Your own regular seat is ${money(member)}; companions pay standard fares.`],
          ["QR boarding", "Show your ticket. Drivers scan. Status moves Booked → Checked In → Boarded."],
        ].map(([title, copy]) => (
          <div key={title} className="ticket-card p-6">
            <h2 className="font-serif text-xl">{title}</h2>
            <p className="mt-2 text-sm text-muted-foreground">{copy}</p>
          </div>
        ))}
      </section>
      <noscript>
        <h1>Metro Pro — New York City to Columbus passenger vans</h1>
        <p>Nine regular passenger seats cost $150 each; the front passenger seat is $200. Membership is $25 per month and discounts only the traveling member's own regular seat to $100.</p>
      </noscript>
    </PageShell>
  );
}
