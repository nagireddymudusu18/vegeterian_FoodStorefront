import { describe, expect, it } from "vitest";
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
  pushRecentLocation,
  resolveNearestPreset,
  validateCoordinates,
} from "./locations";

describe("locations pure logic", () => {
  it("computes Haversine distance and human-friendly distance formatting", () => {
    const dZero = distanceKm(12.9716, 77.5946, 12.9716, 77.5946);
    expect(dZero).toBe(0);
    expect(formatDistanceKm(dZero)).toBe("Here");
    expect(formatDistanceKm(0.45)).toBe("450 m");
    expect(formatDistanceKm(2.34)).toBe("2.3 km");

    // MG Road to Indiranagar is ~2.6 km
    const dIndira = distanceKm(12.9716, 77.5946, 12.9784, 77.618);
    expect(dIndira).toBeGreaterThan(2.0);
    expect(dIndira).toBeLessThan(3.2);
  });

  it("counts deliverable partner kitchens for central vs outer locations", () => {
    // MG Road (12.9716, 77.5946) is within all 4 kitchens' delivery radius
    const central = countDeliverableKitchens(12.9716, 77.5946);
    expect(central.count).toBe(4);
    expect(central.total).toBe(4);

    // Whitefield (12.9698, 77.7499) is ~16km east -> 0 kitchens
    const whitefield = countDeliverableKitchens(12.9698, 77.7499);
    expect(whitefield.count).toBe(0);
  });

  it("converts lat/lng to interactive map percentages and back", () => {
    const centerLat = (BENGALURU_MAP_BOUNDS.minLat + BENGALURU_MAP_BOUNDS.maxLat) / 2;
    const centerLng = (BENGALURU_MAP_BOUNDS.minLng + BENGALURU_MAP_BOUNDS.maxLng) / 2;

    const pct = latLngToMapPercent(centerLat, centerLng);
    expect(pct.inBounds).toBe(true);
    expect(pct.xPercent).toBeCloseTo(50, 0);
    expect(pct.yPercent).toBeCloseTo(50, 0);

    const roundTrip = mapPercentToLatLng(pct.xPercent, pct.yPercent);
    expect(roundTrip.lat).toBeCloseTo(centerLat, 3);
    expect(roundTrip.lng).toBeCloseTo(centerLng, 3);

    // Out of bounds clamps cleanly to 4..96%
    const out = latLngToMapPercent(12.5, 78.2);
    expect(out.inBounds).toBe(false);
    expect(out.xPercent).toBe(96);
    expect(out.yPercent).toBe(96);
  });

  it("resolves nearest neighbourhood preset and smart label", () => {
    const exact = resolveNearestPreset(12.9716, 77.5946);
    expect(exact.preset.id).toBe("mg-road");
    expect(exact.suggestedLabel).toBe("MG Road");

    const nearby = resolveNearestPreset(12.982, 77.625);
    expect(nearby.preset.id).toBe("indiranagar");
    expect(nearby.suggestedLabel).toBe("Near Indiranagar");

    const far = resolveNearestPreset(13.2, 77.9);
    expect(far.suggestedLabel).toContain("Pinned (13.200, 77.900)");
  });

  it("parses coordinate strings and validates lat/lng ranges", () => {
    expect(parseCoordinateInput("12.9716, 77.5946")).toEqual({ lat: 12.9716, lng: 77.5946 });
    expect(parseCoordinateInput("12.9716 77.5946")).toEqual({ lat: 12.9716, lng: 77.5946 });
    expect(parseCoordinateInput("Indiranagar")).toBeNull();
    expect(parseCoordinateInput("99.5, 77.5")).toBeNull();

    expect(validateCoordinates("12.97", "77.59")).toEqual({ ok: true, lat: 12.97, lng: 77.59 });
    expect(validateCoordinates("", "77.59")).toEqual({
      ok: false,
      error: "Enter both latitude and longitude.",
    });
    expect(validateCoordinates("95", "77.59")).toEqual({
      ok: false,
      error: "Latitude must be between -90 and 90.",
    });
    expect(validateCoordinates("12.97", "195")).toEqual({
      ok: false,
      error: "Longitude must be between -180 and 180.",
    });
  });

  it("filters neighbourhood presets by name, landmark, or pincode", () => {
    expect(filterLocationPresets("").length).toBe(BENGALURU_PRESETS.length);
    expect(filterLocationPresets("560038").map((p) => p.id)).toEqual(["indiranagar"]);
    expect(filterLocationPresets("lalbagh").map((p) => p.id)).toEqual(["jayanagar-lalbagh"]);
    expect(filterLocationPresets("cubbon").map((p) => p.id)).toEqual(["mg-road"]);
  });

  it("deduplicates and caps recent locations list", () => {
    const initial = [
      { lat: 12.9716, lng: 77.5946, label: "MG Road" },
      { lat: 12.9784, lng: 77.618, label: "Indiranagar" },
    ];
    const updated = pushRecentLocation(initial, { lat: 12.9716, lng: 77.5946, label: "MG Road" });
    expect(updated).toHaveLength(2);
    expect(updated[0].label).toBe("MG Road");

    const withMore = pushRecentLocation(
      pushRecentLocation(
        pushRecentLocation(updated, { lat: 12.9915, lng: 77.5712, label: "Malleshwaram" }),
        { lat: 12.948, lng: 77.5838, label: "Jayanagar" },
      ),
      { lat: 12.9352, lng: 77.6245, label: "Koramangala" },
      4,
    );
    expect(withMore).toHaveLength(4);
    expect(withMore[0].label).toBe("Koramangala");
  });
});
