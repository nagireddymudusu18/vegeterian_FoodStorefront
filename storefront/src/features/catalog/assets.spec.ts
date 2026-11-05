import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  CURATED_CULINARY_ASSETS,
  classifyDishHeuristic,
  isSafeSelfHostedAssetUrl,
  resolveMenuItemAsset,
  resolveRestaurantAsset,
} from "./assets";

describe("Culinary content assets & artifacts (node:test)", () => {
  it("enforces same-origin /assets/ paths and rejects untrusted external image hosts", () => {
    for (const preset of CURATED_CULINARY_ASSETS) {
      assert.equal(isSafeSelfHostedAssetUrl(preset.src), true);
    }
    assert.equal(isSafeSelfHostedAssetUrl("https://images.unsplash.com/photo-1"), false);
    assert.equal(isSafeSelfHostedAssetUrl("//cdn.example.com/a.jpg"), false);
  });

  it("resolves distinct photography and focal points across the 4 Bengaluru kitchens", () => {
    const ids = ["rest-saffron-1", "rest-green-2", "rest-jain-3", "rest-spice-4"];
    const resolvedSrcs = new Set(
      ids.map(
        (id) =>
          resolveRestaurantAsset({
            id,
            name: id,
            cuisine: "Indian",
            kitchenCertificationLevel: "TIER_1_EXCLUSIVE_VEG",
          }).src,
      ),
    );
    assert.equal(resolvedSrcs.size, 4);
  });

  it("resolves dish assets and honours safe custom imageUrl overrides", () => {
    const custom = resolveMenuItemAsset({
      id: "item-new-1",
      name: "Filter Coffee",
      description: "Chikmagalur decoction",
      isPureVeg: true,
      isVegan: false,
      isJain: true,
      imageUrl: "/assets/food/jain-rasoi-thali.jpg",
    });
    assert.equal(custom.src, "/assets/food/jain-rasoi-thali.jpg");
    assert.equal(classifyDishHeuristic("Filter Coffee").icon, "beverage");
  });
});
