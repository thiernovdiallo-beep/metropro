/**
 * GOOGLE MAPS FRONTEND INTEGRATION - ESSENTIAL GUIDE
 *
 * USAGE FROM PARENT COMPONENT:
 * ======
 *
 * const mapRef = useRef<google.maps.Map | null>(null);
 *
 * <MapView
 *   initialCenter={{ lat: 40.7128, lng: -74.0060 }}
 *   initialZoom={15}
 *   onMapReady={(map) => {
 *     mapRef.current = map; // Store to control map from parent anytime, google map itself is in charge of the re-rendering, not react state.
 * </MapView>
 *
 * ======
 * Available Libraries and Core Features:
 * -------------------------------
 * 📍 MARKER (from `marker` library)
 * - Attaches to map using { map, position }
 * new google.maps.marker.AdvancedMarkerElement({
 *   map,
 *   position: { lat: 37.7749, lng: -122.4194 },
 *   title: "San Francisco",
 * });
 *
 * -------------------------------
 * 🏢 PLACES (from `places` library)
 * - Does not attach directly to map; use data with your map manually.
 * const place = new google.maps.places.Place({ id: PLACE_ID });
 * await place.fetchFields({ fields: ["displayName", "location"] });
 * map.setCenter(place.location);
 * new google.maps.marker.AdvancedMarkerElement({ map, position: place.location });
 *
 * -------------------------------
 * 🧭 GEOCODER (from `geocoding` library)
 * - Standalone service; manually apply results to map.
 * const geocoder = new google.maps.Geocoder();
 * geocoder.geocode({ address: "New York" }, (results, status) => {
 *   if (status === "OK" && results[0]) {
 *     map.setCenter(results[0].geometry.location);
 *     new google.maps.marker.AdvancedMarkerElement({
 *       map,
 *       position: results[0].geometry.location,
 *     });
 *   }
 * });
 *
 * -------------------------------
 * 📐 GEOMETRY (from `geometry` library)
 * - Pure utility functions; not attached to map.
 * const dist = google.maps.geometry.spherical.computeDistanceBetween(p1, p2);
 *
 * -------------------------------
 * 🛣️ ROUTES (from `routes` library)
 * - Combines DirectionsService (standalone) + DirectionsRenderer (map-attached)
 * const directionsService = new google.maps.DirectionsService();
 * const directionsRenderer = new google.maps.DirectionsRenderer({ map });
 * directionsService.route(
 *   { origin, destination, travelMode: "DRIVING" },
 *   (res, status) => status === "OK" && directionsRenderer.setDirections(res)
 * );
 *
 * -------------------------------
 * 🌦️ MAP LAYERS (attach directly to map)
 * - new google.maps.TrafficLayer().setMap(map);
 * - new google.maps.TransitLayer().setMap(map);
 * - new google.maps.BicyclingLayer().setMap(map);
 *
 * -------------------------------
 * ✅ SUMMARY
 * - “map-attached” → AdvancedMarkerElement, DirectionsRenderer, Layers.
 * - “standalone” → Geocoder, DirectionsService, DistanceMatrixService, ElevationService.
 * - “data-only” → Place, Geometry utilities.
 */

/// <reference types="@types/google.maps" />

import { useEffect, useRef, useState } from "react";
import { usePersistFn } from "@/hooks/usePersistFn";
import { cn } from "@/lib/utils";

declare global {
  interface Window {
    google?: typeof google;
  }
}

function loadMapScript() {
  const config = window.__MANUS_CONFIG__;
  if (!config?.apiUrl || !config.apiBrowserKey) return Promise.reject(new Error("Maps is not configured"));
  const API_KEY = encodeURIComponent(config.apiBrowserKey);
  const MAPS_PROXY_URL = `${config.apiUrl.replace(/\/$/, "")}/v1/maps/proxy`;
  return new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = `${MAPS_PROXY_URL}/maps/api/js?key=${API_KEY}&v=weekly&libraries=marker,places,geocoding,geometry,routes`;
    script.async = true;
    script.crossOrigin = "anonymous";
    script.onload = () => {
      resolve();
      script.remove(); // Clean up immediately
    };
    script.onerror = () => {
      console.error("Failed to load Google Maps script");
      reject(new Error("Google Maps is unavailable"));
    };
    document.head.appendChild(script);
  });
}

export type MapMarker = {
  lat: number;
  lng: number;
  label: string;
  type: "origin" | "stop" | "destination";
  city?: string;
  region?: string;
  arrival?: string;
  departure?: string;
  pickupDropoff?: string;
};

interface MapViewProps {
  className?: string;
  initialCenter?: google.maps.LatLngLiteral;
  initialZoom?: number;
  markers?: MapMarker[];
  onMapReady?: (map: google.maps.Map) => void;
}

export function MapView({
  className,
  initialCenter = { lat: 37.7749, lng: -122.4194 },
  initialZoom = 12,
  markers = [],
  onMapReady,
}: MapViewProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<google.maps.Map | null>(null);
  const markerRefs = useRef<Array<{ marker: google.maps.marker.AdvancedMarkerElement; element: HTMLButtonElement }>>([]);
  const routePolyline = useRef<google.maps.Polyline | null>(null);
  const infoWindow = useRef<google.maps.InfoWindow | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState(false);

  const isMobileViewport = typeof window !== "undefined" && window.innerWidth < 640;
  const staticMapUrl = markers.length
    ? `/api/route-map?${markers.map(marker => `marker=${encodeURIComponent(`${marker.type}:${marker.lat},${marker.lng}`)}`).join("&")}${isMobileViewport ? "&mobile=1" : ""}`
    : "";

  function markerCode(marker: MapMarker, index: number) {
    if (marker.type === "origin") return "A";
    if (marker.type === "destination") return "D";
    return String(index);
  }

  function escapeHtml(value: string) {
    return value.replace(/[&<>'"]/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[character] ?? character));
  }

  function clearMapOverlays() {
    markerRefs.current.forEach(({ marker }) => { marker.map = null; });
    markerRefs.current = [];
    routePolyline.current?.setMap(null);
    routePolyline.current = null;
  }

  function renderMarkers(mapInstance: google.maps.Map, nextMarkers: MapMarker[]) {
    clearMapOverlays();
    if (!nextMarkers.length) return;

    infoWindow.current ??= new google.maps.InfoWindow();
    const bounds = new google.maps.LatLngBounds();
    nextMarkers.forEach((markerData, index) => {
      const element = document.createElement("button");
      element.type = "button";
      const code = markerCode(markerData, index);
      const isIntermediateStop = markerData.type === "stop";
      element.className = isIntermediateStop
        ? "group relative flex h-9 w-9 items-center justify-center rounded-full border-2 border-[#4A90B8] bg-[#EAF2F1] text-sm font-bold text-[#3A7CA5] shadow-lg transition-transform duration-200 hover:scale-125 focus:outline-none focus:ring-2 focus:ring-[#4A90B8]"
        : "group relative flex h-9 w-9 items-center justify-center rounded-full border-2 border-[#15803D] bg-white text-sm font-bold text-[#0F172A] shadow-lg transition-transform duration-200 hover:scale-125 focus:outline-none focus:ring-2 focus:ring-[#0D2B55]";
      element.textContent = code;
      element.setAttribute("aria-label", `${code} ${markerData.label}${isIntermediateStop ? ", intermediate stop" : ""}`);
      element.title = `${code} · ${markerData.label}${isIntermediateStop ? " · Intermediate stop" : ""}`;
      if (isIntermediateStop) {
        const tooltip = document.createElement("span");
        tooltip.className = "pointer-events-none absolute bottom-[calc(100%+8px)] left-1/2 z-10 hidden -translate-x-1/2 whitespace-nowrap rounded-md bg-[#2D3E40] px-2 py-1 text-xs font-medium text-white shadow-md group-hover:block group-focus-visible:block";
        tooltip.textContent = `${code} · ${markerData.label}`;
        element.appendChild(tooltip);
      }
      const marker = new google.maps.marker.AdvancedMarkerElement({
        map: mapInstance,
        position: { lat: markerData.lat, lng: markerData.lng },
        title: markerData.label,
        content: element,
      });
      marker.addListener("click", () => {
        markerRefs.current.forEach(({ element: other }) => other.classList.remove("scale-125", "bg-[#15803D]", "text-white"));
        element.classList.add("scale-125", "bg-[#15803D]", "text-white");
        const detail = [
          `<strong>${escapeHtml(code)} · ${escapeHtml(markerData.label)}</strong>`,
          isIntermediateStop ? "<div>Intermediate stop</div>" : "",
          markerData.city && markerData.region ? `<div>${escapeHtml(markerData.city)}, ${escapeHtml(markerData.region)}</div>` : "",
          markerData.arrival ? `<div>Arrival: ${escapeHtml(markerData.arrival)}</div>` : "",
          markerData.departure ? `<div>Departure: ${escapeHtml(markerData.departure)}</div>` : "",
          markerData.pickupDropoff ? `<div>${escapeHtml(markerData.pickupDropoff)}</div>` : "",
        ].filter(Boolean).join("");
        infoWindow.current?.setContent(`<div style="line-height:1.45">${detail}</div>`);
        infoWindow.current?.open({ map: mapInstance, anchor: marker });
      });
      markerRefs.current.push({ marker, element });
      bounds.extend({ lat: markerData.lat, lng: markerData.lng });
    });
    if (nextMarkers.length === 1) {
      mapInstance.setCenter({ lat: nextMarkers[0].lat, lng: nextMarkers[0].lng });
      mapInstance.setZoom(Math.max(initialZoom, 13));
    } else {
      mapInstance.fitBounds(bounds, window.innerWidth < 640 ? 30 : 64);
    }
  }

  function renderRoute(mapInstance: google.maps.Map, nextMarkers: MapMarker[]) {
    if (nextMarkers.length < 2) return;
    const origin = nextMarkers[0];
    const destination = nextMarkers[nextMarkers.length - 1];
    const waypoints = nextMarkers.slice(1, -1).map(marker => ({
      location: { lat: marker.lat, lng: marker.lng },
      stopover: true,
    }));
    new google.maps.DirectionsService().route({
      origin: { lat: origin.lat, lng: origin.lng },
      destination: { lat: destination.lat, lng: destination.lng },
      waypoints,
      travelMode: google.maps.TravelMode.DRIVING,
      optimizeWaypoints: false,
    }, (result, status) => {
      const path = status === google.maps.DirectionsStatus.OK && result?.routes[0]?.overview_path
        ? result.routes[0].overview_path
        : nextMarkers.map(marker => ({ lat: marker.lat, lng: marker.lng }));
      routePolyline.current?.setMap(null);
      routePolyline.current = new google.maps.Polyline({
        map: mapInstance,
        path,
        geodesic: false,
        strokeColor: "#111827",
        strokeOpacity: 0.95,
        strokeWeight: 6,
        clickable: false,
      });
    });
  }

  const init = usePersistFn(async () => {
    try {
      await loadMapScript();
    } catch {
      setMapError(true);
      return;
    }
    if (!mapContainer.current) {
      console.error("Map container not found");
      return;
    }
    map.current = new window.google.maps.Map(mapContainer.current, {
      zoom: initialZoom,
      center: initialCenter,
      mapTypeControl: true,
      fullscreenControl: true,
      zoomControl: true,
      streetViewControl: true,
      mapId: "DEMO_MAP_ID",
    });
    setMapReady(true);
    if (onMapReady) {
      onMapReady(map.current);
    }
  });

  useEffect(() => {
    init();
  }, [init]);

  useEffect(() => {
    if (mapReady && map.current) renderMarkers(map.current, markers);
    return () => {
      clearMapOverlays();
    };
  }, [mapReady, markers]);

  useEffect(() => {
    if (mapReady && map.current) renderRoute(map.current, markers);
    return () => {
      routePolyline.current?.setMap(null);
      routePolyline.current = null;
    };
  }, [mapReady, markers]);

  return (
    <div ref={mapContainer} className={cn("relative h-[280px] w-full overflow-hidden sm:h-[360px]", className)} aria-label="Route map">
      {mapError && staticMapUrl ? <img src={staticMapUrl} alt="Route map showing pickup and drop-off locations" className="h-full w-full object-cover" /> : null}
      {mapError && !staticMapUrl ? <div className="absolute inset-0 flex items-center justify-center bg-secondary/60 px-5 text-center text-sm text-muted-foreground">Map preview is unavailable right now.</div> : null}
    </div>
  );
}
