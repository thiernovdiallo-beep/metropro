import { CustomerLayout } from "@/layouts/CustomerLayout";
import {
  DigitalTicketStory, FinalBookingCta, HowItWorks,
  PopularRoutes, TravelInformation, WhyMetroPro,
} from "@/components/HomeSections";
import { ADMIN_LOGIN_INTENT_KEY } from "@/const";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { StatusNotice } from "@/components/MetroUI";
import { isoDate } from "@/lib/format";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { ArrowRight, ArrowRightLeft, LockKeyhole, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "wouter";

export default function Home() {
  const [, setLocation] = useLocation();
  const { user, isAuthenticated, loading } = useAuth();
  const utils = trpc.useUtils();
  const signIn = trpc.memberAuth.signIn.useMutation();
  const citiesQuery = trpc.public.cities.useQuery();
  const routesQuery = trpc.public.routes.useQuery();
  const routes = routesQuery.data ?? [];
  const cities = citiesQuery.data ?? [];
  const routesLoading = routesQuery.isLoading || citiesQuery.isLoading;
  const routesUnavailable = routesQuery.isError || citiesQuery.isError;
  const retryRoutes = () => { void routesQuery.refetch(); void citiesQuery.refetch(); };
  const defaultRoute = routes.find(route => route.origin.code === "NYC" && route.destination.code === "CMH") ?? routes[0];
  const [originId, setOriginId] = useState<number | null>(null);
  const [destId, setDestId] = useState<number | null>(null);
  const [tripType, setTripType] = useState<"one_way" | "round_trip">("one_way");
  const [departDate, setDepartDate] = useState(isoDate());
  const [returnDate, setReturnDate] = useState(isoDate(new Date(Date.now() + 86400000 * 2)));
  const [passengers, setPassengers] = useState(1);
  const [memberEmail, setMemberEmail] = useState("");
  const [memberPassword, setMemberPassword] = useState("");
  const [memberError, setMemberError] = useState("");
  const [bookingReference, setBookingReference] = useState("");
  const [privateAccess, setPrivateAccess] = useState("");
  const [lookupError, setLookupError] = useState("");
  const [lookupPending, setLookupPending] = useState(false);

  const origins = useMemo(
    () => cities.filter(city => routes.some(route => route.originCityId === city.id)),
    [cities, routes]
  );
  const origin = originId && origins.some(city => city.id === originId) ? originId : (defaultRoute?.originCityId ?? 0);
  const fromOrigin = routes.filter(route => route.originCityId === origin);
  const destinations = cities.filter(city => fromOrigin.some(route => route.destinationCityId === city.id));
  const preferredDestination = defaultRoute?.originCityId === origin ? defaultRoute.destinationCityId : fromOrigin[0]?.destinationCityId;
  const dest = destId && destinations.some(city => city.id === destId) ? destId : (preferredDestination ?? 0);

  function swap() {
    if (routes.some(route => route.originCityId === dest && route.destinationCityId === origin)) {
      setOriginId(dest);
      setDestId(origin);
    }
  }

  function search(event: React.FormEvent) {
    event.preventDefault();
    if (!routes.some(route => route.originCityId === origin && route.destinationCityId === dest)) return;
    const params = new URLSearchParams({
      origin: String(origin), dest: String(dest), date: departDate,
      pax: String(passengers), type: tripType,
    });
    if (tripType === "round_trip") params.set("return", returnDate);
    setLocation(`/search?${params.toString()}`);
  }

  async function findBooking(event: React.FormEvent) {
    event.preventDefault();
    setLookupError("");
    const bookingNumber = bookingReference.trim().toUpperCase();
    const accessToken = privateAccess.trim() || sessionStorage.getItem(`metropro-guest:${bookingNumber}`) || undefined;
    if (!bookingNumber) return;
    if (!isAuthenticated && !accessToken) {
      setLookupError("Guest bookings require the private access code from your checkout link. Members can sign in below.");
      return;
    }
    setLookupPending(true);
    try {
      const result = await utils.booking.getByNumber.fetch({ bookingNumber, accessToken });
      if (!result) throw new Error("Booking not found.");
      const params = new URLSearchParams({ booking: bookingNumber });
      if (accessToken) params.set("access", accessToken);
      setLocation(`/confirmation?${params.toString()}`);
    } catch {
      setLookupError("We couldn't find a booking with that reference and access. Check your details or use your private booking link.");
    } finally {
      setLookupPending(false);
    }
  }

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
    if (target) document.getElementById(target)?.scrollIntoView({ block: "start" });
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
    <CustomerLayout>
      <section className="relative h-[340px] overflow-hidden bg-[#0D2B55] text-white sm:h-[440px] lg:h-[640px]" aria-labelledby="home-hero-title">
        <img
          src="/manus-storage/async-images/tDmJ4PSy5Hs9geolWVIGfD/image-1.webp"
          alt=""
          aria-hidden="true"
          className="absolute inset-0 h-full w-full object-cover object-[65%_center]"
          fetchPriority="high"
          decoding="async"
        />
        <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(15,23,42,0.42)_0%,rgba(8,145,178,0.26)_47%,rgba(22,163,74,0.12)_100%)]" />
        <div className="container relative flex h-full items-start pt-9 sm:pt-16 lg:pt-28">
          <div className="max-w-2xl">
            <p className="text-xs font-bold uppercase tracking-[0.23em] text-[#E6EEF7]">Travel with Metro Pro</p>
            <h1 id="home-hero-title" className="mt-4 max-w-xl font-serif text-[2.3rem] leading-[1.08] tracking-tight sm:text-5xl lg:text-[3.75rem]">Travel comfortably.<br />Arrive confidently.</h1>
            <p className="mt-4 max-w-md text-base leading-relaxed text-white/90 sm:text-lg">Safe, comfortable and reliable journeys to your destination.</p>
            <p className="mt-4 text-sm font-medium text-white/80">New York City ↔ Columbus, Ohio</p>
          </div>
        </div>
      </section>

      <div className="relative z-10 -mt-12 pb-9 sm:-mt-16 lg:-mt-24">
        <div className="container">
          <form id="trip-search" onSubmit={search} className="ticket-card scroll-mt-24 px-5 py-6 sm:px-7 sm:py-7" aria-label="Search Metro Pro departures">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="font-serif text-2xl font-bold">Book your journey</h2>
              <p className="text-xs font-medium text-muted-foreground">{isAuthenticated ? "Your trip will be saved to your account" : "Guest booking · No sign-in needed"}</p>
            </div>
            <div className="mt-5 flex gap-5 border-b border-border text-sm font-bold" role="group" aria-label="Trip type">
              <button type="button" aria-pressed={tripType === "one_way"} className={`min-h-11 border-b-2 px-1 ${tripType === "one_way" ? "border-primary text-primary" : "border-transparent text-muted-foreground"}`} onClick={() => setTripType("one_way")}>One way</button>
              <button type="button" aria-pressed={tripType === "round_trip"} className={`min-h-11 border-b-2 px-1 ${tripType === "round_trip" ? "border-primary text-primary" : "border-transparent text-muted-foreground"}`} onClick={() => setTripType("round_trip")}>Round trip</button>
            </div>
            <div className="mt-5 grid min-w-0 items-end gap-4 lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_minmax(0,0.85fr)_minmax(0,0.65fr)]">
              <div className="form-field">
                <Label htmlFor="trip-origin" className="metro-form-label">From</Label>
                <select id="trip-origin" className="metro-control" value={origin} onChange={event => { setOriginId(Number(event.target.value)); setDestId(null); }} disabled={routesLoading || routesUnavailable} required>
                  {origins.length ? origins.map(city => <option key={city.id} value={city.id}>{city.name}, {city.state}</option>) : <option value="0">{routesUnavailable ? "Routes unavailable" : routesLoading ? "Loading routes…" : "No current routes"}</option>}
                </select>
              </div>
              <Button type="button" variant="outline" className="h-11 w-11 justify-self-center rounded-full p-0 lg:mb-0.5" onClick={swap} disabled={!routes.some(route => route.originCityId === dest && route.destinationCityId === origin)} aria-label="Swap departure and destination"><ArrowRightLeft size={17} aria-hidden="true" /></Button>
              <div className="form-field">
                <Label htmlFor="trip-destination" className="metro-form-label">To</Label>
                <select id="trip-destination" className="metro-control" value={dest} onChange={event => setDestId(Number(event.target.value))} disabled={routesLoading || routesUnavailable} required>
                  {destinations.length ? destinations.map(city => <option key={city.id} value={city.id}>{city.name}, {city.state}</option>) : <option value="0">{routesUnavailable ? "Routes unavailable" : routesLoading ? "Loading routes…" : "Select a route"}</option>}
                </select>
              </div>
              <div className="form-field">
                <Label htmlFor="trip-departure" className="metro-form-label">Departure date</Label>
                <Input id="trip-departure" type="date" min={isoDate()} className="h-12 w-full bg-white" value={departDate} onChange={event => setDepartDate(event.target.value)} required />
              </div>
              <div className="form-field">
                <Label htmlFor="trip-passengers" className="metro-form-label">Passengers</Label>
                <Input id="trip-passengers" type="number" min={1} max={11} className="h-12 w-full bg-white" value={passengers} onChange={event => setPassengers(Number(event.target.value))} required />
              </div>
            </div>
            <div className="mt-5 flex flex-wrap items-end justify-between gap-4">
              {tripType === "round_trip" ? (
                <div className="form-field min-w-48">
                  <Label htmlFor="trip-return" className="metro-form-label">Return date</Label>
                  <Input id="trip-return" type="date" min={departDate} className="h-12 bg-white" value={returnDate} onChange={event => setReturnDate(event.target.value)} required />
                </div>
              ) : <p className="text-sm text-muted-foreground">Select your exact seat after choosing a departure.</p>}
              <Button type="submit" className="h-12 w-full px-7 text-sm font-bold uppercase tracking-wide sm:w-auto" disabled={routesLoading || routesUnavailable || !origin || !dest || origin === dest || !routes.length || (tripType === "round_trip" && !routes.some(route => route.originCityId === dest && route.destinationCityId === origin))}>
                <Search size={17} className="mr-2" aria-hidden="true" /> Search trips
              </Button>
            </div>
            {routesUnavailable ? <StatusNotice tone="error" className="mt-5">Departure routes could not be loaded. <button type="button" className="min-h-11 font-bold underline underline-offset-4" onClick={retryRoutes}>Try again</button></StatusNotice> : null}
          </form>
        </div>
      </div>

      <section className="bg-background py-12" aria-label="Find a booking or sign in">
        <div className="container grid gap-6 lg:grid-cols-2">
          <div id="booking-lookup" className="ticket-card scroll-mt-24 p-6">
            <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-primary"><LockKeyhole size={17} aria-hidden="true" /> Your trip details</p>
            <h2 className="mt-3 font-serif text-2xl">Already have a booking?</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">Enter your booking reference. Guest bookings not in your account also require the private access code from your checkout link.</p>
            <form onSubmit={findBooking} className="mt-5 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
              <div className="form-field">
                <Label htmlFor="booking-reference">Booking reference</Label>
                <Input id="booking-reference" placeholder="Enter booking reference" autoComplete="off" value={bookingReference} onChange={event => setBookingReference(event.target.value)} maxLength={24} className="h-12 bg-white" required />
              </div>
              <Button type="submit" disabled={lookupPending} className="h-12 px-5 text-sm font-bold uppercase tracking-wide">{lookupPending ? "Looking up…" : "Find my booking"}</Button>
              <div className="form-field sm:col-span-2"><Label htmlFor="booking-access">Private access code <span className="font-normal text-muted-foreground">(for guest bookings not in your account)</span></Label><Input id="booking-access" value={privateAccess} onChange={event => setPrivateAccess(event.target.value)} maxLength={128} autoComplete="off" className="h-12 bg-white" /></div>
              {lookupError ? <p role="alert" className="text-sm text-destructive sm:col-span-2">{lookupError}</p> : null}
            </form>
          </div>
          <div id="member-sign-in" className="ticket-card scroll-mt-24 p-6">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">Your account</p>
            <h2 className="mt-3 font-serif text-2xl">Member sign in</h2>
            <form onSubmit={submitMemberSignIn} className="mt-5 grid gap-3 sm:grid-cols-2">
              <div className="form-field"><Label htmlFor="member-login-email">Email</Label><Input id="member-login-email" type="email" autoComplete="email" className="h-12 bg-white" value={memberEmail} onChange={event => setMemberEmail(event.target.value)} required /></div>
              <div className="form-field"><Label htmlFor="member-login-password">Password</Label><Input id="member-login-password" type="password" autoComplete="current-password" className="h-12 bg-white" value={memberPassword} onChange={event => setMemberPassword(event.target.value)} required /></div>
              {memberError ? <p role="alert" className="text-sm text-destructive sm:col-span-2">{memberError}</p> : null}
              <div className="flex flex-wrap items-center justify-between gap-3 sm:col-span-2">
                <div className="flex flex-wrap items-center gap-4"><Link href="/create-account" className="inline-flex min-h-11 items-center text-sm font-bold text-primary underline-offset-4 hover:underline">Create a member account</Link><Link href="/forgot-password" className="inline-flex min-h-11 items-center text-sm font-semibold text-muted-foreground underline-offset-4 hover:text-primary hover:underline">Forgot password?</Link></div>
                <Button type="submit" className="h-12 w-full px-5 sm:w-auto" disabled={signIn.isPending}>{signIn.isPending ? "Signing in…" : "Sign in"} <ArrowRight size={17} className="ml-2" aria-hidden="true" /></Button>
              </div>
            </form>
          </div>
        </div>
      </section>

      <PopularRoutes routes={routes} date={departDate} loading={routesLoading} error={routesUnavailable} onRetry={retryRoutes} />
      <WhyMetroPro />
      <HowItWorks />
      <DigitalTicketStory route={defaultRoute} />
      <TravelInformation />
      <FinalBookingCta />
      <noscript><h2>Metro Pro — New York City to Columbus passenger vans</h2><p>Search departures above to book a seat. Existing members can sign in; guest bookings use a private access code.</p></noscript>
    </CustomerLayout>
  );
}
