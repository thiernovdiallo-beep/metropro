import { useEffect, useState } from "react";
import { COOKIE_NAME } from "@shared/const";

export function usePrivateDriverPhoto(profileId: number | null | undefined) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!profileId) return;
    const controller = new AbortController();
    let objectUrl: string | null = null;
    async function load() {
      try {
        const token = sessionStorage.getItem("metropro-admin-session") ||
          sessionStorage.getItem("metropro-driver-session") ||
          sessionStorage.getItem("manus-cookie")?.split(";").find(part => part.trim().startsWith(`${COOKIE_NAME}=`))?.trim().slice(COOKIE_NAME.length + 1);
        const response = await fetch(`/api/driver-photo/${profileId}`, {
          credentials: "include", cache: "no-store", signal: controller.signal,
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        });
        if (!response.ok) return;
        objectUrl = URL.createObjectURL(await response.blob());
        if (!controller.signal.aborted) setUrl(objectUrl);
      } catch { /* An unavailable photo simply has no preview. */ }
    }
    void load();
    return () => { controller.abort(); if (objectUrl) URL.revokeObjectURL(objectUrl); setUrl(null); };
  }, [profileId]);
  return url;
}
