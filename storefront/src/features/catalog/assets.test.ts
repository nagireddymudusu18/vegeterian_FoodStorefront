import { describe, expect, it } from "vitest";
import {
  CURATED_CULINARY_ASSETS,
  classifyDishHeuristic,
  isSafeSelfHostedAssetUrl,
  resolveMenuItemAsset,
  resolveRestaurantAsset,
} from "./assets";

describe("Culinary content assets & artifacts", () => {
  it("exposes self-hosted /assets/food/ paths for all curated presets", () => {
    expect(CURATED_CULINARY_ASSETS.length).toBeGreaterThanOrEqual(4);
    for (const preset of CURATED_CULINARY_ASSETS) {
      expect(isSafeSelfHostedAssetUrl(preset.src)).toBe(true);
      expect(preset.src.startsWith("/assets/food/")).toBe(true);
    }
  });

  it("validates CSP-compliant asset URLs and blocks external third-party URLs", () => {
    expect(isSafeSelfHostedAssetUrl("/assets/food/saffron-south-indian.jpg")).toBe(true);
    expect(isSafeSelfHostedAssetUrl("data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==")).toBe(true);
    expect(isSafeSelfHostedAssetUrl("https://images.unsplash.com/photo-123")).toBe(false);
    expect(isSafeSelfHostedAssetUrl("//evil.example.com/photo.jpg")).toBe(false);
    expect(isSafeSelfHostedAssetUrl("")).toBe(false);
    expect(isSafeSelfHostedAssetUrl(null)).toBe(false);
  });

  it("resolves restaurant cover assets by seeded restaurant id and cuisine fallback", () => {
    const saffron = resolveRestaurantAsset({
      id: "rest-saffron-1",
      name: "Saffron Pure Veg Bhavan",
      cuisine: "South Indian",
      kitchenCertificationLevel: "TIER_1_EXCLUSIVE_VEG",
    });
    expect(saffron.src).toBe("/assets/food/saffron-south-indian.jpg");
    expect(saffron.tag).toContain("PURE VEG");

    const customVegan = resolveRestaurantAsset({
      id: "rest-custom-99",
      name: "Bengaluru Plant Kitchen",
      cuisine: "Vegan Bowls",
      kitchenCertificationLevel: "TIER_1_EXCLUSIVE_VEG",
    });
    expect(customVegan.src).toBe("/assets/food/green-leaf-vegan.jpg");
    expect(customVegan.icon).toBe("biryani");
  });

  it("resolves dish thumbnails with focal crop points and heuristic classification", () => {
    const dosa = resolveMenuItemAsset(
      {
        id: "item-saffron-2",
        name: "Masala Dosa",
        description: "Crisp rice crepe",
        isPureVeg: true,
        isVegan: true,
        isJain: false,
      },
      "Saffron Pure Veg Bhavan",
    );
    expect(dosa.src).toBe("/assets/food/saffron-south-indian.jpg");
    expect(dosa.categoryLabel).toBe("Tawa Dosa");
    expect(dosa.icon).toBe("dosa");

    const heuristicSweet = classifyDishHeuristic("Badam Halwa", "Warm almond dessert in ghee");
    expect(heuristicSweet.icon).toBe("sweet");
    expect(heuristicSweet.categoryLabel).toBe("Artisanal Sweet");
  });
});
