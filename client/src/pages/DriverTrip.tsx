import { PageShell } from "@/components/Brand";
import { PageIntro, ResourceState, StatusBadge, StatusNotice } from "@/components/MetroUI";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatTime } from "@/lib/format";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  AlertTriangle,
  Camera,
  Check,
  CirclePlay,
  Clock3,
  MapPin,
  MessageSquare,
  Printer,
  ScanLine,
  UserCheck,
  UserX,
  X,
} from "lucide-react";
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
  const passengerCount = t?.manifest?.length ?? 0;

  return (
    <PageShell>
      <div className="container py-8 sm:py-10 lg:py-12">
        <ResourceState
          loading={trip.isLoading}
          error={trip.error?.message}
          empty={!t}
          emptyTitle="Trip unavailable"
          emptyDescription="This assigned trip could not be found. Return to the driver portal and select another assignment."
          onRetry={() => void trip.refetch()}
        >
          <>
            <PageIntro
              eyebrow="Driver operations"
              title={`${t?.origin?.name} → ${t?.destination?.name}`}
              description={
                <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span>{t?.departure ? formatTime(t.departure.departAt) : ""}</span>
                  <span aria-hidden="true">·</span>
                  <span>Vehicle {t?.vehicle?.code ?? "unassigned"}</span>
                  {t?.departure ? <StatusBadge status={t.departure.status} /> : null}
                </span>
              }
              actions={
                <Button type="button" variant="outline" className="no-print" onClick={() => window.print()} disabled={!t}>
                  <Printer aria-hidden="true" />Print assigned manifest
                </Button>
              }
            />

            <section className="ticket-card p-5 sm:p-6" aria-label="Trip boarding summary">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="metro-eyebrow">Boarding progress</p>
                  <p className="font-serif text-3xl font-semibold tracking-tight text-primary">{boarded}/{passengerCount}</p>
                  <p className="mt-1 text-sm text-muted-foreground">passengers boarded</p>
                </div>
                {t?.departure ? <StatusBadge status={t.departure.status} className="mt-1" /> : null}
              </div>
              <div className="mt-5 grid gap-2 sm:grid-cols-2 xl:flex xl:flex-wrap">
                <Button className="w-full xl:w-auto" disabled={t?.departure?.status !== "scheduled" && t?.departure?.status !== "delayed"} onClick={() => start.mutate({ departureId: id })}>
                  <CirclePlay aria-hidden="true" />Start boarding
                </Button>
                <Button className="w-full xl:w-auto" variant="secondary" disabled={t?.departure?.status !== "boarding"} onClick={() => depart.mutate({ departureId: id })}>
                  <MapPin aria-hidden="true" />Mark departure
                </Button>
                <Button className="w-full xl:w-auto" variant="secondary" disabled={t?.departure?.status !== "departed"} onClick={() => arrive.mutate({ departureId: id })}>
                  <MapPin aria-hidden="true" />Mark arrival
                </Button>
                <Button className="w-full xl:w-auto" variant="outline" disabled={t?.departure?.status !== "arrived"} onClick={() => complete.mutate({ departureId: id })}>
                  <Check aria-hidden="true" />Complete trip
                </Button>
              </div>
            </section>

            <section className="ticket-card no-print mt-6 p-5 sm:p-6" aria-labelledby="scan-ticket-heading">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="metro-eyebrow">Boarding tool</p>
                  <h2 id="scan-ticket-heading" className="metro-section-title">Scan passenger QR ticket</h2>
                </div>
                {t?.departure ? <StatusBadge status={t.departure.status} /> : null}
              </div>
              <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted-foreground">Start boarding first. Ask each passenger to show their individual ticket; scanning confirms boarding for this trip only.</p>
              <video ref={videoRef} autoPlay muted playsInline aria-label="Ticket QR camera preview" className={`mt-4 max-h-72 w-full rounded-xl border border-border bg-primary/10 object-cover ${scanning ? "block" : "hidden"}`} />
              <div className="mt-4 grid min-w-0 gap-2 sm:grid-cols-[auto_minmax(0,1fr)_auto]">
                <Button type="button" variant="outline" className="w-full sm:w-auto" disabled={!scanning && t?.departure?.status !== "boarding"} onClick={scanning ? stopCamera : startCamera}>
                  {scanning ? <X aria-hidden="true" /> : <Camera aria-hidden="true" />}{scanning ? "Close camera" : "Open camera"}
                </Button>
                <Input aria-label="Enter ticket code manually" placeholder="Or enter ticket QR code" value={token} onChange={e => setToken(e.target.value)} />
                <Button className="w-full sm:w-auto" disabled={t?.departure?.status !== "boarding" || scan.isPending || token.trim().length < 12} onClick={() => board(token)}>
                  <ScanLine aria-hidden="true" />Confirm boarding
                </Button>
              </div>
              {scanResult ? (
                <StatusNotice tone={scanResult.state === "valid" ? "success" : scanResult.state === "already" ? "pending" : "error"} className="mt-4">
                  <div className="flex min-w-0 flex-wrap items-start gap-2">
                    <StatusBadge
                      status={scanResult.state === "valid" ? "confirmed" : scanResult.state === "already" ? "boarding" : "failed"}
                      label={scanResult.state === "valid" ? "VALID" : scanResult.state === "already" ? "ALREADY BOARDED" : "INVALID"}
                    />
                    <span className="min-w-0 flex-1 font-semibold">{scanResult.message}</span>
                  </div>
                </StatusNotice>
              ) : null}
            </section>

            <section className="manifest-print ticket-card mt-8 p-5 sm:p-6" aria-label="Passenger manifest">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="metro-eyebrow">Passenger manifest</p>
                  <h2 className="metro-section-title">Booked passengers · {t?.origin?.name} <span aria-hidden="true">→</span> {t?.destination?.name}</h2>
                  <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                    {t?.departure ? formatTime(t.departure.departAt) : ""} · Vehicle {t?.vehicle?.code ?? "unassigned"} · {boarded}/{passengerCount} boarded
                  </p>
                </div>
                {t?.departure ? <StatusBadge status={t.departure.status} /> : null}
              </div>
              <div className="mt-5 grid gap-3">
                {(t?.manifest ?? []).map(p => (
                  <article key={p.ticketId} className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-border bg-background/45 p-4">
                    <div className="min-w-0">
                      <div className="font-semibold">{p.firstName} {p.lastName}</div>
                      <div className="mt-1 break-words text-xs leading-relaxed text-muted-foreground">
                        {p.bookingNumber} · {p.phone} · {p.seatNumber ? `Seat ${p.seatNumber}` : p.seatType === "front" ? "Front seat" : "Regular seat"} · Paid
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <StatusBadge status={p.status} />
                        {p.boardedAt ? <span className="text-xs font-medium text-muted-foreground">{formatTime(p.boardedAt)}</span> : null}
                      </div>
                    </div>
                    {p.status !== "boarded" ? (
                      <div className="no-print flex w-full flex-wrap gap-2 sm:w-auto sm:flex-nowrap">
                        <Button size="sm" variant="outline" className="flex-1 sm:flex-none" disabled={t?.departure?.status !== "boarding"} onClick={() => setStatus.mutate({ passengerId: p.id, departureId: id, status: "checked_in" })}>
                          <UserCheck aria-hidden="true" />Check in
                        </Button>
                        <Button size="sm" variant="outline" className="flex-1 sm:flex-none" disabled={t?.departure?.status !== "boarding" && t?.departure?.status !== "departed"} onClick={() => setStatus.mutate({ passengerId: p.id, departureId: id, status: "no_show" })}>
                          <UserX aria-hidden="true" />No-show
                        </Button>
                      </div>
                    ) : null}
                  </article>
                ))}
                {!trip.isLoading && !t?.manifest?.length ? (
                  <StatusNotice tone="info">No paid tickets on this trip yet.</StatusNotice>
                ) : null}
              </div>
            </section>

            <section className="no-print ticket-card mt-8 p-5 sm:p-6" aria-labelledby="trip-support-heading">
              <div className="flex items-center gap-2">
                <MessageSquare className="h-5 w-5 text-primary" aria-hidden="true" />
                <h2 id="trip-support-heading" className="metro-section-title">Trip support</h2>
              </div>
              <p className="mt-2 text-sm text-muted-foreground">Add a concise note before reporting a delay, contacting dispatch, or flagging a vehicle problem.</p>
              <Input className="mt-4" aria-label="Dispatch note" placeholder="Delay, dispatch, or vehicle note" value={note} onChange={e => setNote(e.target.value)} />
              <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:flex xl:flex-wrap">
                <Button variant="outline" className="w-full xl:w-auto" onClick={() => delay.mutate({ departureId: id, reason: note })}>
                  <Clock3 aria-hidden="true" />Report delay
                </Button>
                <Button variant="outline" className="w-full xl:w-auto" onClick={() => dispatch.mutate({ departureId: id, message: note })}>
                  <MessageSquare aria-hidden="true" />Contact dispatch
                </Button>
                {t?.vehicle ? (
                  <Button variant="outline" className="w-full xl:w-auto" onClick={() => vehicleIssue.mutate({ vehicleId: t.vehicle!.id, departureId: id, message: note })}>
                    <AlertTriangle aria-hidden="true" />Report vehicle problem
                  </Button>
                ) : null}
              </div>
            </section>
          </>
        </ResourceState>
      </div>
    </PageShell>
  );
}
