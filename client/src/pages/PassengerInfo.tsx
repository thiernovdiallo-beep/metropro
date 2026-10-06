import { PageShell } from "@/components/Brand";
import SeatMap from "@/components/SeatMap";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { money } from "@/lib/format";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { useCallback, useMemo, useState } from "react";
import { Link, useLocation, useSearch } from "wouter";

type SeatType = "standard" | "front";
type Traveler = {
  firstName: string;
  lastName: string;
  outboundSeatType: SeatType;
  returnSeatType: SeatType | null;
  seatNumber?: string;
  returnSeatNumber?: string;
  isMemberTraveler: boolean;
};
type MapSeat = { seatNumber: string; seatType: SeatType; status: "available" | "taken" | "held" };

function sameName(first: string, last: string, accountName?: string | null) {
  const normalize = (name: string) => name.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase("en-US");
  return Boolean(accountName && normalize(`${first} ${last}`) === normalize(accountName));
}

export function selectedLegIsAvailable(travelers: Traveler[], seats: readonly MapSeat[] | undefined, leg: "outbound" | "return") {
  if (!seats) return false;
  const byNumber = new Map(seats.map(seat => [seat.seatNumber, seat]));
  const numbers = travelers.map(person => leg === "outbound" ? person.seatNumber : person.returnSeatNumber);
  if (numbers.some(number => !number) || new Set(numbers).size !== travelers.length) return false;
  return travelers.every(person => {
    const number = leg === "outbound" ? person.seatNumber : person.returnSeatNumber;
    const seat = byNumber.get(number!);
    return seat?.status === "available" && seat.seatType === (leg === "outbound" ? person.outboundSeatType : person.returnSeatType);
  });
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
  const outMap = trpc.booking.getSeatMap.useQuery({ departureId: outId }, { enabled: outId > 0, refetchInterval: 15_000, refetchOnWindowFocus: true });
  const retMap = trpc.booking.getSeatMap.useQuery({ departureId: retId }, { enabled: roundTrip, refetchInterval: 15_000, refetchOnWindowFocus: true });
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

  const updateTraveler = useCallback((index: number, change: Partial<Traveler>) => {
    setTravelers(list => list.map((person, i) => i === index ? { ...person, ...change } : person));
  }, []);
  function applySaved(index: number, firstName: string, lastName: string) {
    updateTraveler(index, { firstName, lastName });
  }

  const selectOutbound = useCallback((seatNumber: string, passengerIndex: number) => {
    const seat = outMap.data?.find(item => item.seatNumber === seatNumber && item.status === "available");
    if (seat) updateTraveler(passengerIndex, { seatNumber, outboundSeatType: seat.seatType });
  }, [outMap.data, updateTraveler]);
  const deselectOutbound = useCallback((seatNumber: string, passengerIndex: number) => {
    setTravelers(list => list.map((person, index) => index === passengerIndex && person.seatNumber === seatNumber
      ? { ...person, seatNumber: undefined, outboundSeatType: "standard" } : person));
  }, []);
  const selectReturn = useCallback((seatNumber: string, passengerIndex: number) => {
    const seat = retMap.data?.find(item => item.seatNumber === seatNumber && item.status === "available");
    if (seat) updateTraveler(passengerIndex, { returnSeatNumber: seatNumber, returnSeatType: seat.seatType });
  }, [retMap.data, updateTraveler]);
  const deselectReturn = useCallback((seatNumber: string, passengerIndex: number) => {
    setTravelers(list => list.map((person, index) => index === passengerIndex && person.returnSeatNumber === seatNumber
      ? { ...person, returnSeatNumber: undefined, returnSeatType: "standard" } : person));
  }, []);

  const outboundNumbers = useMemo(() => travelers.map(person => person.seatNumber), [travelers]);
  const returnNumbers = useMemo(() => travelers.map(person => person.returnSeatNumber), [travelers]);
  const namesReady = travelers.every(person => person.firstName.trim() && person.lastName.trim());
  const seatsReady = Boolean(outMap.data && (!roundTrip || retMap.data));
  const outwardFits = selectedLegIsAvailable(travelers, outMap.data, "outbound");
  const returnFits = !roundTrip || selectedLegIsAvailable(travelers, retMap.data, "return");
  const chosenMember = travelers.find(person => person.isMemberTraveler);
  const memberNameMatches = !chosenMember || sameName(chosenMember.firstName, chosenMember.lastName, user?.name);

  function go(event: React.FormEvent) {
    event.preventDefault();
    if (!namesReady || !seatsReady || !outwardFits || !returnFits || !memberNameMatches) return;
    sessionStorage.setItem("metropro-booking", JSON.stringify({
      out: params.get("out"), ret: params.get("ret"), pax: String(pax),
      type: roundTrip ? "round_trip" : "one_way",
      contactFirstName, contactLastName, phone, email, emergencyName, emergencyPhone,
      // Checkout forwards the stored passenger objects to quote and createCheckout unchanged.
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
            <a href="/#member-sign-in" className="ml-1 font-semibold text-primary underline">Member sign in</a>
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

          <section className="grid gap-4" aria-label="Passenger details">
            <div>
              <h2 className="font-serif text-2xl">Your travelers</h2>
              <p className="mt-1 text-sm text-muted-foreground">Add each traveler's name, then choose a seat for each leg of the trip.</p>
            </div>
            {travelers.map((person, index) => (
              <div key={index} className="ticket-card grid min-w-0 gap-4 p-5 sm:p-6">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="font-serif text-lg">Passenger {index + 1}</h3>
                  {person.isMemberTraveler ? <span className="rounded-full bg-secondary px-3 py-1 text-xs font-semibold text-primary">Traveling member</span> : null}
                </div>
                <div className="grid min-w-0 gap-4 sm:grid-cols-2">
                  <div className="form-field">
                    <Label htmlFor={`passenger-${index}-first`}>First name</Label>
                    <Input id={`passenger-${index}-first`} className="h-12 bg-white" value={person.firstName} onChange={e => updateTraveler(index, { firstName: e.target.value })} required />
                  </div>
                  <div className="form-field">
                    <Label htmlFor={`passenger-${index}-last`}>Last name</Label>
                    <Input id={`passenger-${index}-last`} className="h-12 bg-white" value={person.lastName} onChange={e => updateTraveler(index, { lastName: e.target.value })} required />
                  </div>
                </div>
                {person.seatNumber || person.returnSeatNumber ? (
                  <p className="text-sm text-muted-foreground">Outbound: {person.seatNumber ?? "not selected"}{roundTrip ? ` · Return: ${person.returnSeatNumber ?? "not selected"}` : ""}</p>
                ) : null}
                {hasMembership ? (
                  <label className="flex items-start gap-3 rounded-lg bg-secondary/70 p-3 text-sm leading-relaxed">
                    <input type="checkbox" className="mt-1 h-4 w-4 shrink-0 accent-[#137a86]" checked={person.isMemberTraveler}
                      disabled={!person.isMemberTraveler && travelers.some(traveler => traveler.isMemberTraveler)}
                      onChange={e => updateTraveler(index, { isMemberTraveler: e.target.checked })} />
                    <span>This passenger is me, the member. Only my regular seat is {money(member)}; my front seat remains {money(front)}.</span>
                  </label>
                ) : null}
                {saved.data?.length ? (
                  <div className="flex flex-wrap gap-2">
                    {saved.data.map(passenger => (
                      <button type="button" key={passenger.id} className="rounded-full border border-border bg-white px-3 py-1.5 text-xs hover:border-primary"
                        onClick={() => applySaved(index, passenger.firstName, passenger.lastName)}>{passenger.firstName} {passenger.lastName}</button>
                    ))}
                  </div>
                ) : null}
              </div>
            ))}
          </section>
          {namesReady ? (
            <div className="grid min-w-0 gap-6" aria-label="Select seats">
              <div>
                <h2 className="font-serif text-2xl">Choose your seats</h2>
                <p className="mt-1 text-sm text-muted-foreground">Select seats in passenger order. Each leg has its own seat choices; no seat is reserved until checkout.</p>
              </div>
              <div aria-label="Outbound seating">
                <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-primary">Outbound departure</h3>
                <SeatMap departureId={outId} passengerCount={pax} selectedSeats={outboundNumbers}
                  onSeatSelect={selectOutbound} onSeatDeselect={deselectOutbound} />
              </div>
              {roundTrip ? (
                <div aria-label="Return seating">
                  <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-primary">Return departure</h3>
                  <SeatMap departureId={retId} passengerCount={pax} selectedSeats={returnNumbers}
                    onSeatSelect={selectReturn} onSeatDeselect={deselectReturn} />
                </div>
              ) : null}
            </div>
          ) : (
            <p className="rounded-xl bg-muted p-4 text-sm text-muted-foreground">Enter each passenger's first and last name to open the seat map.</p>
          )}
          {hasMembership && !chosenMember ? (
            <p className="rounded-xl bg-secondary p-4 text-sm">The member fare applies only when you select yourself as one of the travelers.</p>
          ) : null}
          {!memberNameMatches ? (
            <p role="alert" className="rounded-xl border border-destructive/30 bg-red-50 p-4 text-sm text-destructive">
              The selected member passenger must match your profile name ({user?.name ?? "not set"}). <Link href="/account/settings" className="underline">Update your profile</Link> if needed.
            </p>
          ) : null}
          {namesReady && seatsReady && (!outwardFits || !returnFits) ? (
            <p role="status" className="rounded-xl border border-primary/20 bg-secondary p-4 text-sm">
              Select one available seat per passenger{roundTrip ? " on both departures" : ""}. If a seat was just taken or held, choose another.
            </p>
          ) : null}
          <Button type="submit" className="h-12 w-full text-base" disabled={!namesReady || !seatsReady || !outwardFits || !returnFits || !memberNameMatches}>
            Review booking and total
          </Button>
        </form>
      </div>
    </PageShell>
  );
}
