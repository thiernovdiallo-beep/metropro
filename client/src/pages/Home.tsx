import { PageShell } from "@/components/Brand";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { isoDate, money } from "@/lib/format";
import { trpc } from "@/lib/trpc";
import { ArrowRightLeft } from "lucide-react";
import { useMemo, useState } from "react";
import { useLocation } from "wouter";

export default function Home() {
  const [, setLocation] = useLocation();
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
  const member = settingsQuery.data?.memberFareCents ?? 12500;

  return (
    <PageShell>
      <section className="relative overflow-hidden bg-primary text-primary-foreground">
        <div
          className="absolute inset-0 opacity-35"
          style={{
            backgroundImage: "url(/manus-storage/async-images/s18NnSlBLVcEj0ZVrUPW1x/image-2.webp)",
            backgroundSize: "cover",
            backgroundPosition: "center",
          }}
        />
        <div className="absolute inset-0 bg-gradient-to-r from-primary via-primary/90 to-primary/40" />
        <div className="container relative grid gap-10 py-16 md:grid-cols-[1.1fr_0.9fr] md:py-24">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-accent">
              Interstate passenger van
            </p>
            <h1 className="mt-4 max-w-xl font-serif text-4xl leading-tight md:text-5xl">
              New York to Columbus, with a seat you can count on.
            </h1>
            <p className="mt-4 max-w-md text-base text-primary-foreground/80">
              Scheduled departures. Ten seats per van. Standard {money(standard)}, Member{" "}
              {money(member)}. Digital QR tickets, not a flyer taped to a dashboard.
            </p>
          </div>
          <form onSubmit={search} className="ticket-card p-5 text-foreground shadow-2xl">
            <div className="mb-4 flex rounded-lg bg-secondary p-1 text-sm font-semibold">
              <button
                type="button"
                className={`flex-1 rounded-md py-2 ${tripType === "one_way" ? "bg-card shadow-sm" : ""}`}
                onClick={() => setTripType("one_way")}
              >
                One-way
              </button>
              <button
                type="button"
                className={`flex-1 rounded-md py-2 ${tripType === "round_trip" ? "bg-card shadow-sm" : ""}`}
                onClick={() => setTripType("round_trip")}
              >
                Round trip
              </button>
            </div>
            <div className="grid gap-3">
              <div>
                <Label>Departure city</Label>
                <select
                  className="mt-1 h-12 w-full rounded-md border border-input bg-card px-3 text-base"
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
              <div className="flex justify-center">
                <Button type="button" variant="outline" size="icon" onClick={swap} aria-label="Swap cities">
                  <ArrowRightLeft className="h-4 w-4" />
                </Button>
              </div>
              <div>
                <Label>Destination city</Label>
                <select
                  className="mt-1 h-12 w-full rounded-md border border-input bg-card px-3 text-base"
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
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Departure date</Label>
                  <Input
                    type="date"
                    className="mt-1 h-12"
                    value={departDate}
                    onChange={e => setDepartDate(e.target.value)}
                    required
                  />
                </div>
                {tripType === "round_trip" ? (
                  <div>
                    <Label>Return date</Label>
                    <Input
                      type="date"
                      className="mt-1 h-12"
                      value={returnDate}
                      onChange={e => setReturnDate(e.target.value)}
                      required
                    />
                  </div>
                ) : (
                  <div>
                    <Label>Passengers</Label>
                    <Input
                      type="number"
                      min={1}
                      max={10}
                      className="mt-1 h-12"
                      value={passengers}
                      onChange={e => setPassengers(Number(e.target.value))}
                    />
                  </div>
                )}
              </div>
              {tripType === "round_trip" ? (
                <div>
                  <Label>Passengers</Label>
                  <Input
                    type="number"
                    min={1}
                    max={10}
                    className="mt-1 h-12"
                    value={passengers}
                    onChange={e => setPassengers(Number(e.target.value))}
                  />
                </div>
              ) : null}
              <Button type="submit" className="h-12 text-base" disabled={!origin || !dest || origin === dest}>
                Find departures
              </Button>
            </div>
          </form>
        </div>
      </section>
      <section className="container grid gap-6 py-14 md:grid-cols-3">
        {[
          ["Ten assigned seats", "Every departure has its own inventory. When it is gone, it is SOLD OUT."],
          ["Member fare $125", "Metro Pro Member is $29.99/month — not unlimited rides, just a better fare."],
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
        <p>Standard one-way fare $150. Metro Pro Member fare $125. Membership $29.99 per month.</p>
      </noscript>
    </PageShell>
  );
}
