import { PageShell } from "@/components/Brand";
import { ADMIN_LOGIN_INTENT_KEY } from "@/const";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { isoDate, money } from "@/lib/format";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { ArrowRightLeft } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "wouter";

export default function Home() {
  const [, setLocation] = useLocation();
  const { user, isAuthenticated, loading } = useAuth();
  const utils = trpc.useUtils();
  const signIn = trpc.memberAuth.signIn.useMutation();
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
  const [memberEmail, setMemberEmail] = useState("");
  const [memberPassword, setMemberPassword] = useState("");
  const [memberError, setMemberError] = useState("");

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
    if (loading || sessionStorage.getItem(ADMIN_LOGIN_INTENT_KEY) !== "1") return;
    sessionStorage.removeItem(ADMIN_LOGIN_INTENT_KEY);
    setLocation(user?.role === "admin" ? "/admin" : "/admin/login");
  }, [loading, user?.role, setLocation]);

  useEffect(() => {
    if (isAuthenticated && sessionStorage.getItem("metropro-member-onboarding") === "1") {
      sessionStorage.removeItem("metropro-member-onboarding");
      setLocation("/account/settings");
    }
  }, [isAuthenticated, setLocation]);

  useEffect(() => {
    const target = window.location.hash.slice(1);
    if (target === "trip-search" || target === "member-sign-in") {
      document.getElementById(target)?.scrollIntoView({ block: "start" });
    }
  }, []);

  async function submitMemberSignIn(event: React.FormEvent) {
    event.preventDefault();
    setMemberError("");
    try {
      const result = await signIn.mutateAsync({ email: memberEmail, password: memberPassword });
      sessionStorage.setItem("metropro-member-session", result.sessionToken);
      sessionStorage.removeItem("metropro-admin-session");
      sessionStorage.removeItem("metropro-driver-session");
      sessionStorage.removeItem("manus-cookie");
      setMemberPassword("");
      await Promise.all([
        utils.auth.me.invalidate(),
        utils.account.memberProfile.invalidate(),
        utils.account.overview.invalidate(),
      ]);
      setLocation("/account");
    } catch (error) {
      setMemberError(error instanceof Error ? error.message : "Could not sign in. Please try again.");
    }
  }

  return (
    <PageShell>
      <main className="bg-gradient-to-b from-[#e8f6fb] via-[#f6fbfd] to-white">
        <div className="container max-w-3xl py-5 sm:py-8">
          <form id="trip-search" onSubmit={search} className="ticket-card scroll-mt-20 p-5 text-foreground sm:p-7">
            <h1 className="font-serif text-2xl sm:text-3xl">Book your trip</h1>
            <p className="mb-5 mt-1 text-sm text-muted-foreground">
              {isAuthenticated ? "Your booking will be saved to your account." : "Book as a guest—no sign-in required."}
            </p>
            <div className="mb-5 flex rounded-xl bg-secondary p-1 text-sm font-semibold">
              <button type="button" className={`min-h-11 flex-1 rounded-lg px-3 py-2 ${tripType === "one_way" ? "bg-card text-primary shadow-sm" : "text-secondary-foreground"}`} onClick={() => setTripType("one_way")}>One-way</button>
              <button type="button" className={`min-h-11 flex-1 rounded-lg px-3 py-2 ${tripType === "round_trip" ? "bg-card text-primary shadow-sm" : "text-secondary-foreground"}`} onClick={() => setTripType("round_trip")}>Round trip</button>
            </div>
            <div className="grid min-w-0 gap-4">
              <div className="form-field">
                <Label htmlFor="trip-origin">Departure city</Label>
                <select id="trip-origin" className="h-12 w-full min-w-0 rounded-lg border border-input bg-card px-3 text-base" value={origin} onChange={e => setOriginId(Number(e.target.value))}>
                  {cityOptions.map(c => <option key={c.id} value={c.id}>{c.name}, {c.state}</option>)}
                </select>
              </div>
              <div className="flex justify-center py-0.5">
                <Button type="button" variant="outline" size="icon" className="h-10 w-10 rounded-full bg-white" onClick={swap} aria-label="Swap cities"><ArrowRightLeft className="h-4 w-4" /></Button>
              </div>
              <div className="form-field">
                <Label htmlFor="trip-destination">Destination city</Label>
                <select id="trip-destination" className="h-12 w-full min-w-0 rounded-lg border border-input bg-card px-3 text-base" value={dest} onChange={e => setDestId(Number(e.target.value))}>
                  {cityOptions.map(c => <option key={c.id} value={c.id}>{c.name}, {c.state}</option>)}
                </select>
              </div>
              <div className="grid min-w-0 gap-4 sm:grid-cols-2">
                <div className="form-field">
                  <Label htmlFor="trip-departure">Departure date</Label>
                  <Input id="trip-departure" type="date" className="h-12 min-w-0 bg-white" value={departDate} onChange={e => setDepartDate(e.target.value)} required />
                </div>
                {tripType === "round_trip" ? (
                  <div className="form-field">
                    <Label htmlFor="trip-return">Return date</Label>
                    <Input id="trip-return" type="date" className="h-12 min-w-0 bg-white" value={returnDate} onChange={e => setReturnDate(e.target.value)} required />
                  </div>
                ) : null}
                <div className="form-field">
                  <Label htmlFor="trip-passengers">Passengers</Label>
                  <Input id="trip-passengers" type="number" min={1} max={10} className="h-12 bg-white" value={passengers} onChange={e => setPassengers(Number(e.target.value))} required />
                </div>
              </div>
              <Button type="submit" className="mt-1 h-12 w-full text-base" disabled={!origin || !dest || origin === dest}>See departures</Button>
            </div>
          </form>

          <div className="mt-8 grid gap-5 md:grid-cols-[1fr_1fr] md:items-stretch">
            <form id="member-sign-in" onSubmit={submitMemberSignIn} className="ticket-card grid scroll-mt-20 gap-3 p-5 sm:p-6">
              <h2 className="font-serif text-2xl">Member sign in</h2>
              <p className="text-sm leading-relaxed text-muted-foreground">Access your trips, tickets and membership.</p>
              <div className="form-field"><Label htmlFor="member-login-email">Email</Label><Input id="member-login-email" type="email" autoComplete="email" className="h-12 bg-white" value={memberEmail} onChange={event => setMemberEmail(event.target.value)} required /></div>
              <div className="form-field"><Label htmlFor="member-login-password">Password</Label><Input id="member-login-password" type="password" autoComplete="current-password" className="h-12 bg-white" value={memberPassword} onChange={event => setMemberPassword(event.target.value)} required /></div>
              {memberError ? <p role="alert" className="text-sm font-medium text-destructive">{memberError}</p> : null}
              <Button type="submit" className="mt-1 h-12 w-full" disabled={signIn.isPending}>{signIn.isPending ? "Signing in…" : "Access my account"}</Button>
              <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-sm"><Link href="/create-account" className="font-semibold text-primary underline">Create a member account</Link><span className="text-muted-foreground">· Account creation is free.</span></div>
              {isAuthenticated ? <Link href="/account" className="text-xs font-semibold text-primary underline">Already signed in? Open my account</Link> : null}
            </form>
            <figure className="overflow-hidden rounded-2xl border border-[#badfdf] bg-[#dcebed]">
              <img src="/manus-storage/async-images/IhzIbhghbmJ0tnSZuu0a46/image-1.webp" alt="Illustrative passenger shuttle van on a tree-lined highway" className="h-full min-h-44 w-full object-cover" loading="lazy" decoding="async" />
            </figure>
          </div>
        </div>
        <section className="container grid gap-5 py-10 md:grid-cols-3">
          {[
            ["Nine regular, one front", `Regular seats are ${money(standard)}; the front passenger seat is ${money(front)} for everyone.`],
            ["Member regular seat $100", `Membership is $25/month. Your own regular seat is ${money(member)}; companions pay standard fares.`],
            ["QR boarding", "Each paid passenger gets a QR ticket. Your assigned driver scans it to confirm you boarded."],
          ].map(([title, copy]) => <div key={title} className="ticket-card p-6"><h2 className="font-serif text-xl">{title}</h2><p className="mt-2 text-sm text-muted-foreground">{copy}</p></div>)}
        </section>
      </main>
      <noscript><h1>Metro Pro — New York City to Columbus passenger vans</h1><p>Nine regular passenger seats cost $150 each; the front passenger seat is $200. Membership is $25 per month and discounts only the traveling member's own regular seat to $100.</p></noscript>
    </PageShell>
  );
}
