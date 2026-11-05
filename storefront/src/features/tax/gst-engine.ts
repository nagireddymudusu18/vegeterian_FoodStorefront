/**
 * Indian GST & HSN/SAC Tax Calculation Engine for E-Commerce Food Delivery
 * Implements Section 9(5) CGST Act ECO rules:
 * - HSN/SAC 996331 (Restaurant / Cloud Kitchen Food Service): 5% GST (2.5% CGST + 2.5% SGST intra-state)
 * - HSN/SAC 220210 (Aerated / Carbonated Packaged Beverages): 18% GST (9% CGST + 9% SGST)
 * - HSN/SAC 996812 (Platform Delivery & Eco-Packaging Charges): 18% GST (9% CGST + 9% SGST)
 */

export type HsnSacCode = "996331" | "220210" | "210690" | "996812";

export interface TaxLineInput {
  itemId: string;
  name: string;
  quantity: number;
  unitPricePaise: number;
  categoryHint?: string;
}

export interface TaxLineBreakdown {
  itemId: string;
  name: string;
  quantity: number;
  hsnSac: HsnSacCode;
  hsnDescription: string;
  grossLinePaise: number;
  discountSharePaise: number;
  taxableValuePaise: number;
  gstRatePercent: number;
  cgstRatePercent: number;
  sgstRatePercent: number;
  igstRatePercent: number;
  cgstPaise: number;
  sgstPaise: number;
  igstPaise: number;
  totalLineTaxPaise: number;
}

export interface TaxQuoteBreakdown {
  placeOfSupply: string;
  supplierStateCode: string;
  customerStateCode: string;
  interState: boolean;
  grossSubtotalPaise: number;
  discountPercent: number;
  discountPaise: number;
  netTaxableFoodPaise: number;
  foodCgstPaise: number;
  foodSgstPaise: number;
  foodIgstPaise: number;
  foodTaxPaise: number;
  deliveryHsnSac: "996812";
  deliveryFeePaise: number;
  deliveryGstRatePercent: number;
  deliveryCgstPaise: number;
  deliverySgstPaise: number;
  deliveryIgstPaise: number;
  deliveryTaxPaise: number;
  totalCgstPaise: number;
  totalSgstPaise: number;
  totalIgstPaise: number;
  totalTaxPaise: number;
  grandTotalPaise: number;
  lines: TaxLineBreakdown[];
}

export function classifyItemHsnSac(name: string, categoryHint?: string): {
  hsnSac: HsnSacCode;
  description: string;
  gstRatePercent: number;
} {
  const normalized = `${name} ${categoryHint ?? ""}`.toLowerCase();
  if (/\b(cola|soda|aerated|sparkling|tonic|energy drink)\b/.test(normalized)) {
    return {
      hsnSac: "220210",
      description: "Aerated & Packaged Beverages",
      gstRatePercent: 18,
    };
  }
  if (/\b(jamun|halwa|laddu|barfi|mysore pak|payasam|jalebi|rasmalai)\b/.test(normalized)) {
    return {
      hsnSac: "210690",
      description: "Traditional Indian Sweetmeats & Confectionery",
      gstRatePercent: 5,
    };
  }
  return {
    hsnSac: "996331",
    description: "Restaurant & Cloud Kitchen Meal Preparation (ECO Sec 9(5))",
    gstRatePercent: 5,
  };
}

export function calculateOrderTaxBreakdown(input: {
  lines: TaxLineInput[];
  discountPercent?: number;
  deliveryFeePaise?: number;
  supplierStateCode?: string;
  customerStateCode?: string;
  includeDeliveryGstInTotal?: boolean;
}): TaxQuoteBreakdown {
  const supplierStateCode = input.supplierStateCode || "29"; // Karnataka
  const customerStateCode = input.customerStateCode || "29";
  const interState = supplierStateCode !== customerStateCode;
  const discountPercent = Math.max(0, Math.min(50, Math.round(input.discountPercent ?? 0)));
  const deliveryFeePaise = Math.max(0, Math.round(input.deliveryFeePaise ?? 3000));

  const grossSubtotalPaise = input.lines.reduce(
    (sum, l) => sum + Math.max(0, Math.round(l.unitPricePaise)) * Math.max(1, Math.round(l.quantity)),
    0,
  );
  const discountPaise = Math.round((grossSubtotalPaise * discountPercent) / 100);
  const netTaxableFoodPaise = Math.max(0, grossSubtotalPaise - discountPaise);

  let remainingDiscount = discountPaise;
  const lineBreakdowns: TaxLineBreakdown[] = input.lines.map((line, index) => {
    const qty = Math.max(1, Math.round(line.quantity));
    const unit = Math.max(0, Math.round(line.unitPricePaise));
    const grossLinePaise = unit * qty;
    const isLast = index === input.lines.length - 1;
    const discountSharePaise =
      grossSubtotalPaise <= 0
        ? 0
        : isLast
          ? remainingDiscount
          : Math.min(remainingDiscount, Math.round((grossLinePaise / grossSubtotalPaise) * discountPaise));
    remainingDiscount = Math.max(0, remainingDiscount - discountSharePaise);

    const taxableValuePaise = Math.max(0, grossLinePaise - discountSharePaise);
    const { hsnSac, description, gstRatePercent } = classifyItemHsnSac(line.name, line.categoryHint);
    const totalLineTaxPaise = Math.round((taxableValuePaise * gstRatePercent) / 100);

    const cgstPaise = interState ? 0 : Math.round(totalLineTaxPaise / 2);
    const sgstPaise = interState ? 0 : totalLineTaxPaise - cgstPaise;
    const igstPaise = interState ? totalLineTaxPaise : 0;

    return {
      itemId: line.itemId,
      name: line.name,
      quantity: qty,
      hsnSac,
      hsnDescription: description,
      grossLinePaise,
      discountSharePaise,
      taxableValuePaise,
      gstRatePercent,
      cgstRatePercent: interState ? 0 : gstRatePercent / 2,
      sgstRatePercent: interState ? 0 : gstRatePercent / 2,
      igstRatePercent: interState ? gstRatePercent : 0,
      cgstPaise,
      sgstPaise,
      igstPaise,
      totalLineTaxPaise,
    };
  });

  const foodCgstPaise = lineBreakdowns.reduce((s, l) => s + l.cgstPaise, 0);
  const foodSgstPaise = lineBreakdowns.reduce((s, l) => s + l.sgstPaise, 0);
  const foodIgstPaise = lineBreakdowns.reduce((s, l) => s + l.igstPaise, 0);
  const foodTaxPaise = foodCgstPaise + foodSgstPaise + foodIgstPaise;

  // Delivery fee is inclusive of 18% GST on the ₹30 standard charge, or 0 when waived
  const deliveryGstRatePercent = 18;
  const deliveryTaxPaise =
    deliveryFeePaise > 0 && input.includeDeliveryGstInTotal
      ? Math.round((deliveryFeePaise * deliveryGstRatePercent) / 100)
      : 0;
  const deliveryCgstPaise = interState ? 0 : Math.round(deliveryTaxPaise / 2);
  const deliverySgstPaise = interState ? 0 : deliveryTaxPaise - deliveryCgstPaise;
  const deliveryIgstPaise = interState ? deliveryTaxPaise : 0;

  const totalCgstPaise = foodCgstPaise + deliveryCgstPaise;
  const totalSgstPaise = foodSgstPaise + deliverySgstPaise;
  const totalIgstPaise = foodIgstPaise + deliveryIgstPaise;
  const totalTaxPaise = foodTaxPaise + deliveryTaxPaise;
  const grandTotalPaise = netTaxableFoodPaise + totalTaxPaise + deliveryFeePaise;

  return {
    placeOfSupply: customerStateCode === "29" ? "29 - Karnataka" : `${customerStateCode} - India`,
    supplierStateCode,
    customerStateCode,
    interState,
    grossSubtotalPaise,
    discountPercent,
    discountPaise,
    netTaxableFoodPaise,
    foodCgstPaise,
    foodSgstPaise,
    foodIgstPaise,
    foodTaxPaise,
    deliveryHsnSac: "996812",
    deliveryFeePaise,
    deliveryGstRatePercent,
    deliveryCgstPaise,
    deliverySgstPaise,
    deliveryIgstPaise,
    deliveryTaxPaise,
    totalCgstPaise,
    totalSgstPaise,
    totalIgstPaise,
    totalTaxPaise,
    grandTotalPaise,
    lines: lineBreakdowns,
  };
}
