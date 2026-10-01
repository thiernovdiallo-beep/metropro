import { PageShell } from "@/components/Brand";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatTime } from "@/lib/format";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { useRef, useState } from "react";
import { useRoute } from "wouter";

export default function DriverTrip() {
  const [, params] = useRoute("/driver/trip/:id");
  const id = Number(params?.id);
  const utils = trpc.useUtils();
  const trip = trpc.driver.trip.useQuery({ departureId: id }, { enabled: Boolean(id) });
  const scan = trpc.driver.scan.useMutation({
    onSuccess: data => {
      toast.success(`${data.passenger.firstName} ${data.passenger.status.replace("_", " ")}`);
      utils.driver.trip.invalidate();
    },
  });
  const setStatus = trpc.driver.setPassengerStatus.useMutation({
    onSuccess: () => utils.driver.trip.invalidate(),
  });
  const start = trpc.driver.startTrip.useMutation({ onSuccess: () => utils.driver.trip.invalidate() });
  const depart = trpc.driver.markDeparture.useMutation({ onSuccess: () => utils.driver.trip.invalidate() });
  const arrive = trpc.driver.markArrival.useMutation({ onSuccess: () => utils.driver.trip.invalidate() });
  const complete = trpc.driver.completeTrip.useMutation({ onSuccess: () => utils.driver.trip.invalidate() });
  const delay = trpc.driver.reportDelay.useMutation({ onSuccess: () => toast.success("Delay reported") });
  const dispatch = trpc.driver.contactDispatch.useMutation({ onSuccess: () => toast.success("Dispatch notified") });
  const vehicleIssue = trpc.driver.reportVehicle.useMutation({
    onSuccess: () => toast.success("Vehicle issue sent"),
  });
  const [token, setToken] = useState("");
  const [note, setNote] = useState("");
  const videoRef = useRef<HTMLVideoElement>(null);
  const [scanning, setScanning] = useState(false);

  async function startCamera() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        setScanning(true);
        const detector = "BarcodeDetector" in window ? new (window as any).BarcodeDetector({ formats: ["qr_code"] }) : null;
        if (!detector) return;
        const loop = async () => {
          if (!videoRef.current) return;
          try {
            const codes = await detector.detect(videoRef.current);
            if (codes[0]?.rawValue) {
              scan.mutate({ qrToken: codes[0].rawValue, departureId: id });
            }
          } catch {
            /* ignore */
          }
          if (scanning) requestAnimationFrame(loop);
        };
        requestAnimationFrame(loop);
      }
    } catch {
      toast.error("Camera unavailable — type the code instead.");
    }
  }

  const t = trip.data;
  return (
    <PageShell>
      <div className="container py-8">
        <h1 className="font-serif text-3xl">
          {t?.origin?.name} → {t?.destination?.name}
        </h1>
        <p className="text-muted-foreground">
          {t?.departure ? formatTime(t.departure.departAt) : ""} · {t?.vehicle?.code} · {t?.departure?.status}
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button onClick={() => start.mutate({ departureId: id })}>Start trip</Button>
          <Button variant="secondary" onClick={() => depart.mutate({ departureId: id })}>
            Mark departure
          </Button>
          <Button variant="secondary" onClick={() => arrive.mutate({ departureId: id })}>
            Mark arrival
          </Button>
          <Button variant="outline" onClick={() => complete.mutate({ departureId: id })}>
            Complete trip
          </Button>
        </div>
        <div className="ticket-card mt-6 p-4">
          <div className="font-semibold">Scan passenger QR</div>
          <video ref={videoRef} className="mt-2 max-h-48 w-full rounded-md bg-primary/10" />
          <div className="mt-3 grid min-w-0 gap-2 sm:grid-cols-[auto_minmax(0,1fr)_auto]">
            <Button type="button" variant="outline" onClick={startCamera}>
              Open camera
            </Button>
            <Input placeholder="Or type token" value={token} onChange={e => setToken(e.target.value)} />
            <Button onClick={() => scan.mutate({ qrToken: token, departureId: id })}>Scan</Button>
          </div>
        </div>
        <h2 className="mt-8 font-serif text-xl">Passenger manifest</h2>
        <div className="mt-3 grid gap-2">
          {(t?.manifest ?? []).map(p => (
            <div key={p.id} className="ticket-card flex flex-wrap items-center justify-between gap-2 p-4">
              <div>
                <div className="font-medium">
                  {p.firstName} {p.lastName}
                </div>
                <div className="text-xs text-muted-foreground">
                  {p.bookingNumber} · {p.phone} · {p.status.replace("_", " ")} · {p.seatType === "front" ? "Front seat" : "Regular seat"}
                </div>
              </div>
              <div className="flex flex-wrap gap-1">
                <Button size="sm" onClick={() => setStatus.mutate({ passengerId: p.id, departureId: id, status: "checked_in" })}>
                  Check in
                </Button>
                <Button size="sm" variant="secondary" onClick={() => setStatus.mutate({ passengerId: p.id, departureId: id, status: "boarded" })}>
                  Boarded
                </Button>
                <Button size="sm" variant="outline" onClick={() => setStatus.mutate({ passengerId: p.id, departureId: id, status: "no_show" })}>
                  No-show
                </Button>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-8 grid gap-2">
          <Input placeholder="Delay, dispatch, or vehicle note" value={note} onChange={e => setNote(e.target.value)} />
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => delay.mutate({ departureId: id, reason: note })}>
              Report delay
            </Button>
            <Button variant="outline" onClick={() => dispatch.mutate({ departureId: id, message: note })}>
              Contact dispatch
            </Button>
            {t?.vehicle ? (
              <Button
                variant="outline"
                onClick={() =>
                  vehicleIssue.mutate({ vehicleId: t.vehicle!.id, departureId: id, message: note })
                }
              >
                Report vehicle problem
              </Button>
            ) : null}
          </div>
        </div>
      </div>
    </PageShell>
  );
}
