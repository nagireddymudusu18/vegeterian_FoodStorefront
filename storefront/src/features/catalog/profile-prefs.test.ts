import { describe, expect, it } from "vitest";
import {
  DEFAULT_CONSENTS,
  matchItemAllergenWatchlist,
  removeSavedAddressById,
  sanitizeAllergenWatchlist,
  sanitizeConsents,
  sanitizeSavedAddresses,
  toggleAllergenInList,
  upsertSavedAddress,
} from "./profile-prefs";

describe("profile-prefs", () => {
  it("toggles and sanitizes allergen watchlist keys", () => {
    const initial = sanitizeAllergenWatchlist(["milk", "invalid_key", "milk", "peanuts"]);
    expect(initial).toEqual(["milk", "peanuts"]);

    const withGluten = toggleAllergenInList(initial, "gluten");
    expect(withGluten).toEqual(["milk", "peanuts", "gluten"]);

    const withoutMilk = toggleAllergenInList(withGluten, "milk");
    expect(withoutMilk).toEqual(["peanuts", "gluten"]);
  });

  it("matches menu item allergens and ingredients against customer watchlist", () => {
    const paneerButterMasala = {
      containsAllergens: ["milk"],
      ingredients: ["paneer", "butter", "tomato", "cream", "onion"],
    };

    expect(matchItemAllergenWatchlist(paneerButterMasala, ["milk", "onion_garlic", "peanuts"])).toEqual([
      "Milk & Dairy",
      "No Onion / Garlic",
    ]);

    expect(matchItemAllergenWatchlist(paneerButterMasala, ["peanuts", "soy"])).toEqual([]);
  });

  it("upserts, replaces singleton HOME/WORK tags, and removes saved addresses", () => {
    const first = upsertSavedAddress([], {
      tag: "HOME",
      label: "Home",
      building: "Flat 402, Palm Grove",
      landmark: "Near Metro Pillar 128",
      areaLabel: "Indiranagar, Bengaluru",
      lat: 12.9784,
      lng: 77.6408,
    });
    expect(first).toHaveLength(1);
    expect(first[0].label).toBe("Home");

    const withWork = upsertSavedAddress(first, {
      tag: "WORK",
      label: "Work",
      building: "4th Floor, Prestige Tech Park",
      areaLabel: "Koramangala, Bengaluru",
      lat: 12.9352,
      lng: 77.6245,
    });
    expect(withWork).toHaveLength(2);

    // Replacing HOME updates existing HOME entry instead of duplicating
    const replacedHome = upsertSavedAddress(withWork, {
      tag: "HOME",
      label: "Home",
      building: "Villa 12, Green Meadows",
      areaLabel: "Jayanagar, Bengaluru",
      lat: 12.9308,
      lng: 77.5838,
    });
    expect(replacedHome).toHaveLength(2);
    expect(replacedHome[0].building).toBe("Villa 12, Green Meadows");

    const sanitized = sanitizeSavedAddresses(replacedHome);
    expect(sanitized).toHaveLength(2);

    const afterRemove = removeSavedAddressById(replacedHome, replacedHome[0].id);
    expect(afterRemove).toHaveLength(1);
    expect(afterRemove[0].tag).toBe("WORK");
  });

  it("sanitizes communication consents with safe defaults", () => {
    expect(sanitizeConsents(null)).toEqual(DEFAULT_CONSENTS);
    expect(sanitizeConsents({ ORDER_SMS_UPDATES: false, PROMOTIONAL_OFFERS: true })).toEqual({
      ORDER_SMS_UPDATES: false,
      EMAIL_RECEIPTS: true,
      PROMOTIONAL_OFFERS: true,
    });
  });
});
