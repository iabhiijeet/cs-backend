import { Router } from "express";
import { db } from "../db.js";
import {
  onboarding,
  activityData,
  reportingPeriods,
  buildings,
  floors,
  targets,
  baselines,
} from "../controllers/db/schema.js";
import { eq, and, desc } from "drizzle-orm";
import { authMiddleware } from "../middleware/auth.middleware.js";

const router = Router();

type Row = Record<string, any>;

/** Postgres `numeric` comes back as a string; normalize before arithmetic. */
function n(value: unknown): number {
  const parsed = typeof value === "number" ? value : parseFloat(String(value ?? ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

/** Rounds to a fixed number of decimals and returns a real JSON number. */
function fixed(value: unknown, decimals = 2): number {
  const factor = 10 ** decimals;
  return Math.round(n(value) * factor) / factor;
}

function scopeBucket(scope: unknown): "scope1" | "scope2" | "scope3" {
  const value = String(scope ?? "").toUpperCase().replace(/[^0-9]/g, "");
  if (value === "1") return "scope1";
  if (value === "2") return "scope2";
  return "scope3";
}

/**
 * Categories arrive with inconsistent casing/underscores depending on which
 * import pipeline created them (e.g. "Electricity", "electricity",
 * "PURCHASED_ELECTRICITY"). Normalize so the dashboard doesn't show the same
 * source split across three rows.
 */
function normalizeCategory(category: unknown): string {
  const cleaned = String(category ?? "")
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

  const aliases: Record<string, string> = {
    electricity: "Purchased Electricity",
    "purchased electricity": "Purchased Electricity",
    "grid electricity": "Purchased Electricity",
    "natural gas": "Natural Gas",
    gas: "Natural Gas",
    "diesel generator": "Diesel Generator",
    diesel: "Diesel Generator",
    generator: "Diesel Generator",
    "business travel": "Business Travel",
    travel: "Business Travel",
    flights: "Business Travel",
    "employee commute": "Employee Commute",
    commute: "Employee Commute",
    commuting: "Employee Commute",
    "company vehicles": "Company Vehicles",
    vehicle: "Company Vehicles",
    fleet: "Company Vehicles",
    waste: "Waste",
    wastewater: "Wastewater",
  };

  return aliases[cleaned] ?? cleaned;
}

/** Bucket a normalized category into the footprint groups the UI renders. */
function footprintGroup(category: string): { key: string; name: string; icon: string } {
  const value = category.toLowerCase();

  if (value.includes("travel") || value.includes("flight") || value.includes("hotel")) {
    return { key: "travel", name: "Business Travel", icon: "airplane" };
  }
  if (value.includes("commute") || value.includes("commuting")) {
    return { key: "commute", name: "Employee Commute", icon: "users" };
  }
  if (
    value.includes("electric") ||
    value.includes("energy") ||
    value.includes("gas") ||
    value.includes("diesel") ||
    value.includes("generator") ||
    value.includes("fuel") ||
    value.includes("heating")
  ) {
    return { key: "energy", name: "Building Energy", icon: "building" };
  }
  if (value.includes("waste") || value.includes("water")) {
    return { key: "waste", name: "Waste", icon: "factory" };
  }
  if (
    value.includes("goods") ||
    value.includes("procure") ||
    value.includes("material") ||
    value.includes("supply") ||
    value.includes("capital")
  ) {
    return { key: "procurement", name: "Procurement", icon: "truck" };
  }
  if (value.includes("vehicle") || value.includes("fleet")) {
    return { key: "fleet", name: "Fleet & Equipment", icon: "truck" };
  }
  return { key: "other", name: "Other Sources", icon: "factory" };
}

function sumByScope(activities: Row[]) {
  let scope1 = 0;
  let scope2 = 0;
  let scope3 = 0;

  for (const activity of activities) {
    const kg = n(activity.emissionsKg);
    const bucket = scopeBucket(activity.scope);
    if (bucket === "scope1") scope1 += kg;
    else if (bucket === "scope2") scope2 += kg;
    else scope3 += kg;
  }

  return { scope1, scope2, scope3, total: scope1 + scope2 + scope3 };
}

/** Percentage change from `previous` to `current`; 0 when there's nothing to compare. */
function percentChange(current: number, previous: number): number {
  if (previous <= 0) return 0;
  return fixed(((current - previous) / previous) * 100, 1);
}

/**
 * Monthly trend buckets. The window is the reporting period, widened to cover
 * any activity dated outside it (imports are often back-dated into a closed
 * period but carry a later `createdAt`). Data is never silently dropped.
 */
function buildTrends(activities: Row[], period: Row) {
  const monthKeys = (value: unknown): string | null => {
    if (!value) return null;
    const when = new Date(value as string);
    if (Number.isNaN(when.getTime())) return null;
    return `${when.getFullYear()}-${String(when.getMonth() + 1).padStart(2, "0")}`;
  };

  const keys = new Set<string>();

  const start = new Date(period.startDate);
  const end = new Date(period.endDate);
  if (!Number.isNaN(start.getTime())) {
    const cursor = new Date(start.getFullYear(), start.getMonth(), 1);
    const last = new Date(end.getFullYear(), end.getMonth(), 1);
    while (cursor <= last) {
      keys.add(`${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}`);
      cursor.setMonth(cursor.getMonth() + 1);
    }
  }

  const buckets = new Map<string, { totalKg: number; scope1Kg: number; scope2Kg: number; scope3Kg: number }>();
  const ensure = (key: string) => {
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = { totalKg: 0, scope1Kg: 0, scope2Kg: 0, scope3Kg: 0 };
      buckets.set(key, bucket);
    }
    return bucket;
  };

  keys.forEach(ensure);

  for (const activity of activities) {
    const key = monthKeys(activity.date ?? activity.createdAt);
    if (!key) continue;

    const bucket = ensure(key);
    const kg = n(activity.emissionsKg);
    bucket.totalKg += kg;
    const scope = scopeBucket(activity.scope);
    if (scope === "scope1") bucket.scope1Kg += kg;
    else if (scope === "scope2") bucket.scope2Kg += kg;
    else bucket.scope3Kg += kg;
  }

  return Array.from(buckets.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-24)
    .map(([month, data]) => ({
      month,
      totalKg: fixed(data.totalKg, 4),
      scope1Kg: fixed(data.scope1Kg, 4),
      scope2Kg: fixed(data.scope2Kg, 4),
      scope3Kg: fixed(data.scope3Kg, 4),
    }));
}

/**
 * Headcount / floor area for intensity metrics. Onboarding stores these as
 * coarse ranges ("51 - 250", "250,000 - 1M m2"), so we take the midpoint and
 * fall back to the physical structure when the tenant has recorded real areas.
 */
function parseRangeToMidpoint(value: unknown): number {
  if (value == null) return 0;

  const text = String(value);
  const multipliers: Record<string, number> = { k: 1e3, m: 1e6, b: 1e9 };
  const tokenPattern = /(\d[\d,.]*)\s*([kKmMbB])?/g;

  const parsed: number[] = [];
  let match: RegExpExecArray | null;
  while ((match = tokenPattern.exec(text)) !== null) {
    const base = parseFloat(match[1].replace(/,/g, ""));
    if (!Number.isFinite(base)) continue;
    const suffix = match[2]?.toLowerCase();
    parsed.push(suffix ? base * (multipliers[suffix] ?? 1) : base);
  }

  if (parsed.length === 0) return 0;
  if (parsed.length === 1) return parsed[0];
  return (parsed[0] + parsed[parsed.length - 1]) / 2;
}

async function resolveIntensity(tenantId: string, totalTonnes: number) {
  const [profile] = await db
    .select()
    .from(onboarding)
    .where(eq(onboarding.tenantId, tenantId))
    .limit(1);

  const data = (profile?.data ?? {}) as Row;
  const locations = (data.locations ?? {}) as Row;
  const company = (data.company ?? {}) as Row;

  // Prefer explicitly recorded floor areas over the onboarding range estimate.
  const buildingRows = await db
    .select({ areaSqm: buildings.areaSqm })
    .from(buildings)
    .where(eq(buildings.tenantId, tenantId));

  const floorRows = await db
    .select({ areaSqm: floors.areaSqm })
    .from(floors)
    .where(eq(floors.tenantId, tenantId));

  const recordedArea = [...buildingRows, ...floorRows].reduce(
    (sum, row) => sum + n(row.areaSqm),
    0
  );

  const areaSqm = recordedArea > 0 ? recordedArea : parseRangeToMidpoint(locations.floorArea);
  const headcount = parseRangeToMidpoint(company.employeeCount);

  const tonnesPerEmployee = headcount > 0 ? fixed(totalTonnes / headcount, 3) : 0;
  const kgPerSqm = areaSqm > 0 ? fixed((totalTonnes * 1000) / areaSqm, 2) : 0;

  return {
    tonnesPerEmployee,
    // Retained key for the university (student) flavour of the same metric.
    tonnesPerStudent: tonnesPerEmployee,
    kgPerSqm,
    headcount: fixed(headcount, 0),
    areaSqm: fixed(areaSqm, 0),
  };
}

/** Baseline for the selected period, falling back to the most recent approved one. */
async function resolveBaseline(tenantId: string, periodId: number, periodTotalKg: number) {
  const rows = await db
    .select()
    .from(baselines)
    .where(eq(baselines.tenantId, tenantId))
    .orderBy(desc(baselines.reportingPeriodId));

  const match =
    rows.find((row) => row.reportingPeriodId === periodId) ??
    rows.find((row) => ["APPROVED", "LOCKED", "VERIFIED"].includes(String(row.status ?? "").toUpperCase())) ??
    rows[0];

  if (!match) {
    return { hasBaseline: false, baselineKg: 0, reductionPercentage: 0, baselineName: null as string | null };
  }

  const recorded = n(match.totalEmissions);
  const baselineKg = recorded > 0 ? recorded : periodTotalKg;

  if (baselineKg <= 0) {
    return { hasBaseline: false, baselineKg: 0, reductionPercentage: 0, baselineName: match.name ?? null };
  }

  const reductionPercentage = fixed(((baselineKg - periodTotalKg) / baselineKg) * 100, 1);

  return { hasBaseline: true, baselineKg, reductionPercentage, baselineName: match.name ?? null };
}

router.get("/summary", authMiddleware, async (req: any, res) => {
  try {
    const tenantId = req.user?.tenantId;
    const { reportingPeriodId, campusId, buildingId, floorId } = req.query;

    if (!tenantId) {
      return res.status(400).json({ success: false, message: "Tenant context missing" });
    }

    const emptyResponse = {
      success: true,
      data: {
        overview: {
          totalEmissionsTonnes: 0,
          scope1Tonnes: 0,
          scope2Tonnes: 0,
          scope3Tonnes: 0,
          delta: 0,
          reductionPercentage: 0,
          hasBaseline: false,
          baselineName: null as string | null,
        },
        trends: [],
        categories: [],
        groups: [],
        scopeBreakdown: { scope1: { delta: 0 }, scope2: { delta: 0 } },
        intensity: { tonnesPerEmployee: 0, tonnesPerStudent: 0, kgPerSqm: 0, headcount: 0, areaSqm: 0 },
        recentActivity: [],
        activityStats: {
          total: 0,
          draft: 0,
          submitted: 0,
          underReview: 0,
          verified: 0,
          rejected: 0,
          calculated: 0,
          pending: 0,
          verifiedTotal: 0,
        },
        targets: [],
      },
    };

    // Resolve the selected reporting period.
    let period: Row | null = null;
    if (reportingPeriodId) {
      const [found] = await db
        .select()
        .from(reportingPeriods)
        .where(eq(reportingPeriods.id, Number(reportingPeriodId)))
        .limit(1);
      period = found ?? null;
    } else {
      const [found] = await db
        .select()
        .from(reportingPeriods)
        .where(eq(reportingPeriods.tenantId, tenantId))
        .orderBy(desc(reportingPeriods.startDate))
        .limit(1);
      period = found ?? null;
    }

    if (!period) {
      return res.json(emptyResponse);
    }

    // Guard against a period belonging to another tenant.
    if (period.tenantId !== tenantId) {
      return res.status(403).json({ success: false, message: "Reporting period not found for this tenant." });
    }

    const conditions: any[] = [
      eq(activityData.tenantId, tenantId),
      eq(activityData.reportingPeriodId, period.id),
    ];
    if (campusId) conditions.push(eq(activityData.campusId, Number(campusId)));
    if (buildingId) conditions.push(eq(activityData.buildingId, Number(buildingId)));
    if (floorId) conditions.push(eq(activityData.floorId, Number(floorId)));

    const activities = (await db
      .select()
      .from(activityData)
      .where(and(...conditions))) as Row[];

    const current = sumByScope(activities);

    // Previous period drives the "vs last 12 months" delta.
    const priorPeriods = await db
      .select()
      .from(reportingPeriods)
      .where(eq(reportingPeriods.tenantId, tenantId))
      .orderBy(desc(reportingPeriods.startDate));

    const previous =
      priorPeriods.find(
        (row) => new Date(row.startDate).getTime() < new Date(period.startDate).getTime()
      ) ?? null;

    let previousTotals = { scope1: 0, scope2: 0, scope3: 0, total: 0 };
    let previousActivities: Row[] = [];
    if (previous) {
      previousActivities = (await db
        .select()
        .from(activityData)
        .where(
          and(
            eq(activityData.tenantId, tenantId),
            eq(activityData.reportingPeriodId, previous.id)
          )
        )) as Row[];
      previousTotals = sumByScope(previousActivities);
    }

    const totalTonnes = fixed(current.total / 1000);

    const categories = new Map<string, { tonnesCO2e: number; scope: string; kg: number }>();
    for (const activity of activities) {
      const name = normalizeCategory(activity.category);
      const kg = n(activity.emissionsKg);
      const existing = categories.get(name) ?? {
        tonnesCO2e: 0,
        scope: String(activity.scope ?? "").toUpperCase(),
        kg: 0,
      };
      existing.kg += kg;
      existing.tonnesCO2e += kg / 1000;
      categories.set(name, existing);
    }

    const categoryPayload = Array.from(categories.entries())
      .map(([category, data]) => ({
        category,
        scope: data.scope.startsWith("SCOPE") ? data.scope : `SCOPE_${data.scope.replace(/\D/g, "") || "3"}`,
        tonnesCO2e: fixed(data.tonnesCO2e),
        trend: 0,
      }))
      .sort((a, b) => b.tonnesCO2e - a.tonnesCO2e);

    // Per-category change versus the previous period.
    if (previous && previousTotals.total > 0) {
      const previousByCategory = new Map<string, number>();
      for (const activity of previousActivities) {
        const name = normalizeCategory(activity.category);
        previousByCategory.set(name, (previousByCategory.get(name) ?? 0) + n(activity.emissionsKg));
      }

      for (const entry of categoryPayload) {
        const before = previousByCategory.get(entry.category) ?? 0;
        entry.trend = percentChange(entry.tonnesCO2e * 1000, before);
      }
    }

    const trends = buildTrends(activities, period);

    const groupsMap = new Map<string, { name: string; icon: string; value: number; kg: number; scope: string }>();
    for (const activity of activities) {
      const name = normalizeCategory(activity.category);
      const group = footprintGroup(name);
      const scope = String(activity.scope ?? "").toUpperCase();
      const existing = groupsMap.get(group.key) ?? {
        name: group.name,
        icon: group.icon,
        value: 0,
        kg: 0,
        scope,
      };
      existing.kg += n(activity.emissionsKg);
      existing.value += n(activity.emissionsKg) / 1000;
      groupsMap.set(group.key, existing);
    }

    const groups = Array.from(groupsMap.entries())
      .map(([key, data]) => ({
        key,
        name: data.name,
        icon: data.icon,
        value: fixed(data.value),
        scope: data.scope,
        share: totalTonnes > 0 ? fixed((data.value / totalTonnes) * 100, 1) : 0,
      }))
      .sort((a, b) => b.value - a.value);

    const countStatus = (statuses: string[]) =>
      activities.filter((a) => statuses.includes(String(a.status ?? "").toUpperCase())).length;

    const verifiedCount = countStatus(["VERIFIED"]);

    const activityStats = {
      total: activities.length,
      draft: countStatus(["DRAFT", "NEW"]),
      submitted: countStatus(["SUBMITTED"]),
      underReview: countStatus(["UNDER_REVIEW", "IN_REVIEW"]),
      verified: verifiedCount,
      rejected: countStatus(["REJECTED"]),
      calculated: activities.filter((a) => n(a.emissionsKg) > 0).length,
      pending: activities.filter((a) => String(a.status ?? "").toUpperCase() === "PENDING").length,
      verifiedTotal: verifiedCount,
    };

    const recentActivity = [...activities]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 10)
      .map((a) => ({
        id: a.id,
        category: normalizeCategory(a.category),
        scope: a.scope,
        value: fixed(a.value, 4),
        unit: a.unit,
        emissionsKg: fixed(a.emissionsKg, 4),
        status: a.status,
        createdAt: a.createdAt,
      }));

    const baseline = await resolveBaseline(tenantId, period.id, current.total);
    const intensity = await resolveIntensity(tenantId, totalTonnes);

    const targetRecords = await db
      .select()
      .from(targets)
      .where(eq(targets.tenantId, tenantId))
      .limit(10);

    return res.json({
      success: true,
      data: {
        overview: {
          totalEmissionsTonnes: totalTonnes,
          scope1Tonnes: fixed(current.scope1 / 1000),
          scope2Tonnes: fixed(current.scope2 / 1000),
          scope3Tonnes: fixed(current.scope3 / 1000),
          delta: percentChange(current.total, previousTotals.total),
          reductionPercentage: baseline.reductionPercentage,
          hasBaseline: baseline.hasBaseline,
          baselineName: baseline.baselineName,
        },
        trends,
        categories: categoryPayload,
        groups,
        scopeBreakdown: {
          scope1: { delta: percentChange(current.scope1, previousTotals.scope1) },
          scope2: { delta: percentChange(current.scope2, previousTotals.scope2) },
        },
        intensity,
        recentActivity,
        activityStats,
        targets: targetRecords.map((t) => ({
          id: t.id,
          name: t.name,
          targetYear: t.targetYear,
          baselineYear: t.baselineYear,
          reductionPercentage: fixed(t.reductionPercentage, 2),
          scope: t.scope,
          status: t.status,
        })),
      },
    });
  } catch (error: any) {
    console.error("Dashboard summary failed:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch dashboard summary.",
    });
  }
});

export default router;