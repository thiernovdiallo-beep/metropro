import { usePrivateDriverPhoto } from "@/lib/usePrivateDriverPhoto";

export function DriverPortrait({ profileId, name, className = "h-14 w-14" }: {
  profileId: number | null | undefined; name: string; className?: string;
}) {
  const url = usePrivateDriverPhoto(profileId);
  return url ? <img src={url} alt={`${name} profile photo`} className={`${className} shrink-0 rounded-full border border-border object-cover`} /> :
    <span aria-label={`${name} profile photo unavailable`} className={`${className} flex shrink-0 items-center justify-center rounded-full bg-secondary text-lg font-semibold text-primary`}>
      {name.trim().charAt(0).toUpperCase() || "D"}
    </span>;
}
