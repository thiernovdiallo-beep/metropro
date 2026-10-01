import { PageShell } from "@/components/Brand";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { COOKIE_NAME, startLogin } from "@/const";
import { formatDate, formatTime, moneyExact } from "@/lib/format";
import { trpc } from "@/lib/trpc";
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
          <Button className="mt-4" onClick={() => startLogin()}>
            Member sign in
          </Button>
          <a href="/#trip-search" className="ml-2 mt-4 inline-flex min-h-10 items-center rounded-lg border border-primary/40 px-4 text-sm font-semibold text-primary">Book without an account</a>
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
          {section === "settings" ? <Settings userId={user?.id} userName={user?.name} email={user?.email} phone={user?.phone} /> : null}
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
  const profile = trpc.account.memberProfile.useQuery();
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
      {!profile.data?.complete ? (
        <div className="mt-5 rounded-xl border border-primary/20 bg-secondary p-4 text-sm">
          A member profile needs your full name, email, phone and ID photo before you can join or use the member fare.
          <Link href="/account/settings" className="ml-1 font-semibold text-primary underline">Complete your profile</Link>
        </div>
      ) : null}
      {overview.data?.membership?.status === "active" ? (
        <Link href="/account/payments"><Button className="mt-6">Manage membership billing</Button></Link>
      ) : profile.data?.complete ? <Button
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
      </Button> : null}
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
        const raw = sessionStorage.getItem("manus-cookie") ?? "";
        token = raw.split(";").find(part => part.trim().startsWith(`${COOKIE_NAME}=`))?.trim().slice(COOKIE_NAME.length + 1);
      } catch { /* OAuth cookie may be available even without sessionStorage. */ }
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
    if (photo && photo.size > 2 * 1024 * 1024) {
      toast.error("Your ID photo must be under 2 MB.");
      return;
    }
    setSaving(true);
    try {
      await save.mutateAsync({ name, email: mail, phone: tel });
      if (photo) {
        const encoded = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onerror = () => reject(new Error("Could not read this ID image"));
          reader.onload = () => {
            const result = String(reader.result ?? "");
            resolve(result.slice(result.indexOf(",") + 1));
          };
          reader.readAsDataURL(photo);
        });
        await upload.mutateAsync({ base64: encoded });
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
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">JPEG, PNG or WebP · 2 MB maximum. Stored encrypted and never shown in public search or on tickets.</p>
          <Input id="member-id" type="file" accept="image/jpeg,image/png,image/webp" className="mt-3 h-auto min-h-12 min-w-0 bg-white py-2" required={!profile.data?.idPhotoUploadedAt}
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
