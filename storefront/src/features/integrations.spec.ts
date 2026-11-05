import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  mergeAddressSuggestions,
  parsePhotonGeoJson,
  reverseGeocodeCoordinates,
  searchLocalAddressIndex,
} from "./catalog/address-autocomplete";
import { calculateOrderTaxBreakdown, classifyItemHsnSac } from "./tax/gst-engine";
import {
  buildUpiIntentUri,
  computeGatewaySignature,
  luhnCheck,
  validateCardDetails,
  validateUpiVpa,
  verifyGatewaySignature,
} from "./payments/payment-gateway";
import {
  computeRestaurantRatingSummary,
  validateReviewSubmission,
  wilsonScoreLowerBound,
  type RestaurantReview,
} from "./reviews/reviews-engine";

describe("Module 1: Real Address Suggestions & Reverse Geocoding", () => {
  it("parses Komoot Photon GeoJSON responses and enriches with deliverable kitchen counts", () => {
    const samplePhoton = {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          geometry: { type: "Point", coordinates: [77.618, 12.9784] },
          properties: {
            osm_id: 101,
            name: "100 Feet Road Metro Plaza",
            suburb: "Indiranagar",
            city: "Bengaluru",
            state: "Karnataka",
            postcode: "560038",
          },
        },
      ],
    };

    const parsed = parsePhotonGeoJson(samplePhoton, 12.9716, 77.5946);
    assert.equal(parsed.length, 1);
    assert.equal(parsed[0].title, "100 Feet Road Metro Plaza");
    assert.equal(parsed[0].pincode, "560038");
    assert.equal(parsed[0].source, "photon");
    assert.ok(parsed[0].deliverableKitchens > 0);
  });

  it("searches local India address index by street, society, or 6-digit PIN code and merges cleanly", () => {
    const byPin = searchLocalAddressIndex("560034");
    assert.ok(byPin.length >= 1);
    assert.ok(byPin[0].title.includes("Koramangala"));

    const merged = mergeAddressSuggestions(byPin, searchLocalAddressIndex("Indiranagar"), 5);
    assert.ok(merged.length >= 2);
  });

  it("reverse geocodes coordinates to structured locality and PIN code", () => {
    const resolved = reverseGeocodeCoordinates(12.9716, 77.5946);
    assert.equal(resolved.city, "Bengaluru");
    assert.equal(resolved.pincode, "560001");
  });
});

describe("Module 2: Indian GST & HSN/SAC Tax Calculation Service", () => {
  it("classifies restaurant food vs confectionery and splits intra-state CGST + SGST evenly", () => {
    const dosaHsn = classifyItemHsnSac("Masala Dosa");
    assert.equal(dosaHsn.hsnSac, "996331");
    assert.equal(dosaHsn.gstRatePercent, 5);

    const sweetHsn = classifyItemHsnSac("Gulab Jamun");
    assert.equal(sweetHsn.hsnSac, "210690");

    const quote = calculateOrderTaxBreakdown({
      lines: [
        { itemId: "1", name: "Masala Dosa", quantity: 2, unitPricePaise: 15000 }, // ₹300.00
        { itemId: "2", name: "Gulab Jamun", quantity: 1, unitPricePaise: 10000 }, // ₹100.00
      ],
      discountPercent: 10, // ₹40 discount -> ₹360 taxable
      deliveryFeePaise: 0, // VIP free delivery
      supplierStateCode: "29",
      customerStateCode: "29",
    });

    assert.equal(quote.grossSubtotalPaise, 40000);
    assert.equal(quote.discountPaise, 4000);
    assert.equal(quote.netTaxableFoodPaise, 36000);
    assert.equal(quote.foodTaxPaise, 1800); // 5% of 36000 = 1800 paise (₹18)
    assert.equal(quote.foodCgstPaise, 900);
    assert.equal(quote.foodSgstPaise, 900);
    assert.equal(quote.grandTotalPaise, 37800);
  });
});

describe("Module 3: Payment Gateway (UPI, Card Luhn & Signature Verification)", () => {
  it("validates UPI VPAs and identifies Indian UPI apps/banks", () => {
    const ok = validateUpiVpa("aarav.sharma@okaxis");
    assert.equal(ok.valid, true);
    assert.ok(ok.providerLabel?.includes("Google Pay"));

    const bad = validateUpiVpa("invalid-upi-id");
    assert.equal(bad.valid, false);
  });

  it("validates RuPay/Visa test cards via Luhn checksum and builds UPI QR URIs", () => {
    assert.equal(luhnCheck("4532015112830366"), true);
    const card = validateCardDetails({
      number: "4532 0151 1283 0366",
      expiry: "08/29",
      cvv: "412",
    });
    assert.equal(card.valid, true);
    assert.equal(card.network, "Visa");

    const uri = buildUpiIntentUri({ orderNumber: "FA-7K2M9-P4X8Q", amountPaise: 32900 });
    assert.ok(uri.startsWith("upi://pay?"));
    assert.ok(uri.includes("am=329.00"));
  });

  it("creates and verifies cryptographic payment signatures", () => {
    const sig = computeGatewaySignature("order_rzp_101", "pay_rzp_202");
    assert.equal(verifyGatewaySignature("order_rzp_101", "pay_rzp_202", sig), true);
    assert.equal(verifyGatewaySignature("order_rzp_101", "pay_rzp_999", sig), false);
  });
});

describe("Module 4: Verified Ratings, Reviews & Wilson Score Ranking", () => {
  it("ranks a restaurant with many 4.8★ reviews higher than a 1-review 5.0★ outlier using Wilson score", () => {
    const oneFiveStar = wilsonScoreLowerBound(1, 1);
    const twentyFourHigh = wilsonScoreLowerBound(23, 24);
    assert.ok(
      twentyFourHigh > oneFiveStar,
      `Expected 23/24 positive (${twentyFourHigh}) > 1/1 positive (${oneFiveStar})`,
    );
  });

  it("computes rating distribution, average stars, and dish mentions", () => {
    const sampleReviews: RestaurantReview[] = [
      {
        id: "r1",
        restaurantId: "rest-saffron-1",
        userId: "u1",
        authorName: "Ananya R.",
        verifiedOrder: true,
        rating: 5,
        comment: "Crisp Masala Dosa and spotless pure-veg packaging!",
        tags: ["100% Pure Veg Trust", "Hot & Fresh Packaging"],
        dishNames: ["Masala Dosa"],
        createdAt: new Date().toISOString(),
      },
      {
        id: "r2",
        restaurantId: "rest-saffron-1",
        userId: "u2",
        authorName: "Karthik M.",
        verifiedOrder: true,
        rating: 4,
        comment: "Great Idli Sambar and timely delivery.",
        tags: ["100% Pure Veg Trust"],
        dishNames: ["Idli Sambar", "Masala Dosa"],
        createdAt: new Date().toISOString(),
      },
    ];

    const summary = computeRestaurantRatingSummary("rest-saffron-1", sampleReviews);
    assert.equal(summary.reviewCount, 2);
    assert.equal(summary.averageRating, 4.5);
    assert.equal(summary.distribution[5], 1);
    assert.equal(summary.distribution[4], 1);
    assert.equal(summary.dishMentions["Masala Dosa"], 2);
    assert.equal(summary.topTags[0].tag, "100% Pure Veg Trust");

    const v = validateReviewSubmission({ rating: 5, comment: "Delicious sattvik thali!" });
    assert.equal(v.ok, true);
  });
});
