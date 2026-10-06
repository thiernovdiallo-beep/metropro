import { PageShell } from "@/components/Brand";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatTime } from "@/lib/format";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRoute } from "wouter";

export default function DriverTrip() {
  const [, params] = useRoute("/driver/trip/:id");
  const id = Number(params?.id);
  const utils = trpc.useUtils();
  const trip = trpc.driver.trip.useQuery({ departureId: id }, { enabled: Boolean(id) });
  const scan = trpc.driver.scan.useMutation();
  const setStatus = trpc.driver.setPassengerStatus.useMutation({
    onSuccess: () => utils.driver.trip.invalidate(), onError: error => toast.error(error.message),
  });
  const start = trpc.driver.startTrip.useMutation({ onSuccess: () => utils.driver.trip.invalidate(), onError: error => toast.error(error.message) });
  const depart = trpc.driver.markDeparture.useMutation({ onSuccess: () => utils.driver.trip.invalidate(), onError: error => toast.error(error.message) });
  const arrive = trpc.driver.markArrival.useMutation({ onSuccess: () => utils.driver.trip.invalidate(), onError: error => toast.error(error.message) });
  const complete = trpc.driver.completeTrip.useMutation({ onSuccess: () => utils.driver.trip.invalidate(), onError: error => toast.error(error.message) });
  const delay = trpc.driver.reportDelay.useMutation({ onSuccess: () => { toast.success("Delay reported"); void utils.driver.trip.invalidate(); }, onError: error => toast.error(error.message) });
  const dispatch = trpc.driver.contactDispatch.useMutation({ onSuccess: () => toast.success("Dispatch notified") });
  const vehicleIssue = trpc.driver.reportVehicle.useMutation({ onSuccess: () => toast.success("Vehicle issue sent") });
  const [token, setToken] = useState("");
  const [note, setNote] = useState("");
  const [scanResult, setScanResult] = useState<{ state: "valid" | "invalid" | "already"; message: string } | null>(null);
  const [scanning, setScanning] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const detectingRef = useRef(false);
  const mountedRef = useRef(true);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const stopCamera = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    streamRef.current?.getTracks().forEach(track => track.stop());
    streamRef.current = null;
    if (videoRef.current) { videoRef.current.pause(); videoRef.current.srcObject = null; }
    if (mountedRef.current) setScanning(false);
  }, []);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; stopCamera(); };
  }, [stopCamera]);
  useEffect(() => { stopCamera(); }, [id, stopCamera]);

  async function board(qrToken: string) {
    try {
      const result = await scan.mutateAsync({ qrToken: qrToken.trim(), departureId: id });
      const details = `${result.passenger.firstName} ${result.passenger.lastName} · ${result.bookingNumber} · ${result.passenger.seatNumber ? `Seat ${result.passenger.seatNumber}` : "Seat unnumbered"} · ${t?.origin?.name ?? "Trip"} → ${t?.destination?.name ?? "destination"}`;
      setScanResult(result.alreadyBoarded ? { state: "already", message: `${details} · Already boarded.` } : { state: "valid", message: `${details} · Boarded successfully.` });
      toast.success(result.alreadyBoarded ? `${result.passenger.firstName} was already boarded` : `${result.passenger.firstName} ${result.passenger.lastName} boarded`);
      setToken("");
      await utils.driver.trip.invalidate();
    } catch (error) {
      setScanResult({ state: "invalid", message: error instanceof Error ? error.message : "Ticket could not be scanned." });
      toast.error(error instanceof Error ? error.message : "Ticket could not be scanned.");
    }
  }

  async function startCamera() {
    if (streamRef.current || detectingRef.current) return;
    if (!navigator.mediaDevices?.getUserMedia) { toast.error("Camera not available here. Enter the ticket code manually."); return; }
    try {
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { exact: "environment" } } });
      } catch (error) {
        if (!(error instanceof DOMException) || (error.name !== "OverconstrainedError" && error.name !== "NotFoundError")) throw error;
        stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: "environment" } } });
      }
      if (!mountedRef.current || !videoRef.current) { stream.getTracks().forEach(track => track.stop()); return; }
      streamRef.current = stream;
      const video = videoRef.current;
      video.srcObject = stream;
      setScanning(true);
      await video.play();
      const { default: jsQR } = await import("jsqr");
      if (!mountedRef.current || !streamRef.current) { stopCamera(); return; }
      canvasRef.current = document.createElement("canvas");
      timerRef.current = setInterval(async () => {
        if (detectingRef.current || !video.videoWidth || !video.videoHeight || !canvasRef.current) return;
        detectingRef.current = true;
        try {
          const canvas = canvasRef.current;
          const scale = Math.min(1, 960 / video.videoWidth, 960 / video.videoHeight);
          canvas.width = Math.round(video.videoWidth * scale);
          canvas.height = Math.round(video.videoHeight * scale);
          const context = canvas.getContext("2d", { willReadFrequently: true });
          if (!context) return;
          context.drawImage(video, 0, 0, canvas.width, canvas.height);
          const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
          const result = jsQR(pixels.data, pixels.width, pixels.height, { inversionAttempts: "dontInvert" });
          if (result?.data) {
            stopCamera();
            await board(result.data);
          }
        } catch { /* An unreadable frame is normal; try the next frame. */ }
        finally { detectingRef.current = false; }
      }, 200);
    } catch {
      stopCamera();
      toast.error("Could not start camera. Allow camera permission, or enter the ticket code manually.");
    }
  }

  const t = trip.data;
  const boarded = (t?.manifest ?? []).filter(p => p.status === "boarded").length;
  return <PageShell><div className="container py-8">
    <h1 className="font-serif text-3xl">{t?.origin?.name} → {t?.destination?.name}</h1>
    <p className="text-muted-foreground">{t?.departure ? formatTime(t.departure.departAt) : ""} · {t?.vehicle?.code} · {t?.departure?.status}</p>
    <p className="mt-2 text-sm font-semibold text-primary">{boarded}/{t?.manifest?.length ?? 0} passengers boarded</p>
    <div className="mt-4 flex flex-wrap gap-2">
      <Button disabled={t?.departure?.status !== "scheduled" && t?.departure?.status !== "delayed"} onClick={() => start.mutate({ departureId: id })}>Start boarding</Button>
      <Button variant="secondary" disabled={t?.departure?.status !== "boarding"} onClick={() => depart.mutate({ departureId: id })}>Mark departure</Button>
      <Button variant="secondary" disabled={t?.departure?.status !== "departed"} onClick={() => arrive.mutate({ departureId: id })}>Mark arrival</Button>
      <Button variant="outline" disabled={t?.departure?.status !== "arrived"} onClick={() => complete.mutate({ departureId: id })}>Complete trip</Button>
    </div>
    <section className="ticket-card no-print mt-6 p-4 sm:p-5">
      <h2 className="font-semibold">Scan passenger QR ticket</h2>
      <p className="mt-1 text-sm text-muted-foreground">Start boarding first. Ask each passenger to show their individual ticket; scanning confirms boarding for this trip only.</p>
      <video ref={videoRef} autoPlay muted playsInline aria-label="Ticket QR camera preview" className={`mt-3 max-h-64 w-full rounded-md bg-primary/10 object-cover ${scanning ? "block" : "hidden"}`} />
      <div className="mt-3 grid min-w-0 gap-2 sm:grid-cols-[auto_minmax(0,1fr)_auto]">
        <Button type="button" variant="outline" disabled={!scanning && t?.departure?.status !== "boarding"} onClick={scanning ? stopCamera : startCamera}>{scanning ? "Close camera" : "Open camera"}</Button>
        <Input aria-label="Enter ticket code manually" placeholder="Or enter ticket QR code" value={token} onChange={e => setToken(e.target.value)} />
        <Button disabled={t?.departure?.status !== "boarding" || scan.isPending || token.trim().length < 12} onClick={() => board(token)}>Confirm boarding</Button>
      </div>
      {scanResult ? <p role="status" aria-live="polite" className={`mt-3 rounded-xl border p-3 text-sm font-semibold ${scanResult.state === "valid" ? "border-green-300 bg-green-50 text-green-900" : scanResult.state === "already" ? "border-amber-300 bg-amber-50 text-amber-900" : "border-red-300 bg-red-50 text-red-900"}`}>{scanResult.state === "valid" ? "VALID" : scanResult.state === "already" ? "ALREADY BOARDED" : "INVALID"} · {scanResult.message}</p> : null}
    </section>
    <div className="no-print mt-7"><Button variant="outline" className="min-h-11" onClick={() => window.print()} disabled={!t}>Print assigned manifest</Button></div>
    <section className="manifest-print mt-8" aria-label="Passenger manifest">
    <h2 className="font-serif text-xl">Booked passengers · {t?.origin?.name} → {t?.destination?.name}</h2>
    <p className="mt-1 text-xs text-muted-foreground">{t?.departure ? formatTime(t.departure.departAt) : ""} · Vehicle {t?.vehicle?.code ?? "unassigned"} · {boarded}/{t?.manifest?.length ?? 0} boarded</p>
    <div className="mt-3 grid gap-2">
      {(t?.manifest ?? []).map(p => <div key={p.ticketId} className="ticket-card flex flex-wrap items-center justify-between gap-3 p-4">
        <div className="min-w-0">
          <div className="font-medium">{p.firstName} {p.lastName}</div>
          <div className="text-xs text-muted-foreground">{p.bookingNumber} · {p.phone} · {p.seatNumber ? `Seat ${p.seatNumber}` : p.seatType === "front" ? "Front seat" : "Regular seat"} · Paid</div>
          <div className="mt-1 text-xs font-semibold capitalize text-primary">{p.status.replace("_", " ")}{p.boardedAt ? ` · ${formatTime(p.boardedAt)}` : ""}</div>
        </div>
        {p.status !== "boarded" ? <div className="no-print flex flex-wrap gap-1">
          <Button size="sm" variant="outline" disabled={t?.departure?.status !== "boarding"} onClick={() => setStatus.mutate({ passengerId: p.id, departureId: id, status: "checked_in" })}>Check in</Button>
          <Button size="sm" variant="outline" disabled={t?.departure?.status !== "boarding" && t?.departure?.status !== "departed"} onClick={() => setStatus.mutate({ passengerId: p.id, departureId: id, status: "no_show" })}>No-show</Button>
        </div> : null}
      </div>)}
      {!trip.isLoading && !t?.manifest?.length ? <p className="text-sm text-muted-foreground">No paid tickets on this trip yet.</p> : null}
    </div>
    </section>
    <div className="no-print mt-8 grid gap-2">
      <Input aria-label="Dispatch note" placeholder="Delay, dispatch, or vehicle note" value={note} onChange={e => setNote(e.target.value)} />
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={() => delay.mutate({ departureId: id, reason: note })}>Report delay</Button>
        <Button variant="outline" onClick={() => dispatch.mutate({ departureId: id, message: note })}>Contact dispatch</Button>
        {t?.vehicle ? <Button variant="outline" onClick={() => vehicleIssue.mutate({ vehicleId: t.vehicle!.id, departureId: id, message: note })}>Report vehicle problem</Button> : null}
      </div>
    </div>
  </div></PageShell>;
}
