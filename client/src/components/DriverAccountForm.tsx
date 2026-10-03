import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { prepareIdPhoto } from "@/lib/id-photo";
import { trpc } from "@/lib/trpc";
import { useState } from "react";
import { toast } from "sonner";

type Driver = { id: number; fullName: string; email: string; phone: string | null; userId: number | null; status: "active" | "inactive" };

export function DriverAccountForm({ drivers, onCreated }: { drivers: Driver[]; onCreated: () => void }) {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [idNumber, setIdNumber] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [setupLink, setSetupLink] = useState("");
  const [error, setError] = useState("");
  const create = trpc.admin.inviteDriver.useMutation();
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setError(""); setSetupLink("");
    if (!photo) { setError("Choose the driver's profile photo."); return; }
    try {
      const image = await prepareIdPhoto(photo);
      const result = await create.mutateAsync({ fullName, email, phone, idNumber, photoBase64: image.base64 });
      setSetupLink(`${window.location.origin}/driver/setup#token=${result.setupToken}`);
      setIdNumber(""); setPhoto(null); onCreated();
      toast.success("Driver account created. Share the setup link privately.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not create the driver account."); }
  }
  return <section className="ticket-card mt-5 max-w-2xl p-5 sm:p-6">
    <h3 className="font-serif text-xl">Create driver account</h3>
    <p className="mt-2 text-sm text-muted-foreground">Only administrators can create a driver. The driver chooses their own password from the private, single-use link you share. Links expire in 24 hours.</p>
    {drivers.some(driver => !driver.userId && driver.status === "active") ? <div className="form-field mt-4">
      <Label htmlFor="existing-driver">Link an existing unassigned driver profile (optional)</Label>
      <select id="existing-driver" className="mt-1 min-h-12 w-full rounded-md border border-input bg-white px-3 text-sm" defaultValue=""
        onChange={event => { const profile = drivers.find(driver => driver.id === Number(event.target.value)); if (profile) { setFullName(profile.fullName); setEmail(profile.email); setPhone(profile.phone ?? ""); } }}>
        <option value="">New driver or enter details below</option>
        {drivers.filter(driver => !driver.userId && driver.status === "active").map(driver => <option key={driver.id} value={driver.id}>{driver.fullName} · {driver.email}</option>)}
      </select>
    </div> : null}
    <form onSubmit={submit} className="mt-4 grid min-w-0 gap-4 sm:grid-cols-2">
      <div className="form-field"><Label htmlFor="new-driver-name">Driver name</Label><Input id="new-driver-name" required value={fullName} onChange={e => setFullName(e.target.value)} /></div>
      <div className="form-field"><Label htmlFor="new-driver-email">Sign-in email</Label><Input id="new-driver-email" type="email" autoComplete="off" required value={email} onChange={e => setEmail(e.target.value)} /></div>
      <div className="form-field"><Label htmlFor="new-driver-phone">Driver phone</Label><Input id="new-driver-phone" type="tel" autoComplete="off" minLength={7} required value={phone} onChange={e => setPhone(e.target.value)} /></div>
      <div className="form-field"><Label htmlFor="new-driver-id">Driver ID number</Label><Input id="new-driver-id" type="text" autoComplete="off" minLength={4} maxLength={64} required value={idNumber} onChange={e => setIdNumber(e.target.value)} /></div>
      <div className="form-field sm:col-span-2"><Label htmlFor="new-driver-photo">Profile photo</Label><Input id="new-driver-photo" type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" required={!photo} onChange={e => setPhoto(e.target.files?.[0] ?? null)} /><p className="mt-1 text-xs text-muted-foreground">Large phone photos are compressed on this device before private upload. This portrait and ID number are not public.</p></div>
      {error ? <p role="alert" className="text-sm text-destructive sm:col-span-2">{error}</p> : null}
      <Button className="min-h-12 sm:col-span-2" disabled={create.isPending}>{create.isPending ? "Creating account…" : "Create driver & setup link"}</Button>
    </form>
    {setupLink ? <div className="mt-5 rounded-xl border border-primary/25 bg-secondary p-4">
      <p className="text-sm font-semibold">One-time setup link · expires in 24 hours</p>
      <p className="mt-1 text-xs">Copy and share privately with this driver. It will not appear again after leaving this page; you can reissue it below if needed.</p>
      <Input aria-label="One-time driver setup link" className="mt-3 bg-white" readOnly value={setupLink} onFocus={event => event.currentTarget.select()} />
      <Button className="mt-3" variant="outline" onClick={async () => { try { await navigator.clipboard.writeText(setupLink); toast.success("Private setup link copied"); } catch { toast.error("Select and copy the link above"); } }}>Copy setup link</Button>
    </div> : null}
  </section>;
}
