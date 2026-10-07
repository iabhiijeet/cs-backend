import { calculateIndiaFixedEmission } from "./IndiaFixedEmission.service.js";
import { calculateIndiaClimatiqFallback } from "./IndiaClimatiqFallback.service.js";

type IndiaEmissionInput = {
  category: string;
  itemName: string;
  value: number;
  unit: string;
  amount?: number;
  currency?: string;
};

const INDIA_FIXED_CATEGORIES = ["electricity", "electricity_bill", "railway", "flight"];

// Synonym categories → canonical India fixed-EF category.
// Invoice/manual entry pipelines emit variants like "PURCHASED_ELECTRICITY" or
// "purchased electricity" which previously fell through to Climatiq and returned
// UNIT_CONVERSION_NOT_SUPPORTED (leaving emissionsKg null on the dashboard).
const INDIA_CATEGORY_ALIASES: Record<string, string> = {
  "purchased electricity": "electricity",
  "purchased_electricity": "electricity",
  "grid electricity": "electricity",
  "electricity consumption": "electricity",
  "electricity usage": "electricity",
  "electricity bill": "electricity",
  "electricity_bill": "electricity",
  power: "electricity",
  "power bill": "electricity",
  rail: "railway",
  train: "railway",
  "railway travel": "railway",
  "air travel": "flight",
  airline: "flight",
  aviation: "flight",
};

function normalizeIndiaCategory(category: string): string {
  const raw = String(category || "").toLowerCase().trim().replace(/\s+/g, " ");
  return INDIA_CATEGORY_ALIASES[raw] ?? raw;
}

export async function calculateIndiaEmission(input: IndiaEmissionInput) {
  const category = normalizeIndiaCategory(input.category);

  if (INDIA_FIXED_CATEGORIES.includes(category)) {
    return await calculateIndiaFixedEmission({
      category,
      value: input.value,
      unit: input.unit,
    });
  }

  return await calculateIndiaClimatiqFallback({
    category,
    itemName: input.itemName,
    value: input.value,
    unit: input.unit,
    amount: input.amount,
    currency: input.currency,
  });
}
