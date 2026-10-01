import { PageShell } from "@/components/Brand";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { startLogin } from "@/const";
import { formatDate, formatTime, moneyExact } from "@/lib/format";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Link, useRoute } from "wouter";
import { toast } from "sonner";
import { useState } from "react";

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
  ["/account/settings", "Profile settings"],
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
          <Button className="mt-4" onClick={() => startLogin()}>
            Sign in
          </Button>
        </div>
      </PageShell>
    );
  }
  return (
    <PageShell>
      <div className="container grid min-w-0 gap-8 py-10 lg:grid-cols-[220px_minmax(0,1fr)]">
        <aside className="flex min-w-0 gap-2 overflow-x-auto lg:flex-col">
          {NAV.map(([href, label]) => (
            <Link key={href} href={href} className="rounded-md px-3 py-2 text-sm hover:bg-secondary">
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
          {section === "settings" ? <Settings userName={user?.name} email={user?.email} phone={user?.phone} /> : null}
          {!section ? <Upcoming /> : null}
        </section>
      </div>
    </PageShell>
  );
}

function Upcoming() {
  const q = trpc.account.overview.useQuery();
  const cancel = trpc.account.cancelBooking.useMutation({
    onSuccess: () => toast.success("Trip canceled"),
  });
  return (
    <div>
      <h1 className="font-serif text-3xl">Upcoming trips</h1>
      <div className="mt-5 grid gap-3">
        {(q.data?.upcoming ?? []).map(item => (
          <div key={item.booking.id} className="ticket-card p-5">
            <div className="font-semibold">
              {item.outbound?.origin?.name} → {item.outbound?.destination?.name}
            </div>
            <div className="text-sm text-muted-foreground">
              {item.outbound ? `${formatDate(item.outbound.departAt)} · ${formatTime(item.outbound.departAt)}` : ""}
            </div>
            <div className="mt-2 text-xs">{item.booking.bookingNumber}</div>
            <div className="mt-3 flex gap-2">
              {item.tickets[0] ? (
                <Link href={`/ticket/${item.tickets[0].qrToken}`}>
                  <Button size="sm">Ticket</Button>
                </Link>
              ) : null}
              <Button
                size="sm"
                variant="outline"
                onClick={() => cancel.mutate({ bookingId: item.booking.id })}
              >
                Cancel
              </Button>
            </div>
          </div>
        ))}
        {q.data?.upcoming?.length === 0 ? <p className="text-sm text-muted-foreground">No upcoming trips.</p> : null}
      </div>
    </div>
  );
}

function Past() {
  const q = trpc.account.overview.useQuery();
  return (
    <div>
      <h1 className="font-serif text-3xl">Previous trips</h1>
      <div className="mt-5 grid gap-3">
        {(q.data?.previous ?? []).map(item => (
          <div key={item.booking.id} className="ticket-card p-5">
            <div className="font-semibold">
              {item.outbound?.origin?.name} → {item.outbound?.destination?.name}
            </div>
            <div className="text-sm capitalize">{item.booking.status.replace("_", " ")}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Tickets() {
  const q = trpc.account.tickets.useQuery();
  return (
    <div>
      <h1 className="font-serif text-3xl">Digital tickets</h1>
      <div className="mt-5 grid gap-3">
        {(q.data ?? []).flatMap(item =>
          item.tickets.map(t => (
            <Link key={t.id} href={`/ticket/${t.qrToken}`} className="ticket-card block p-5">
              {item.booking.bookingNumber} · {t.status}
            </Link>
          ))
        )}
      </div>
    </div>
  );
}

function MembershipPanel() {
  const overview = trpc.account.overview.useQuery();
  const settings = trpc.public.settings.useQuery();
  const start = trpc.account.startMembershipCheckout.useMutation();
  return (
    <div>
      <h1 className="font-serif text-3xl">Membership</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Status: {overview.data?.membership?.status ?? "None"}
      </p>
      <ul className="mt-4 list-disc pl-5 text-sm">
        {(settings.data?.membershipBenefits ?? []).map(b => (
          <li key={b}>{b}</li>
        ))}
      </ul>
      {overview.data?.membership?.status === "active" ? (
        <Link href="/account/payments"><Button className="mt-6">Manage membership billing</Button></Link>
      ) : <Button
        className="mt-6"
        onClick={async () => {
          try {
            const r = await start.mutateAsync({ origin: window.location.origin });
            if (r.checkoutUrl) {
              toast.message("Opening Stripe Checkout in a new tab.");
              window.open(r.checkoutUrl, "_blank");
            }
          } catch (error) {
            toast.error(error instanceof Error ? error.message : "Could not start membership checkout");
          }
        }}
      >
        Become a Member · {moneyExact(settings.data?.membershipPriceCents ?? 2500)}/mo
      </Button>}
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
        Cards are stored with Stripe, never in Metro Pro.
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
  return (
    <div>
      <h1 className="font-serif text-3xl">Receipts</h1>
      <div className="mt-4 grid gap-2">
        {(q.data ?? []).map(p => (
          <div key={p.id} className="ticket-card flex flex-wrap items-center justify-between gap-2 p-4 text-sm">
            <span className="capitalize">
              {p.kind} · {p.status}
            </span>
            <span>{moneyExact(p.amountCents)}</span>
            {p.receiptUrl ? (
              <a href={p.receiptUrl} className="text-accent" target="_blank" rel="noreferrer">
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
  userName,
  email,
  phone,
}: {
  userName?: string | null;
  email?: string | null;
  phone?: string | null;
}) {
  const save = trpc.account.updateProfile.useMutation({ onSuccess: () => toast.success("Saved") });
  const [name, setName] = useState(userName ?? "");
  const [mail, setMail] = useState(email ?? "");
  const [tel, setTel] = useState(phone ?? "");
  return (
    <div>
      <h1 className="font-serif text-3xl">Profile settings</h1>
      <form
        className="mt-4 grid max-w-md gap-3"
        onSubmit={e => {
          e.preventDefault();
          save.mutate({ name, email: mail, phone: tel });
        }}
      >
        <div>
          <Label>Name</Label>
          <Input className="mt-1" value={name} onChange={e => setName(e.target.value)} />
        </div>
        <div>
          <Label>Email</Label>
          <Input className="mt-1" value={mail} onChange={e => setMail(e.target.value)} />
        </div>
        <div>
          <Label>Phone</Label>
          <Input className="mt-1" value={tel} onChange={e => setTel(e.target.value)} />
        </div>
        <Button type="submit">Save</Button>
      </form>
    </div>
  );
}
