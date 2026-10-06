import { PageShell } from "@/components/Brand";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { COOKIE_NAME } from "@/const";
import { formatDate, formatTime, moneyExact } from "@/lib/format";
import { prepareIdPhoto } from "@/lib/id-photo";
import { trpc } from "@/lib/trpc";
import { genuineStripeReceiptUrl } from "@/lib/stripeReceipt";
import { useAuth } from "@/_core/hooks/useAuth";
import { Link, useRoute } from "wouter";
import { toast } from "sonner";
import { useEffect, useState } from "react";

const NAV = [
  ["/account", "Upcoming trips"],
  ["/account/past", "Previous trips"],
  ["/account/tickets", "Digital tickets"],
  ["/account/membership", "Membership"],
  ["/account/passengers", "Saved passengers"],
  ["/account/payments", "Payment methods"],
  ["/account/receipts", "Receipts"],
  ["/account/notifications", "Notifications"],
  ["/account/support", "Customer support"],
  ["/account/settings", "Member profile"],
];

export default function Account() {
  const { isAuthenticated, user } = useAuth();
  const [match, params] = useRoute("/account/:section?");
  const section = params?.section ?? "";
  if (!isAuthenticated) {
    return (
      <PageShell>
        <div className="container py-16">
          <h1 className="font-serif text-3xl">Your trips</h1>
          <a href="/#member-sign-in"><Button className="mt-4">Member sign in</Button></a>
          <a href="/#trip-search" className="ml-2 mt-4 inline-flex min-h-10 items-center rounded-lg border border-primary/40 px-4 text-sm font-semibold text-primary">Book without an account</a>
        </div>
      </PageShell>
    );
  }
  return (
    <PageShell>
      <div className="container grid min-w-0 gap-8 py-10 lg:grid-cols-[220px_minmax(0,1fr)]">
        <aside className="grid min-w-0 grid-cols-2 gap-2 self-start sm:grid-cols-3 lg:flex lg:flex-col">
          {NAV.map(([href, label]) => (
            <Link key={href} href={href} className="inline-flex min-h-11 items-center rounded-md px-3 py-2 text-sm hover:bg-secondary">
              {label}
            </Link>
          ))}
        </aside>
        <section className="min-w-0">
          {section === "past" ? <Past /> : null}
          {section === "tickets" ? <Tickets /> : null}
          {section === "membership" ? <MembershipPanel /> : null}
          {section === "passengers" ? <Passengers /> : null}
          {section === "payments" ? <Payments /> : null}
          {section === "receipts" ? <Receipts /> : null}
          {section === "notifications" ? <Notes /> : null}
          {section === "support" ? <Support /> : null}
          {section === "settings" ? <Settings userId={user?.id} userName={user?.name} email={user?.email} phone={user?.phone} /> : null}
          {!section ? <Upcoming name={user?.name} /> : null}
        </section>
      </div>
    </PageShell>
  );
}

function Upcoming({ name }: { name?: string | null }) {
  const q = trpc.account.overview.useQuery();
  const trips = [...(q.data?.upcoming ?? [])].sort((a, b) => (a.outbound?.departAt?.getTime() ?? 0) - (b.outbound?.departAt?.getTime() ?? 0));
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">Your Metro Pro account</p>
      <h1 className="mt-2 font-serif text-3xl">Welcome{name ? `, ${name.split(" ")[0]}` : ""}</h1>
      <div className="mt-5 grid gap-3 sm:grid-cols-3"><div className="ticket-card p-4"><p className="text-xs text-muted-foreground">Upcoming trips</p><p className="font-serif text-2xl">{q.data?.upcoming.length ?? "—"}</p></div><div className="ticket-card p-4"><p className="text-xs text-muted-foreground">Previous bookings</p><p className="font-serif text-2xl">{q.data?.previous.length ?? "—"}</p></div><div className="ticket-card p-4"><p className="text-xs text-muted-foreground">Membership</p><p className="mt-2 font-semibold capitalize">{q.data?.membership?.status ?? "Not subscribed"}</p></div></div>
      <h2 className="mt-8 font-serif text-2xl">Upcoming trips</h2>
      {q.isLoading ? <p role="status" className="mt-4 text-sm">Loading your bookings…</p> : null}
      {q.error ? <p role="alert" className="mt-4 text-sm">Bookings could not be loaded. Please retry.</p> : null}
      <div className="mt-5 grid gap-3">
        {trips.map(item => (
          <div key={item.booking.id} className="ticket-card p-5">
            <div className="font-semibold">
              {item.outbound?.origin?.name} → {item.outbound?.destination?.name}
            </div>
            <div className="text-sm text-muted-foreground">
              {item.outbound ? `${formatDate(item.outbound.departAt)} · ${formatTime(item.outbound.departAt)}` : ""}
            </div>
            <div className="mt-2 text-xs">{item.booking.bookingNumber} · {item.booking.passengerCount} passenger{item.booking.passengerCount === 1 ? "" : "s"} · Confirmed</div>
            <div className="mt-2 text-sm">{item.passengers.map(p => `${p.firstName} ${p.lastName} · ${p.seatNumber ? `Seat ${p.seatNumber}` : p.outboundSeatType === "front" ? "Front seat" : "Regular seat"}`).join(" · ")}</div>
            <div className="mt-3 flex flex-wrap gap-2">
              <Link href={`/account/booking/${item.booking.id}`} className="inline-flex min-h-11 items-center rounded-md border border-input px-4 text-sm font-semibold text-primary">Booking details</Link>
              {item.tickets[0] ? (
                <Link href={`/ticket/${item.tickets[0].qrToken}`} className="inline-flex min-h-11 items-center rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground">View first ticket</Link>
              ) : null}
            </div>
          </div>
        ))}
        {q.data?.upcoming?.length === 0 ? <div className="ticket-card p-5 text-sm"><p>No upcoming trips yet.</p><Link href="/#trip-search" className="mt-3 inline-flex min-h-11 items-center font-semibold text-primary underline">Find a trip</Link></div> : null}
      </div>
      <h2 className="mt-8 font-serif text-2xl">Recent bookings</h2>
      <div className="mt-3 grid gap-2">{(q.data?.previous ?? []).slice(0, 3).map(item => <Link href={`/account/booking/${item.booking.id}`} key={item.booking.id} className="ticket-card block min-h-11 p-4 text-sm"><strong>{item.booking.bookingNumber}</strong> · {item.outbound?.origin?.name} → {item.outbound?.destination?.name} · <span className="capitalize">{item.booking.status.replace("_", " ")}</span></Link>)}{q.data?.previous.length === 0 ? <p className="text-sm text-muted-foreground">No previous bookings yet.</p> : null}</div>
      <h2 className="mt-8 font-serif text-xl">Quick actions</h2>
      <div className="mt-3 flex flex-wrap gap-2"><Link href="/#trip-search" className="inline-flex min-h-11 items-center rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground">Book a trip</Link><Link href="/account/past" className="inline-flex min-h-11 items-center rounded-md border border-input px-4 text-sm font-semibold">My bookings</Link><Link href="/account/settings" className="inline-flex min-h-11 items-center rounded-md border border-input px-4 text-sm font-semibold">My profile</Link></div>
    </div>
  );
}

function Past() {
  const q = trpc.account.overview.useQuery();
  return (
    <div>
      <h1 className="font-serif text-3xl">Previous trips</h1>
      {q.isLoading ? <p role="status" className="mt-3 text-sm">Loading your trips…</p> : null}
      <div className="mt-5 grid gap-3">
        {(q.data?.previous ?? []).map(item => (
          <div key={item.booking.id} className="ticket-card p-5">
            <div className="font-semibold">
              {item.outbound?.origin?.name} → {item.outbound?.destination?.name}
            </div>
            <div className="mt-1 text-sm capitalize">{item.outbound ? formatDate(item.outbound.departAt) : ""} · {item.booking.bookingNumber} · {item.booking.status.replace("_", " ")}</div>
            <Link href={`/account/booking/${item.booking.id}`} className="mt-3 inline-flex min-h-11 items-center font-semibold text-primary underline">Booking details</Link>
          </div>
        ))}
        {q.data?.previous.length === 0 ? <p className="ticket-card p-5 text-sm text-muted-foreground">No previous trips yet.</p> : null}
      </div>
    </div>
  );
}

function Tickets() {
  const q = trpc.account.tickets.useQuery();
  return (
    <div>
      <h1 className="font-serif text-3xl">Digital tickets</h1>
      {q.isLoading ? <p role="status" className="mt-3 text-sm">Loading your tickets…</p> : null}
      <div className="mt-5 grid gap-3">
        {(q.data ?? []).flatMap(item =>
          item.tickets.filter(t => t.status !== "voided").map(t => (
            <Link key={t.id} href={`/ticket/${t.qrToken}`} className="ticket-card block p-5">
              <span className="font-semibold">{item.passengers.find(p => p.id === t.passengerId)?.firstName} {item.passengers.find(p => p.id === t.passengerId)?.lastName}</span> · {item.booking.bookingNumber} · {t.status.replace("_", " ")}
              <span className="mt-1 block text-sm text-muted-foreground">{item.outbound?.id === t.departureId ? `${item.outbound?.origin?.name} → ${item.outbound?.destination?.name}` : `${item.returnTrip?.origin?.name} → ${item.returnTrip?.destination?.name}`} · {(() => { const p = item.passengers.find(person => person.id === t.passengerId); const seat = item.outbound?.id === t.departureId ? p?.seatNumber : p?.returnSeatNumber; return seat ? `Seat ${seat}` : t.seatType === "front" ? "Front seat" : "Regular seat"; })()}</span>
            </Link>
          ))
        )}
        {q.data?.length === 0 ? <p className="ticket-card p-5 text-sm text-muted-foreground">No paid digital tickets yet.</p> : null}
      </div>
    </div>
  );
}

function MembershipPanel() {
  const overview = trpc.account.overview.useQuery();
  const profile = trpc.account.memberProfile.useQuery();
  const settings = trpc.public.settings.useQuery();
  const start = trpc.account.startMembershipCheckout.useMutation();
  const [agreed, setAgreed] = useState(false);
  const monthlyPrice = moneyExact(settings.data?.membershipPriceCents ?? 2500);
  return (
    <div>
      <h1 className="font-serif text-3xl">Membership</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Status: {overview.data?.membership?.status ?? "None"}
      </p>
      {overview.data?.membership?.currentPeriodEnd ? <p className="mt-1 text-sm">Current billing period ends {formatDate(overview.data.membership.currentPeriodEnd)}. {overview.data.membership.freeReschedulesRemaining} complimentary reschedule{overview.data.membership.freeReschedulesRemaining === 1 ? "" : "s"} remaining.</p> : null}
      <p className="mt-3 max-w-lg text-sm leading-relaxed text-muted-foreground">
        Metro Pro Member is a {monthlyPrice}-per-month subscription. Once you join through Stripe,
        your payment method is charged now and automatically each month until you cancel.
        Account creation alone does not start the subscription.
      </p>
      <ul className="mt-4 list-disc pl-5 text-sm">
        {(settings.data?.membershipBenefits ?? []).map(b => (
          <li key={b}>{b}</li>
        ))}
      </ul>
      {!profile.data?.complete ? (
        <div className="mt-5 rounded-xl border border-primary/20 bg-secondary p-4 text-sm">
          A member profile needs your full name, email, phone and ID photo before you can join or use the member fare.
          <Link href="/account/settings" className="ml-1 font-semibold text-primary underline">Complete your profile</Link>
        </div>
      ) : null}
      {overview.data?.membership?.status === "active" ? (
        <Link href="/account/payments"><Button className="mt-6">Manage or cancel membership billing</Button></Link>
      ) : profile.data?.complete ? <div className="mt-6 max-w-lg">
        <label className="flex items-start gap-3 rounded-xl border border-border bg-secondary p-4 text-sm leading-relaxed">
          <input type="checkbox" className="mt-1 h-4 w-4 shrink-0 accent-primary" checked={agreed} onChange={event => setAgreed(event.target.checked)} />
          <span>I understand that joining authorizes an automatic {monthlyPrice} charge every month until I cancel.</span>
        </label>
        <Button className="mt-4" disabled={!agreed || start.isPending} onClick={async () => {
          try {
            const result = await start.mutateAsync({ origin: window.location.origin });
            if (result.checkoutUrl) {
              toast.message("Opening Stripe subscription checkout in a new tab.");
              if (!window.open(result.checkoutUrl, "_blank")) window.location.assign(result.checkoutUrl);
            }
          } catch (error) {
            toast.error(error instanceof Error ? error.message : "Could not start membership checkout");
          }
        }}>Subscribe for {monthlyPrice}/month</Button>
      </div> : null}
    </div>
  );
}

function Passengers() {
  const q = trpc.account.savedPassengers.useQuery();
  const add = trpc.account.savePassenger.useMutation({ onSuccess: () => q.refetch() });
  const del = trpc.account.deleteSavedPassenger.useMutation({ onSuccess: () => q.refetch() });
  const [firstName, setFirst] = useState("");
  const [lastName, setLast] = useState("");
  return (
    <div>
      <h1 className="font-serif text-3xl">Saved passengers</h1>
      <form
        className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]"
        onSubmit={e => {
          e.preventDefault();
          add.mutate({ firstName, lastName });
          setFirst("");
          setLast("");
        }}
      >
        <Input placeholder="First" value={firstName} onChange={e => setFirst(e.target.value)} required />
        <Input placeholder="Last" value={lastName} onChange={e => setLast(e.target.value)} required />
        <Button type="submit" className="min-h-10">Save</Button>
      </form>
      <div className="mt-4 grid gap-2">
        {(q.data ?? []).map(p => (
          <div key={p.id} className="ticket-card flex min-w-0 flex-wrap items-center justify-between gap-2 px-4 py-3">
            <span>
              {p.firstName} {p.lastName}
            </span>
            <Button size="sm" variant="ghost" onClick={() => del.mutate({ id: p.id })}>
              Remove
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}

function Payments() {
  const portal = trpc.account.billingPortal.useMutation();
  return (
    <div>
      <h1 className="font-serif text-3xl">Payment methods</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Cards are stored with Stripe, never in Metro Pro. Use the Stripe portal to manage
        or cancel your automatic monthly membership subscription.
      </p>
      <Button
        className="mt-4"
        onClick={async () => {
          try {
            const r = await portal.mutateAsync({ origin: window.location.origin });
            window.location.href = r.url;
          } catch (e) {
            toast.error(e instanceof Error ? e.message : "No payment methods yet");
          }
        }}
      >
        Manage in Stripe
      </Button>
    </div>
  );
}

function Receipts() {
  const q = trpc.account.receipts.useQuery();
  const invoices = trpc.account.membershipInvoices.useQuery(undefined, { retry: false });
  const localPayments = (q.data ?? []).filter(payment =>
    payment.kind !== "membership" || !invoices.data?.length
  );
  return (
    <div>
      <h1 className="font-serif text-3xl">Receipts</h1>
      {invoices.data?.length ? <div className="mt-5">
        <h2 className="font-serif text-xl">Monthly membership invoices</h2>
        <div className="mt-3 grid gap-2">
          {invoices.data.map(invoice => (
            <div key={invoice.id} className="ticket-card flex flex-wrap items-center justify-between gap-2 p-4 text-sm">
              <span>Stripe subscription payment · {formatDate(invoice.paidAt)}</span>
              <span>{moneyExact(invoice.amountCents)}</span>
              {invoice.hostedInvoiceUrl ? (
                <a href={invoice.hostedInvoiceUrl} target="_blank" rel="noreferrer" className="font-semibold text-primary underline">View paid invoice</a>
              ) : null}
            </div>
          ))}
        </div>
      </div> : null}
      {invoices.error ? <p className="mt-4 text-sm text-muted-foreground">Stripe invoice history is temporarily unavailable. Open Payment methods to view your subscription in Stripe.</p> : null}
      {localPayments.length ? <h2 className="mt-6 font-serif text-xl">Booking and local payment records</h2> : null}
      <div className="mt-4 grid gap-2">
        {localPayments.map(p => (
          <div key={p.id} className="ticket-card flex flex-wrap items-center justify-between gap-2 p-4 text-sm">
            <span className="capitalize">
              {p.kind} · {p.status}
            </span>
            <span>{moneyExact(p.amountCents)}</span>
            {genuineStripeReceiptUrl(p.receiptUrl) ? (
              <a href={genuineStripeReceiptUrl(p.receiptUrl)!} className="text-accent" target="_blank" rel="noreferrer">
                Receipt
              </a>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}

function Notes() {
  const q = trpc.account.notifications.useQuery();
  const read = trpc.account.markRead.useMutation({ onSuccess: () => q.refetch() });
  return (
    <div>
      <h1 className="font-serif text-3xl">Notifications</h1>
      <div className="mt-4 grid gap-2">
        {(q.data ?? []).map(n => (
          <button
            key={n.id}
            className="ticket-card p-4 text-left"
            onClick={() => read.mutate({ id: n.id })}
          >
            <div className="font-medium">{n.title}</div>
            <div className="text-sm text-muted-foreground">{n.body}</div>
          </button>
        ))}
      </div>
    </div>
  );
}

function Support() {
  const send = trpc.account.support.useMutation({
    onSuccess: () => toast.success("Message sent"),
  });
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  return (
    <div>
      <h1 className="font-serif text-3xl">Customer support</h1>
      <form
        className="mt-4 grid gap-3"
        onSubmit={e => {
          e.preventDefault();
          send.mutate({ subject, message });
        }}
      >
        <Input placeholder="Subject" value={subject} onChange={e => setSubject(e.target.value)} required />
        <textarea
          className="min-h-32 rounded-md border border-input p-3"
          value={message}
          onChange={e => setMessage(e.target.value)}
          required
        />
        <Button type="submit">Send</Button>
      </form>
    </div>
  );
}

function Settings({
  userId,
  userName,
  email,
  phone,
}: {
  userId?: number;
  userName?: string | null;
  email?: string | null;
  phone?: string | null;
}) {
  const utils = trpc.useUtils();
  const profile = trpc.account.memberProfile.useQuery();
  const save = trpc.account.updateProfile.useMutation();
  const upload = trpc.account.uploadMemberId.useMutation();
  const [name, setName] = useState(userName ?? "");
  const [mail, setMail] = useState(email ?? "");
  const [tel, setTel] = useState(phone ?? "");
  const [photo, setPhoto] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [idPreviewUrl, setIdPreviewUrl] = useState<string | null>(null);

  useEffect(() => () => { if (idPreviewUrl) URL.revokeObjectURL(idPreviewUrl); }, [idPreviewUrl]);

  async function viewId() {
    if (!userId) return;
    try {
      let token: string | undefined;
      try {
        token = sessionStorage.getItem("metropro-member-session") ?? undefined;
        if (!token) {
          const raw = sessionStorage.getItem("manus-cookie") ?? "";
          token = raw.split(";").find(part => part.trim().startsWith(`${COOKIE_NAME}=`))?.trim().slice(COOKIE_NAME.length + 1);
        }
      } catch { /* A secure cookie may still be available without sessionStorage. */ }
      const response = await fetch(`/api/member-id/${userId}`, {
        credentials: "include",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        cache: "no-store",
      });
      if (!response.ok) throw new Error("Sign in again to view your ID photo.");
      setIdPreviewUrl(URL.createObjectURL(await response.blob()));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not open your ID photo");
    }
  }

  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    if (!profile.data?.idPhotoUploadedAt && !photo) {
      toast.error("Select a picture of your ID to complete your member profile.");
      return;
    }
    setSaving(true);
    try {
      // Do local image work before changing any saved profile fields.
      const preparedPhoto = photo ? await prepareIdPhoto(photo) : null;
      await save.mutateAsync({ name, email: mail, phone: tel });
      if (preparedPhoto) {
        await upload.mutateAsync({ base64: preparedPhoto.base64 });
        setPhoto(null);
      }
      await Promise.all([profile.refetch(), utils.auth.me.invalidate(), utils.account.overview.invalidate()]);
      toast.success("Member profile saved securely");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save your profile");
    } finally {
      setSaving(false);
    }
  }
  return (
    <div>
      <h1 className="font-serif text-3xl">Your member profile</h1>
      <p className="mt-2 max-w-lg text-sm leading-relaxed text-muted-foreground">
        Your full name, email, phone number and ID photo are required before joining Metro Pro Member.
        Guest tickets never require an account or ID upload.
      </p>
      <div className={`mt-5 rounded-xl border px-4 py-3 text-sm ${profile.data?.complete ? "border-[#b7e2d3] bg-[#edfaf3] text-[#176447]" : "border-border bg-secondary text-foreground"}`}>
        {profile.isLoading ? "Checking your profile…" : profile.data?.complete ? "Profile complete — membership is available." : "Profile incomplete — add every required field and your ID photo."}
      </div>
      <form
        className="mt-6 grid max-w-md min-w-0 gap-4"
        onSubmit={onSave}
      >
        <div>
          <Label htmlFor="member-name">Full name *</Label>
          <Input id="member-name" className="mt-1 h-12" autoComplete="name" value={name} onChange={e => setName(e.target.value)} required />
        </div>
        <div>
          <Label htmlFor="member-email">Email *</Label>
          <Input id="member-email" type="email" className="mt-1 h-12" autoComplete="email" value={mail} onChange={e => setMail(e.target.value)} required />
        </div>
        <div>
          <Label htmlFor="member-phone">Phone number *</Label>
          <Input id="member-phone" type="tel" className="mt-1 h-12" autoComplete="tel" value={tel} onChange={e => setTel(e.target.value)} required />
        </div>
        <div className="min-w-0 rounded-xl border border-dashed border-primary/35 bg-[#f4fbfd] p-4">
          <Label htmlFor="member-id">Picture of your ID *</Label>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">Choose a JPEG, PNG or WebP photo up to 25 MB (HEIC if supported). It is resized and compressed on your device before an under-2-MB encrypted upload. Make sure the ID text is clear.</p>
          <Input id="member-id" type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" className="mt-3 h-auto min-h-12 min-w-0 bg-white py-2" required={!profile.data?.idPhotoUploadedAt}
            onChange={e => setPhoto(e.target.files?.[0] ?? null)} />
          {profile.data?.idPhotoUploadedAt ? <p className="mt-2 text-xs font-semibold text-primary">ID photo on file · {new Date(profile.data.idPhotoUploadedAt).toLocaleDateString()} · choose a new image to replace it</p> : null}
          {photo ? <p className="mt-2 text-xs">Selected: {photo.name}</p> : null}
          {profile.data?.idPhotoUploadedAt ? (
            <button type="button" className="mt-3 text-xs font-semibold text-primary underline" onClick={idPreviewUrl ? () => setIdPreviewUrl(null) : viewId}>
              {idPreviewUrl ? "Hide my ID photo" : "View my ID photo privately"}
            </button>
          ) : null}
          {idPreviewUrl ? <img src={idPreviewUrl} alt="Your uploaded ID photo" className="mt-3 max-h-64 max-w-full rounded-lg border border-border object-contain" /> : null}
        </div>
        <Button type="submit" className="h-12" disabled={saving || profile.isLoading}>{saving ? "Saving securely…" : "Save member profile"}</Button>
      </form>
      {profile.data?.complete ? <Link href="/account/membership" className="mt-5 inline-block text-sm font-semibold text-primary underline">Continue to membership</Link> : null}
    </div>
  );
}
