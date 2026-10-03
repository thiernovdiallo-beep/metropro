import { PageShell } from "@/components/Brand";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { prepareIdPhoto } from "@/lib/id-photo";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { useState } from "react";
import { toast } from "sonner";
import { useLocation } from "wouter";

export default function CreateAccount() {
  const [, setLocation] = useLocation();
  const { isAuthenticated } = useAuth();
  const utils = trpc.useUtils();
  const register = trpc.memberAuth.register.useMutation();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    if (!photo) { setError("Upload a picture of your ID to create your profile."); return; }
    if (password !== confirmPassword) { setError("Passwords do not match."); return; }
    setBusy(true);
    try {
      const { base64: idPhotoBase64 } = await prepareIdPhoto(photo);
      const result = await register.mutateAsync({ name, email, phone, password, confirmPassword, idPhotoBase64 });
      sessionStorage.setItem("metropro-member-session", result.sessionToken);
      sessionStorage.removeItem("metropro-admin-session");
      sessionStorage.removeItem("metropro-driver-session");
      sessionStorage.removeItem("manus-cookie");
      await Promise.all([
        utils.auth.me.invalidate(),
        utils.account.memberProfile.invalidate(),
        utils.account.overview.invalidate(),
      ]);
      toast.success("Your member account is ready. Choose whether to join the monthly plan.");
      setLocation("/account/membership");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not create your account. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <PageShell>
      <section className="bg-gradient-to-br from-[#e8f6fb] via-[#f6fbfd] to-[#e9f6ef]">
        <div className="container grid min-w-0 gap-10 py-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:items-start lg:py-20">
          <div className="min-w-0 lg:pt-10">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Metro Pro Member</p>
            <h1 className="mt-4 font-serif text-4xl leading-tight">Create a member account.</h1>
            <p className="mt-5 max-w-md text-base leading-relaxed text-muted-foreground">
              Keep your trips, tickets and member profile in one place. A picture of your ID is required
              for membership and is stored privately.
            </p>
            <div className="mt-7 rounded-2xl border border-primary/20 bg-white/90 p-5 text-sm leading-relaxed shadow-sm">
              <strong>Creating an account is free.</strong> If you choose to enroll afterward, the
              Metro Pro membership is a separate <strong>$25-per-month subscription</strong>.
              Stripe will automatically charge your payment method each month until you cancel.
              You can manage or cancel it from your account.
            </div>
            <p className="mt-6 text-sm text-muted-foreground">
              Already have an account? <a href="/#member-sign-in" className="font-semibold text-primary underline">Member sign in</a>
            </p>
            <p className="mt-3 text-sm text-muted-foreground">
              Just need a ticket? <a href="/#trip-search" className="font-semibold text-primary underline">Book as a guest</a> without an account or ID photo.
            </p>
          </div>
          <form onSubmit={submit} className="ticket-card grid min-w-0 gap-4 p-5 sm:p-8">
            <h2 className="font-serif text-2xl">Your details</h2>
            {isAuthenticated ? <p className="rounded-lg bg-secondary px-3 py-2 text-xs text-muted-foreground">You are currently signed in. Creating a new account will switch your session to the new account.</p> : null}
            <div className="form-field">
              <Label htmlFor="signup-name">Full name *</Label>
              <Input id="signup-name" autoComplete="name" className="h-12" value={name} onChange={e => setName(e.target.value)} required />
            </div>
            <div className="form-field">
              <Label htmlFor="signup-email">Email *</Label>
              <Input id="signup-email" type="email" autoComplete="email" className="h-12" value={email} onChange={e => setEmail(e.target.value)} required />
            </div>
            <div className="form-field">
              <Label htmlFor="signup-phone">Phone number *</Label>
              <Input id="signup-phone" type="tel" autoComplete="tel" className="h-12" value={phone} onChange={e => setPhone(e.target.value)} required />
            </div>
            <div className="form-field">
              <Label htmlFor="signup-password">Password * · 12 characters minimum</Label>
              <Input id="signup-password" type="password" autoComplete="new-password" minLength={12} className="h-12" value={password} onChange={e => setPassword(e.target.value)} required />
            </div>
            <div className="form-field">
              <Label htmlFor="signup-confirm-password">Confirm password *</Label>
              <Input id="signup-confirm-password" type="password" autoComplete="new-password" minLength={12} className="h-12" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} required />
            </div>
            <div className="form-field min-w-0 rounded-xl border border-dashed border-primary/35 bg-[#f4fbfd] p-4">
              <Label htmlFor="signup-id">Picture of your ID *</Label>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">Choose a JPEG, PNG or WebP photo up to 25 MB (HEIC if your browser supports it). We resize and compress it on your device before securely uploading an image under 2 MB. Make sure the ID text is clear.</p>
              <Input id="signup-id" type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" className="mt-3 h-auto min-h-12 min-w-0 bg-white py-2" required onChange={e => setPhoto(e.target.files?.[0] ?? null)} />
              {photo ? <p className="text-xs text-muted-foreground">Selected: {photo.name} ({(photo.size / 1024 / 1024).toFixed(1)} MB)</p> : null}
            </div>
            {error ? <p className="text-sm font-medium text-destructive" role="alert">{error}</p> : null}
            <Button type="submit" className="h-12 w-full text-base" disabled={busy}>{busy ? "Preparing photo and creating account…" : "Create member account"}</Button>
            <p className="text-xs leading-relaxed text-muted-foreground">No payment or recurring subscription starts with this button. Membership enrollment is a separate, optional checkout.</p>
          </form>
        </div>
      </section>
    </PageShell>
  );
}
