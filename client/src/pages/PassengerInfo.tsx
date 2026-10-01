import { PageShell } from "@/components/Brand";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { startLogin } from "@/const";
import { money } from "@/lib/format";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { useMemo, useState } from "react";
import { Link, useLocation, useSearch } from "wouter";

type SeatType = "standard" | "front";
type Traveler = {
  firstName: string;
  lastName: string;
  outboundSeatType: SeatType;
  returnSeatType: SeatType | null;
  isMemberTraveler: boolean;
};

function sameName(first: string, last: string, accountName?: string | null) {
  const normalize = (name: string) => name.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase("en-US");
  return Boolean(accountName && normalize(`${first} ${last}`) === normalize(accountName));
}

export default function PassengerInfo() {
  const search = useSearch();
  const params = useMemo(() => new URLSearchParams(search), [search]);
  const [, setLocation] = useLocation();
  const { user, isAuthenticated } = useAuth();
  const settings = trpc.public.settings.useQuery();
  const saved = trpc.account.savedPassengers.useQuery(undefined, { enabled: isAuthenticated });
  const overview = trpc.account.overview.useQuery(undefined, { enabled: isAuthenticated });
  const hasMembership = overview.data?.memberFareEligible ?? false;
  const outId = Number(params.get("out"));
  const retId = Number(params.get("ret"));
  const roundTrip = Boolean(retId);
  const outwardSeats = trpc.public.seatOptions.useQuery({ departureId: outId }, { enabled: Boolean(outId) });
  const returnSeats = trpc.public.seatOptions.useQuery({ departureId: retId }, { enabled: roundTrip });
  const pax = Math.min(10, Math.max(1, Number(params.get("pax") ?? 1) || 1));
  const [contactFirstName, setFirst] = useState(user?.name?.split(" ")[0] ?? "");
  const [contactLastName, setLast] = useState(user?.name?.split(" ").slice(1).join(" ") ?? "");
  const [phone, setPhone] = useState(user?.phone ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [emergencyName, setEmName] = useState("");
  const [emergencyPhone, setEmPhone] = useState("");
  const [travelers, setTravelers] = useState<Traveler[]>(() =>
    Array.from({ length: pax }, () => ({
      firstName: "", lastName: "", outboundSeatType: "standard", returnSeatType: roundTrip ? "standard" : null,
      isMemberTraveler: false,
    }))
  );

  function updateTraveler(index: number, change: Partial<Traveler>) {
    setTravelers(list => list.map((p, i) => i === index ? { ...p, ...change } : p));
  }
  function applySaved(i: number, firstName: string, lastName: string) {
    updateTraveler(i, { firstName, lastName });
  }

  const outFront = travelers.filter(p => p.outboundSeatType === "front").length;
  const retFront = travelers.filter(p => p.returnSeatType === "front").length;
  const outAvailability = outwardSeats.data;
  const retAvailability = returnSeats.data;
  const seatsReady = Boolean(outAvailability && (!roundTrip || retAvailability));
  const outwardFits = Boolean(outAvailability && outFront <= outAvailability.front && pax - outFront <= outAvailability.standard);
  const returnFits = !roundTrip || Boolean(retAvailability && retFront <= retAvailability.front && pax - retFront <= retAvailability.standard);
  const chosenMember = travelers.find(p => p.isMemberTraveler);
  const memberNameMatches = !chosenMember || sameName(chosenMember.firstName, chosenMember.lastName, user?.name);

  function go(e: React.FormEvent) {
    e.preventDefault();
    if (!seatsReady || !outwardFits || !returnFits || !memberNameMatches) return;
    sessionStorage.setItem("metropro-booking", JSON.stringify({
      out: params.get("out"), ret: params.get("ret"), pax: String(pax),
      type: roundTrip ? "round_trip" : "one_way",
      contactFirstName, contactLastName, phone, email, emergencyName, emergencyPhone,
      passengers: travelers,
    }));
    setLocation("/checkout");
  }

  const standard = settings.data?.standardFareCents ?? 15000;
  const member = settings.data?.memberFareCents ?? 10000;
  const front = settings.data?.frontFareCents ?? 20000;

  return (
    <PageShell>
      <div className="container max-w-2xl py-10">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">Step 2 of 3 · Your trip</p>
        <h1 className="mt-2 font-serif text-3xl">Passenger information</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          Each departure has nine regular seats ({money(standard)}) and one front passenger seat ({money(front)}).
          The traveling member pays {money(member)} for their own regular seat; the front seat is always {money(front)}.
        </p>
        {!isAuthenticated ? (
          <div className="mt-6 rounded-xl border border-primary/20 bg-secondary p-4 text-sm">
            <strong>Booking as a guest.</strong> No sign-in or ID photo is needed. Enter your contact details and save your private ticket link after payment.
            <button type="button" className="ml-1 font-semibold text-primary underline" onClick={() => { sessionStorage.setItem("metropro-member-onboarding", "1"); startLogin(); }}>Member sign in</button>
          </div>
        ) : overview.data?.membership && !overview.data.memberFareEligible ? (
          <div className="mt-6 rounded-xl border border-primary/20 bg-secondary p-4 text-sm">
            Your paid membership requires a completed name, email, phone and ID photo for the member fare.
            <Link href="/account/settings" className="ml-1 font-semibold text-primary underline">Finish your profile</Link>
          </div>
        ) : null}
          <form className="mt-7 grid min-w-0 gap-7" onSubmit={go}>
            <section className="ticket-card grid min-w-0 gap-4 p-5 sm:grid-cols-2 sm:p-6" aria-label="Contact information">
              <h2 className="font-serif text-xl sm:col-span-2">Contact details</h2>
              <div className="form-field">
                <Label htmlFor="contact-first">First name</Label>
                <Input id="contact-first" className="h-12 bg-white" value={contactFirstName} onChange={e => setFirst(e.target.value)} required />
              </div>
              <div className="form-field">
                <Label htmlFor="contact-last">Last name</Label>
                <Input id="contact-last" className="h-12 bg-white" value={contactLastName} onChange={e => setLast(e.target.value)} required />
              </div>
              <div className="form-field">
                <Label htmlFor="contact-phone">Phone</Label>
                <Input id="contact-phone" type="tel" className="h-12 bg-white" value={phone} onChange={e => setPhone(e.target.value)} required />
              </div>
              <div className="form-field">
                <Label htmlFor="contact-email">Email</Label>
                <Input id="contact-email" type="email" className="h-12 bg-white" value={email} onChange={e => setEmail(e.target.value)} required />
              </div>
              {settings.data?.emergencyContactRequired ? (
                <>
                  <div className="form-field">
                    <Label htmlFor="emergency-name">Emergency contact name</Label>
                    <Input id="emergency-name" className="h-12 bg-white" value={emergencyName} onChange={e => setEmName(e.target.value)} required />
                  </div>
                  <div className="form-field">
                    <Label htmlFor="emergency-phone">Emergency contact phone</Label>
                    <Input id="emergency-phone" type="tel" className="h-12 bg-white" value={emergencyPhone} onChange={e => setEmPhone(e.target.value)} required />
                  </div>
                </>
              ) : null}
            </section>

            <section className="grid gap-4" aria-label="Travelers and seats">
              <div>
                <h2 className="font-serif text-2xl">Choose each traveler's seat</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Outbound: {outAvailability?.standard ?? "…"} regular · {outAvailability?.front ?? "…"} front available
                  {roundTrip ? ` · Return: ${retAvailability?.standard ?? "…"} regular · ${retAvailability?.front ?? "…"} front available` : ""}
                </p>
              </div>
              {travelers.map((p, i) => (
                <div key={i} className="ticket-card grid min-w-0 gap-4 p-5 sm:p-6">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="font-serif text-lg">Passenger {i + 1}</h3>
                    {p.isMemberTraveler ? <span className="rounded-full bg-secondary px-3 py-1 text-xs font-semibold text-primary">Traveling member</span> : null}
                  </div>
                  <div className="grid min-w-0 gap-4 sm:grid-cols-2">
                    <div className="form-field">
                      <Label htmlFor={`passenger-${i}-first`}>First name</Label>
                      <Input id={`passenger-${i}-first`} className="h-12 bg-white" value={p.firstName} onChange={e => updateTraveler(i, { firstName: e.target.value })} required />
                    </div>
                    <div className="form-field">
                      <Label htmlFor={`passenger-${i}-last`}>Last name</Label>
                      <Input id={`passenger-${i}-last`} className="h-12 bg-white" value={p.lastName} onChange={e => updateTraveler(i, { lastName: e.target.value })} required />
                    </div>
                    <div className="form-field">
                      <Label htmlFor={`passenger-${i}-out-seat`}>Outbound seat</Label>
                      <select id={`passenger-${i}-out-seat`} className="h-12 w-full min-w-0 rounded-md border border-input bg-white px-3" value={p.outboundSeatType} onChange={e => updateTraveler(i, { outboundSeatType: e.target.value as SeatType })}>
                        <option value="standard">Regular · {money(p.isMemberTraveler ? member : standard)}</option>
                        <option value="front" disabled={!outAvailability?.front && p.outboundSeatType !== "front"}>Front · {money(front)}</option>
                      </select>
                    </div>
                    {roundTrip ? (
                      <div className="form-field">
                        <Label htmlFor={`passenger-${i}-return-seat`}>Return seat</Label>
                        <select id={`passenger-${i}-return-seat`} className="h-12 w-full min-w-0 rounded-md border border-input bg-white px-3" value={p.returnSeatType ?? "standard"} onChange={e => updateTraveler(i, { returnSeatType: e.target.value as SeatType })}>
                          <option value="standard">Regular · {money(p.isMemberTraveler ? member : standard)}</option>
                          <option value="front" disabled={!retAvailability?.front && p.returnSeatType !== "front"}>Front · {money(front)}</option>
                        </select>
                      </div>
                    ) : null}
                  </div>
                  {hasMembership ? (
                    <label className="flex items-start gap-3 rounded-lg bg-secondary/70 p-3 text-sm leading-relaxed">
                      <input type="checkbox" className="mt-1 h-4 w-4 shrink-0 accent-[#137a86]" checked={p.isMemberTraveler}
                        disabled={!p.isMemberTraveler && travelers.some(t => t.isMemberTraveler)}
                        onChange={e => updateTraveler(i, { isMemberTraveler: e.target.checked })} />
                      <span>This passenger is me, the member. Only my regular seat is {money(member)}; my front seat remains {money(front)}.</span>
                    </label>
                  ) : null}
                  {saved.data?.length ? (
                    <div className="flex flex-wrap gap-2">
                      {saved.data.map(s => (
                        <button type="button" key={s.id} className="rounded-full border border-border bg-white px-3 py-1.5 text-xs hover:border-primary"
                          onClick={() => applySaved(i, s.firstName, s.lastName)}>{s.firstName} {s.lastName}</button>
                      ))}
                    </div>
                  ) : null}
                </div>
              ))}
            </section>
            {hasMembership && !chosenMember ? (
              <p className="rounded-xl bg-secondary p-4 text-sm">The member fare applies only when you select yourself as one of the travelers.</p>
            ) : null}
            {!memberNameMatches ? (
              <p role="alert" className="rounded-xl border border-destructive/30 bg-red-50 p-4 text-sm text-destructive">
                The selected member passenger must match your profile name ({user?.name ?? "not set"}). <Link href="/account/settings" className="underline">Update your profile</Link> if needed.
              </p>
            ) : null}
            {seatsReady && (!outwardFits || !returnFits) ? (
              <p role="alert" className="rounded-xl border border-destructive/30 bg-red-50 p-4 text-sm text-destructive">
                This seat selection exceeds the available regular or front seats. Choose another seat type or departure.
              </p>
            ) : null}
            <Button type="submit" className="h-12 w-full text-base" disabled={!seatsReady || !outwardFits || !returnFits || !memberNameMatches}>
              Review booking and total
            </Button>
          </form>
      </div>
    </PageShell>
  );
}
