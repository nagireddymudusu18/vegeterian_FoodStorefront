"use client";

import { useEffect, useRef, useState, type FormEvent, type MouseEvent } from "react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { toast } from "sonner";
import { catalog, type AddressSuggestion } from "@/lib/api";
import { usePrefs, type Location } from "./prefs-context";
import {
  BENGALURU_MAP_BOUNDS,
  BENGALURU_PRESETS,
  countDeliverableKitchens,
  distanceKm,
  filterLocationPresets,
  formatDistanceKm,
  latLngToMapPercent,
  mapPercentToLatLng,
  parseCoordinateInput,
  PARTNER_KITCHEN_PINS,
  resolveNearestPreset,
  validateCoordinates,
  type LocationPreset,
} from "./locations";

const OPEN_PICKER_EVENT = "veggo:open-location-picker";

export function openLocationPickerModal() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(OPEN_PICKER_EVENT));
  }
}

export function MapPinSvg({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M20 10c0 5.5-8 12-8 12s-8-6.5-8-12a8 8 0 1 1 16 0Z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  );
}

function GpsTargetSvg({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="7" />
      <circle cx="12" cy="12" r="2" />
      <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
    </svg>
  );
}

function KitchenPinSvg({ className = "h-3 w-3" }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2" />
      <path d="M7 2v20" />
      <path d="M21 15V2v0a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7" />
    </svg>
  );
}

function ClockSvg({ className = "h-3.5 w-3.5" }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}

function useGeolocationTrigger(onResolved: (loc: Location) => void) {
  const [geoBusy, setGeoBusy] = useState(false);
  const [geoErr, setGeoErr] = useState<string | null>(null);

  function triggerGps() {
    setGeoErr(null);
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
      setGeoErr("Geolocation is not supported in this browser. Pick a neighbourhood below.");
      return;
    }
    setGeoBusy(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGeoBusy(false);
        const lat = Math.round(pos.coords.latitude * 10000) / 10000;
        const lng = Math.round(pos.coords.longitude * 10000) / 10000;
        const nearest = resolveNearestPreset(lat, lng);
        const label = nearest.distanceKm <= 2.5 ? `${nearest.preset.shortName} (GPS)` : "Current location (GPS)";
        const next = { lat, lng, label };
        onResolved(next);
        toast.success(`Location updated to ${label}`);
      },
      (err) => {
        setGeoBusy(false);
        setGeoErr(err.message || "Could not get your GPS location. Pick a neighbourhood instead.");
      },
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 60_000 },
    );
  }

  return { geoBusy, geoErr, setGeoErr, triggerGps };
}

export function LocationSelectorDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { location, setLocation, recentLocations } = usePrefs();
  const [search, setSearch] = useState("");
  const [draft, setDraft] = useState<Location>(location);
  const [latInput, setLatInput] = useState(() => String(location.lat));
  const [lngInput, setLngInput] = useState(() => String(location.lng));
  const [customLabel, setCustomLabel] = useState(() => location.label);
  const [coordErr, setCoordErr] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [suggestionsBusy, setSuggestionsBusy] = useState(false);
  const mapRef = useRef<HTMLDivElement>(null);

  const { geoBusy, geoErr, triggerGps } = useGeolocationTrigger((loc) => {
    setDraft(loc);
    setLatInput(String(loc.lat));
    setLngInput(String(loc.lng));
    setCustomLabel(loc.label);
    setLocation(loc);
    onOpenChange(false);
  });

  useEffect(() => {
    if (!open) return;
    const ctrl = new AbortController();
    const timer = setTimeout(() => {
      setSuggestionsBusy(true);
      catalog
        .autocompleteAddress(search, draft.lat, draft.lng, ctrl.signal)
        .then((res) => {
          setSuggestions(Array.isArray(res?.suggestions) ? res.suggestions : []);
          setSuggestionsBusy(false);
        })
        .catch(() => {
          setSuggestionsBusy(false);
        });
    }, 180);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [open, search, draft.lat, draft.lng]);

  function syncDraft(next: Location) {
    setDraft(next);
    setLatInput(String(next.lat));
    setLngInput(String(next.lng));
    setCustomLabel(next.label);
    setCoordErr(null);
  }

  function applyAndClose(next: Location) {
    setLocation(next);
    syncDraft(next);
    toast.success(`Delivering to ${next.label}`);
    onOpenChange(false);
  }

  function handleSelectPreset(p: LocationPreset) {
    applyAndClose({
      lat: p.lat,
      lng: p.lng,
      label: p.shortName,
    });
  }

  function handleSelectSuggestion(s: AddressSuggestion) {
    const label = s.pincode ? `${s.title} (${s.pincode})` : `${s.title}, ${s.locality}`;
    applyAndClose({
      lat: s.lat,
      lng: s.lng,
      label,
    });
  }

  function handleMapClick(e: MouseEvent<HTMLDivElement>) {
    const el = mapRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const xPercent = ((e.clientX - rect.left) / rect.width) * 100;
    const yPercent = ((e.clientY - rect.top) / rect.height) * 100;
    const { lat, lng } = mapPercentToLatLng(xPercent, yPercent, BENGALURU_MAP_BOUNDS);
    const nearest = resolveNearestPreset(lat, lng);
    syncDraft({
      lat,
      lng,
      label: nearest.suggestedLabel,
    });
    catalog
      .reverseGeocode(lat, lng)
      .then((rev) => {
        const s = rev?.suggestion;
        if (s && s.title) {
          syncDraft({
            lat,
            lng,
            label: s.pincode ? `${s.title} (${s.pincode})` : s.title,
          });
        }
      })
      .catch(() => undefined);
  }

  function handleCustomSubmit(e: FormEvent) {
    e.preventDefault();
    setCoordErr(null);
    const validated = validateCoordinates(latInput, lngInput);
    if (!validated.ok) {
      setCoordErr(validated.error);
      return;
    }
    const nearest = resolveNearestPreset(validated.lat, validated.lng);
    const label = customLabel.trim() || nearest.suggestedLabel;
    applyAndClose({
      lat: validated.lat,
      lng: validated.lng,
      label,
    });
  }

  const parsedSearchCoords = parseCoordinateInput(search);
  const filteredPresets = filterLocationPresets(search);
  const draftMapPos = latLngToMapPercent(draft.lat, draft.lng, BENGALURU_MAP_BOUNDS);
  const draftCoverage = countDeliverableKitchens(draft.lat, draft.lng);

  return (
    <DialogPrimitive.Root
      open={open}
      onOpenChange={(nextOpen) => {
        if (nextOpen) {
          syncDraft(location);
          setSearch("");
        }
        onOpenChange(nextOpen);
      }}
    >
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/55 backdrop-blur-[1px]" />
        <DialogPrimitive.Content
          aria-describedby="loc-dialog-desc"
          className="fixed inset-x-3 top-[4vh] z-50 mx-auto flex max-h-[92vh] max-w-2xl flex-col overflow-hidden rounded-3xl bg-cream text-ink shadow-2xl ring-1 ring-stone-300 sm:inset-x-6 sm:top-[6vh]"
        >
          {/* Header */}
          <div className="flex items-start justify-between gap-3 border-b border-stone-200 bg-white px-5 py-4">
            <div>
              <DialogPrimitive.Title className="text-lg font-extrabold text-ink sm:text-xl">
                Choose your delivery spot
              </DialogPrimitive.Title>
              <DialogPrimitive.Description id="loc-dialog-desc" className="text-xs text-stone-600 sm:text-sm">
                Search street, apartment society, or PIN code (powered by OpenStreetMap Photon), or tap the map.
              </DialogPrimitive.Description>
            </div>
            <DialogPrimitive.Close
              aria-label="Close location picker"
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-stone-200 text-stone-600 hover:bg-stone-100 hover:text-ink"
            >
              <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </DialogPrimitive.Close>
          </div>

          {/* Scrollable Body */}
          <div className="flex-1 space-y-5 overflow-y-auto p-4 sm:p-5">
            {/* Search + GPS row */}
            <div className="flex flex-col gap-2.5 sm:flex-row">
              <div className="relative flex-1">
                <label htmlFor="loc-search-input" className="sr-only">
                  Search street, apartment society, landmark, pincode or paste coordinates
                </label>
                <input
                  id="loc-search-input"
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search 100 Feet Road, Prestige Shantiniketan, 560038, or 12.97, 77.59..."
                  className="w-full rounded-xl border border-stone-300 bg-white px-3.5 py-2.5 text-sm text-ink placeholder:text-stone-400"
                />
              </div>
              <button
                type="button"
                onClick={triggerGps}
                disabled={geoBusy}
                className="inline-flex min-h-[42px] shrink-0 items-center justify-center gap-2 rounded-xl border border-green-700 bg-green-50 px-4 py-2.5 text-sm font-semibold text-green-900 hover:bg-green-100 disabled:opacity-50"
              >
                <GpsTargetSvg className="h-4 w-4 text-green-800" />
                {geoBusy ? "Locating..." : "Use my GPS"}
              </button>
            </div>

            {geoErr && (
              <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-2 text-xs font-medium text-red-800">
                {geoErr}
              </p>
            )}

            {parsedSearchCoords && (
              <div className="flex items-center justify-between gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-2.5 text-sm">
                <div>
                  <p className="font-semibold text-ink">
                    Coordinates detected: {parsedSearchCoords.lat.toFixed(4)}, {parsedSearchCoords.lng.toFixed(4)}
                  </p>
                  <p className="text-xs text-stone-600">
                    {resolveNearestPreset(parsedSearchCoords.lat, parsedSearchCoords.lng).suggestedLabel}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const nearest = resolveNearestPreset(parsedSearchCoords.lat, parsedSearchCoords.lng);
                    applyAndClose({
                      lat: parsedSearchCoords.lat,
                      lng: parsedSearchCoords.lng,
                      label: nearest.suggestedLabel,
                    });
                  }}
                  className="rounded-lg bg-green-700 px-3.5 py-2 text-xs font-bold text-white hover:bg-green-800"
                >
                  Deliver here
                </button>
              </div>
            )}

            {/* Street, Society & Landmark Autocomplete Suggestions */}
            {suggestions.length > 0 && (
              <div className="space-y-2 rounded-2xl border border-stone-200 bg-white p-3.5 shadow-2xs">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-green-800">
                    {search.trim()
                      ? "Matching street & society addresses"
                      : "Suggested street & society addresses near you"}
                  </span>
                  <span className="text-[11px] text-stone-500">
                    {suggestionsBusy ? "Searching OpenStreetMap..." : `${suggestions.length} suggestions`}
                  </span>
                </div>
                <ul className="divide-y divide-stone-100">
                  {suggestions.slice(0, search.trim() ? 6 : 4).map((s) => (
                    <li key={s.id}>
                      <button
                        type="button"
                        onClick={() => handleSelectSuggestion(s)}
                        className="flex w-full items-start justify-between gap-3 rounded-xl px-2.5 py-2 text-left transition hover:bg-green-50/70"
                      >
                        <div className="flex min-w-0 items-start gap-2.5">
                          <MapPinSvg className="mt-0.5 h-4 w-4 shrink-0 text-green-700" />
                          <div className="min-w-0">
                            <p className="truncate text-sm font-bold text-ink">{s.title}</p>
                            <p className="truncate text-xs text-stone-600">{s.subtitle}</p>
                          </div>
                        </div>
                        <div className="shrink-0 text-right">
                          {s.pincode && (
                            <span className="block font-mono text-[11px] font-semibold text-stone-700">
                              PIN {s.pincode}
                            </span>
                          )}
                          {s.distanceKm !== undefined && (
                            <span className="block text-[11px] text-stone-500">
                              {formatDistanceKm(s.distanceKm)}
                            </span>
                          )}
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Interactive Map Pad */}
            <div className="overflow-hidden rounded-2xl border border-stone-300 bg-white shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-stone-200 bg-stone-50 px-4 py-2.5">
                <div className="flex items-center gap-2">
                  <span className="inline-block h-2.5 w-2.5 rounded-full bg-green-700" aria-hidden="true" />
                  <span className="text-xs font-bold uppercase tracking-wider text-stone-700">
                    Interactive Delivery Map — Tap anywhere to move pin
                  </span>
                </div>
                <span
                  className={`rounded-md px-2 py-0.5 text-xs font-bold ${
                    draftCoverage.count > 0
                      ? "bg-green-100 text-green-900"
                      : "bg-amber-100 text-amber-900"
                  }`}
                >
                  {draftCoverage.count} of {draftCoverage.total} kitchens deliver here
                </span>
              </div>

              {/* Clickable 2D Spatial Map */}
              <div
                ref={mapRef}
                role="application"
                aria-label="Interactive Bengaluru delivery map. Click anywhere to position your delivery pin."
                onClick={handleMapClick}
                className="relative h-56 w-full cursor-crosshair select-none overflow-hidden bg-[#F4EFE0] sm:h-64"
              >
                {/* Decorative SVG Map Background: parks, lakes, arterial roads */}
                <svg
                  viewBox="0 0 400 240"
                  preserveAspectRatio="none"
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-0 h-full w-full"
                >
                  {/* Grid lines */}
                  <g stroke="#E4DCC4" strokeWidth="1">
                    <line x1="80" y1="0" x2="80" y2="240" />
                    <line x1="160" y1="0" x2="160" y2="240" />
                    <line x1="240" y1="0" x2="240" y2="240" />
                    <line x1="320" y1="0" x2="320" y2="240" />
                    <line x1="0" y1="60" x2="400" y2="60" />
                    <line x1="0" y1="120" x2="400" y2="120" />
                    <line x1="0" y1="180" x2="400" y2="180" />
                  </g>
                  {/* Green Parks (Cubbon Park, Lalbagh, Sankey Tank) */}
                  <ellipse cx="175" cy="118" rx="28" ry="18" fill="#D5E8D4" opacity="0.85" />
                  <ellipse cx="145" cy="176" rx="24" ry="16" fill="#D5E8D4" opacity="0.85" />
                  <ellipse cx="115" cy="36" rx="18" ry="11" fill="#CBE4E8" opacity="0.85" />
                  <ellipse cx="255" cy="102" rx="14" ry="10" fill="#CBE4E8" opacity="0.85" />
                  {/* Arterial roads */}
                  <path
                    d="M 0 125 Q 180 118 400 95"
                    fill="none"
                    stroke="#E5C878"
                    strokeWidth="3"
                    strokeDasharray="6 3"
                  />
                  <path
                    d="M 165 0 Q 175 120 195 240"
                    fill="none"
                    stroke="#E5C878"
                    strokeWidth="2.5"
                  />
                </svg>

                {/* Partner Kitchen Markers */}
                {PARTNER_KITCHEN_PINS.map((k) => {
                  const pos = latLngToMapPercent(k.lat, k.lng, BENGALURU_MAP_BOUNDS);
                  return (
                    <div
                      key={k.id}
                      style={{ left: `${pos.xPercent}%`, top: `${pos.yPercent}%` }}
                      title={`${k.name} (${k.tierLabel})`}
                      className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2"
                    >
                      <span className="flex h-5 w-5 items-center justify-center rounded-full border border-white bg-amber-500 text-ink shadow">
                        <KitchenPinSvg className="h-3 w-3" />
                      </span>
                    </div>
                  );
                })}

                {/* Quick Preset Labels on Map */}
                {BENGALURU_PRESETS.filter((p) => p.id !== "whitefield").map((p) => {
                  const pos = latLngToMapPercent(p.lat, p.lng, BENGALURU_MAP_BOUNDS);
                  const isNearDraft = distanceKm(draft.lat, draft.lng, p.lat, p.lng) < 0.35;
                  if (isNearDraft) return null;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        syncDraft({ lat: p.lat, lng: p.lng, label: p.shortName });
                      }}
                      style={{ left: `${pos.xPercent}%`, top: `${pos.yPercent}%` }}
                      className="absolute -translate-x-1/2 -translate-y-1/2 rounded-md bg-white/95 px-2 py-0.5 text-[11px] font-bold text-stone-800 shadow-xs ring-1 ring-stone-300 transition hover:bg-amber-100 hover:ring-amber-400"
                    >
                      {p.shortName}
                    </button>
                  );
                })}

                {/* Active / Draft User Pin */}
                <div
                  style={{ left: `${draftMapPos.xPercent}%`, top: `${draftMapPos.yPercent}%` }}
                  className="pointer-events-none absolute z-20 -translate-x-1/2 -translate-y-full transition-all duration-150"
                >
                  <div className="flex flex-col items-center">
                    <span className="whitespace-nowrap rounded-md bg-ink px-2 py-0.5 text-[11px] font-bold text-white shadow-md">
                      {draft.label}
                    </span>
                    <span className="mt-0.5 flex h-6 w-6 items-center justify-center rounded-full border-2 border-white bg-green-700 text-white shadow-md">
                      <MapPinSvg className="h-3.5 w-3.5" />
                    </span>
                  </div>
                </div>

                {/* Legend */}
                <div className="pointer-events-none absolute bottom-2 left-2.5 flex items-center gap-3 rounded-lg bg-white/95 px-2.5 py-1 text-[11px] font-medium text-stone-700 shadow-xs ring-1 ring-stone-200">
                  <span className="inline-flex items-center gap-1">
                    <span className="inline-block h-2.5 w-2.5 rounded-full bg-green-700" /> Your pin
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <span className="inline-block h-2.5 w-2.5 rounded-full bg-amber-500" /> Partner kitchen
                  </span>
                </div>
              </div>

              {/* Map Action Footer */}
              <div className="flex flex-wrap items-center justify-between gap-3 bg-white px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-ink">
                    Pinned: {draft.label}
                  </p>
                  <p className="text-xs text-stone-500">
                    {draft.lat.toFixed(4)}° N, {draft.lng.toFixed(4)}° E
                    {!draftMapPos.inBounds && " · Outside central map view"}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => applyAndClose(draft)}
                  className="rounded-xl bg-green-700 px-4 py-2 text-sm font-bold text-white shadow-sm hover:bg-green-800"
                >
                  Confirm pin location
                </button>
              </div>
            </div>

            {/* Popular Bengaluru Neighbourhoods Grid */}
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold uppercase tracking-wider text-stone-600">
                  Popular delivery areas
                </h3>
                <span className="text-xs text-stone-500">{filteredPresets.length} areas</span>
              </div>

              {filteredPresets.length === 0 ? (
                <p className="rounded-xl border border-dashed border-stone-300 bg-white p-4 text-center text-sm text-stone-600">
                  No neighbourhoods match &ldquo;{search}&rdquo;. Tap on the map above or enter coordinates below.
                </p>
              ) : (
                <div className="grid gap-2.5 sm:grid-cols-2">
                  {filteredPresets.map((p) => {
                    const dist = distanceKm(location.lat, location.lng, p.lat, p.lng);
                    const isSelected = dist < 0.25;
                    const coverage = countDeliverableKitchens(p.lat, p.lng);
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => handleSelectPreset(p)}
                        className={`flex flex-col justify-between rounded-2xl border p-3.5 text-left transition ${
                          isSelected
                            ? "border-green-700 bg-green-50/70 ring-2 ring-green-700/20"
                            : "border-stone-200 bg-white hover:border-amber-400 hover:bg-amber-50/30"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <span className="font-bold text-ink">{p.name}</span>
                            <p className="mt-0.5 text-xs text-stone-600">{p.landmark}</p>
                          </div>
                          <span className="shrink-0 rounded-md bg-stone-100 px-2 py-0.5 text-[11px] font-semibold text-stone-700">
                            {p.zone}
                          </span>
                        </div>
                        <div className="mt-3 flex items-center justify-between border-t border-stone-100 pt-2 text-xs">
                          <span
                            className={`font-semibold ${
                              coverage.count > 0 ? "text-green-800" : "text-amber-800"
                            }`}
                          >
                            {coverage.count > 0
                              ? `${coverage.count} kitchen${coverage.count === 1 ? "" : "s"} deliver`
                              : "Outside current kitchen radius"}
                          </span>
                          <span className="font-medium text-stone-500">
                            {isSelected ? "Active ✓" : formatDistanceKm(dist)}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Recent Locations */}
            {recentLocations.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-xs font-bold uppercase tracking-wider text-stone-600">
                  Recent locations
                </h3>
                <div className="flex flex-wrap gap-2">
                  {recentLocations.map((r, idx) => (
                    <button
                      key={`${r.label}-${idx}`}
                      type="button"
                      onClick={() => applyAndClose(r)}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-stone-300 bg-white px-3 py-1.5 text-xs font-semibold text-ink hover:bg-stone-100"
                    >
                      <ClockSvg className="h-3.5 w-3.5 text-stone-500" />
                      <span>{r.label}</span>
                      <span className="text-stone-400">
                        ({r.lat.toFixed(2)}, {r.lng.toFixed(2)})
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Collapsible Exact Coordinates Input */}
            <details className="rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm">
              <summary className="cursor-pointer font-semibold text-stone-700 hover:text-ink">
                Advanced: Enter exact latitude & longitude
              </summary>
              <form onSubmit={handleCustomSubmit} className="mt-3 space-y-3">
                <div className="grid gap-3 sm:grid-cols-3">
                  <div>
                    <label htmlFor="custom-loc-label" className="block text-xs font-medium text-stone-600">
                      Label (optional)
                    </label>
                    <input
                      id="custom-loc-label"
                      type="text"
                      value={customLabel}
                      onChange={(e) => setCustomLabel(e.target.value)}
                      placeholder="e.g. Home, Office"
                      className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label htmlFor="custom-lat-input" className="block text-xs font-medium text-stone-600">
                      Latitude (-90 to 90)
                    </label>
                    <input
                      id="custom-lat-input"
                      type="text"
                      inputMode="decimal"
                      value={latInput}
                      onChange={(e) => setLatInput(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label htmlFor="custom-lng-input" className="block text-xs font-medium text-stone-600">
                      Longitude (-180 to 180)
                    </label>
                    <input
                      id="custom-lng-input"
                      type="text"
                      inputMode="decimal"
                      value={lngInput}
                      onChange={(e) => setLngInput(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm"
                    />
                  </div>
                </div>
                {coordErr && (
                  <p role="alert" className="text-xs font-medium text-red-700">
                    {coordErr}
                  </p>
                )}
                <div className="flex justify-end">
                  <button
                    type="submit"
                    className="rounded-lg bg-ink px-4 py-2 text-xs font-bold text-white hover:bg-stone-800"
                  >
                    Apply coordinates
                  </button>
                </div>
              </form>
            </details>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

/**
 * Compact trigger button for Customer Header so users can see & change location from any page.
 */
export function HeaderLocationChip() {
  const { location } = usePrefs();
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`Delivery location: ${location.label}. Click to change location.`}
        className="inline-flex min-h-[38px] min-w-0 max-w-[7.25rem] shrink items-center gap-1 rounded-xl border border-stone-300 bg-white px-2 py-1.5 text-left text-xs font-semibold text-ink shadow-2xs transition hover:border-green-700 hover:bg-green-50/50 sm:max-w-[14rem] sm:gap-1.5 sm:px-3"
      >
        <MapPinSvg className="h-3.5 w-3.5 shrink-0 text-green-700" />
        <span className="truncate">{location.label}</span>
        <span aria-hidden="true" className="text-[10px] text-stone-400">
          ▾
        </span>
      </button>
      <LocationSelectorDialog open={open} onOpenChange={setOpen} />
    </>
  );
}

/**
 * Interactive Home-page Location Card with 1-tap neighbourhood switching, GPS button, and Map Modal trigger.
 */
export function LocationPicker() {
  const { location, setLocation } = usePrefs();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const handler = () => setOpen(true);
    window.addEventListener(OPEN_PICKER_EVENT, handler);
    return () => window.removeEventListener(OPEN_PICKER_EVENT, handler);
  }, []);

  const { geoBusy, geoErr, triggerGps } = useGeolocationTrigger((loc) => {
    setLocation(loc);
  });

  const coverage = countDeliverableKitchens(location.lat, location.lng);

  return (
    <section
      id="delivery-location-card"
      aria-label="Delivery location"
      className="min-w-0 overflow-hidden rounded-2xl border border-stone-200 bg-white p-4 shadow-2xs sm:p-5"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <div
            aria-hidden="true"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-green-100 text-green-800 ring-1 ring-green-200"
          >
            <MapPinSvg className="h-5 w-5" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-stone-500">
                Delivering to
              </span>
              <span
                className={`rounded-md px-2 py-0.5 text-[11px] font-bold ${
                  coverage.count > 0
                    ? "bg-green-100 text-green-900"
                    : "bg-amber-100 text-amber-900"
                }`}
              >
                {coverage.count > 0
                  ? `${coverage.count} kitchen${coverage.count === 1 ? "" : "s"} in range`
                  : "Outside current delivery range"}
              </span>
            </div>
            <p className="mt-0.5 text-base font-extrabold text-ink sm:text-lg">
              {location.label}
              <span className="ml-2 text-xs font-normal text-stone-500">
                ({location.lat.toFixed(3)}, {location.lng.toFixed(3)})
              </span>
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={triggerGps}
            disabled={geoBusy}
            className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-stone-300 bg-stone-50 px-3.5 py-2 text-xs font-semibold text-ink hover:bg-stone-100 disabled:opacity-50"
          >
            <GpsTargetSvg className="h-3.5 w-3.5 text-green-800" />
            {geoBusy ? "Locating..." : "Use GPS"}
          </button>
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl bg-green-700 px-4 py-2 text-xs font-bold text-white shadow-2xs hover:bg-green-800"
          >
            <span>Map & all areas</span>
          </button>
        </div>
      </div>

      {geoErr && (
        <p role="alert" className="mt-2 text-xs font-medium text-red-700">
          {geoErr}
        </p>
      )}

      {/* 1-Tap Quick Area Switcher */}
      <div className="mt-3.5 border-t border-stone-100 pt-3">
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          <span className="shrink-0 text-xs font-semibold text-stone-500">Quick spots:</span>
          {BENGALURU_PRESETS.slice(0, 6).map((p) => {
            const active = distanceKm(location.lat, location.lng, p.lat, p.lng) < 0.25;
            return (
              <button
                key={p.id}
                type="button"
                aria-pressed={active}
                onClick={() => {
                  setLocation({ lat: p.lat, lng: p.lng, label: p.shortName });
                  toast.success(`Delivering to ${p.shortName}`);
                }}
                className={`min-h-[34px] shrink-0 rounded-lg px-3 py-1 text-xs font-semibold transition ${
                  active
                    ? "bg-ink text-white shadow-2xs"
                    : "border border-stone-200 bg-stone-50 text-stone-700 hover:border-amber-400 hover:bg-amber-50/50"
                }`}
              >
                {p.shortName}
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="min-h-[34px] shrink-0 rounded-lg border border-dashed border-stone-300 px-3 py-1 text-xs font-semibold text-green-800 hover:bg-green-50"
          >
            + More spots
          </button>
        </div>
      </div>

      <LocationSelectorDialog open={open} onOpenChange={setOpen} />
    </section>
  );
}
