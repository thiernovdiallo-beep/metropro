import { usePrivateDriverPhoto } from "@/lib/usePrivateDriverPhoto";

export function DriverPortrait({ profileId, name, className = "h-14 w-14" }: {
  profileId: number | null | undefined; name: string; className?: string;
}) {
  const url = usePrivateDriverPhoto(profileId);
  const portraitClass = `${className} shrink-0 rounded-full border-2 border-white bg-white object-cover ring-1 ring-primary/20 shadow-sm`;

  return url ? (
    <img src={url} alt={`${name} profile photo`} className={portraitClass} />
  ) : (
    <span aria-label={`${name} profile photo unavailable`} className={`${portraitClass} flex items-center justify-center bg-secondary font-serif text-xl font-semibold text-primary`}>
      {name.trim().charAt(0).toUpperCase() || "D"}
    </span>
  );
}
