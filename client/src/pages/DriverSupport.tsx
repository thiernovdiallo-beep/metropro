import { DriverLayout } from "@/layouts/DriverLayout";
import { PageIntro, ResourceState, StatusNotice } from "@/components/MetroUI";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { useState } from "react";
import { toast } from "sonner";

export default function DriverSupport() {
  const home = trpc.driver.home.useQuery();
  const trips = [home.data?.today, ...(home.data?.upcoming ?? [])].filter(Boolean) as NonNullable<typeof home.data>["today"][];
  const [departureId, setDepartureId] = useState("");
  const [kind, setKind] = useState<"dispatch" | "delay" | "vehicle">("dispatch");
  const [message, setMessage] = useState("");
  const selected = trips.find(trip => String(trip?.departure.id) === departureId) ?? trips[0];
  const chosenDepartureId = Number(departureId || selected?.departure.id || 0);
  const contact = trpc.driver.contactDispatch.useMutation({ onSuccess: () => { setMessage(""); toast.success("Dispatch message sent"); }, onError: error => toast.error(error.message) });
  const delay = trpc.driver.reportDelay.useMutation({ onSuccess: () => { setMessage(""); toast.success("Delay reported to dispatch"); }, onError: error => toast.error(error.message) });
  const vehicle = trpc.driver.reportVehicle.useMutation({ onSuccess: () => { setMessage(""); toast.success("Vehicle issue reported"); }, onError: error => toast.error(error.message) });
  const pending = contact.isPending || delay.isPending || vehicle.isPending;

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!chosenDepartureId || message.trim().length < 3) return;
    if (kind === "dispatch") contact.mutate({ departureId: chosenDepartureId, message: message.trim() });
    else if (kind === "delay") delay.mutate({ departureId: chosenDepartureId, reason: message.trim() });
    else if (selected?.vehicle?.id) vehicle.mutate({ departureId: chosenDepartureId, vehicleId: selected.vehicle.id, message: message.trim() });
    else toast.error("No vehicle is assigned to the selected trip.");
  }

  return <DriverLayout><div className="space-y-6">
    <PageIntro eyebrow="Operations help" title="Driver support" description="Contact dispatch or report a trip and vehicle issue without leaving the driver portal." />
    <ResourceState loading={home.isLoading} error={home.error ? "Your assigned trips could not be loaded." : null} empty={!trips.length} emptyTitle="No assigned trips" emptyDescription="Trip-specific support becomes available when you have an assigned departure." onRetry={() => void home.refetch()}>
      <form className="ticket-card grid gap-4 p-5 sm:p-6" onSubmit={submit}>
        <label className="form-field"><span className="metro-form-label">Trip</span><select className="metro-control" value={departureId || String(selected?.departure.id ?? "")} onChange={event => setDepartureId(event.target.value)} required><option value="" disabled>Select a trip</option>{trips.map(trip => trip ? <option key={trip.departure.id} value={trip.departure.id}>{trip.origin?.name} → {trip.destination?.name} · {new Date(trip.departure.departAt).toLocaleString()}</option> : null)}</select></label>
        <label className="form-field"><span className="metro-form-label">Request type</span><select className="metro-control" value={kind} onChange={event => setKind(event.target.value as typeof kind)}><option value="dispatch">Contact dispatch</option><option value="delay">Report a delay</option><option value="vehicle">Report vehicle issue</option></select></label>
        <label className="form-field"><span className="metro-form-label">Details</span><textarea className="metro-control min-h-32 p-3" value={message} onChange={event => setMessage(event.target.value)} placeholder={kind === "delay" ? "Describe the delay and expected impact." : kind === "vehicle" ? "Describe the vehicle problem and whether it is safe to operate." : "Tell dispatch what you need."} minLength={3} required /></label>
        {kind === "vehicle" && !selected?.vehicle?.id ? <StatusNotice tone="pending">A vehicle must be assigned to the selected trip before a vehicle issue can be reported.</StatusNotice> : null}
        <Button type="submit" className="min-h-12" disabled={pending || !chosenDepartureId}>{pending ? "Sending…" : "Send to dispatch"}</Button>
      </form>
    </ResourceState>
  </div></DriverLayout>;
}
