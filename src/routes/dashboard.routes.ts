import { Router } from "express";
import { db } from "../db.js";
import { onboarding, activityData, reportingPeriods, campuses, buildings, floors, emissionFactors, targets, notifications, recommendations, users } from "../controllers/db/schema.js";
import { eq, and, sql, desc, count, sum, avg } from "drizzle-orm";
import { authMiddleware } from "../middleware/auth.middleware.js";

const router = Router();

router.get("/summary", authMiddleware, async (req: any, res) => {
  try {
    const tenantId = req.user?.tenantId;
    const { reportingPeriodId, campusId, buildingId, floorId } = req.query;

    if (!tenantId) {
      return res.status(400).json({ success: false, message: "Tenant context missing" });
    }

    // Get the reporting period
    let period: any = null;
    if (reportingPeriodId) {
      const [p] = await db.select().from(reportingPeriods).where(eq(reportingPeriods.id, Number(reportingPeriodId))).limit(1);
      period = p;
    } else {
      const [p] = await db
        .select()
        .from(reportingPeriods)
        .where(eq(reportingPeriods.tenantId, tenantId))
        .orderBy(desc(reportingPeriods.startDate))
        .limit(1);
      period = p;
    }

    if (!period) {
      return res.json({
        success: true,
        data: {
          overview: { totalEmissionsTonnes: 0, scope1Tonnes: 0, scope2Tonnes: 0, scope3Tonnes: 0, delta: 0, reductionPercentage: 0 },
          trends: [],
          categories: [],
          groups: [],
          scopeBreakdown: { scope1: { delta: 0 }, scope2: { delta: 0 } },
          intensity: { tonnesPerStudent: 0, kgPerSqm: 0 },
          recentActivity: [],
          activityStats: { total: 0, draft: 0, submitted: 0, underReview: 0, verified: 0, rejected: 0, calculated: 0, pending: 0, verifiedTotal: 0 },
          targets: [],
        },
      });
    }

    // Build where conditions for activity data
    const conditions = [eq(activityData.tenantId, tenantId), eq(activityData.reportingPeriodId, period.id)];
    if (campusId) conditions.push(eq(activityData.campusId, Number(campusId)));
    if (buildingId) conditions.push(eq(activityData.buildingId, Number(buildingId)));
    if (floorId) conditions.push(eq(activityData.floorId, Number(floorId)));

    // Get activity data for this period
    const activities = await db
      .select()
      .from(activityData)
      .where(and(...conditions));

    // Calculate emissions by scope
    const scope1Activities = activities.filter(a => a.scope === "SCOPE_1" || a.scope === "1");
    const scope2Activities = activities.filter(a => a.scope === "SCOPE_2" || a.scope === "2");
    const scope3Activities = activities.filter(a => a.scope === "SCOPE_3" || a.scope === "3");

    const scope1Total = scope1Activities.reduce((sum, a) => sum + Number(a.emissionsKg || 0), 0);
    const scope2Total = scope2Activities.reduce((sum, a) => sum + Number(a.emissionsKg || 0), 0);
    const scope3Total = scope3Activities.reduce((sum, a) => sum + Number(a.emissionsKg || 0), 0);
    const totalEmissionsKg = scope1Total + scope2Total + scope3Total;

    // Group by category
    const categoryMap = new Map<string, { tonnesCO2e: number; scope: string; trend: number }>();
    for (const a of activities) {
      const key = a.category;
      const existing = categoryMap.get(key) || { tonnesCO2e: 0, scope: a.scope, trend: 0 };
      existing.tonnesCO2e += Number(a.emissionsKg || 0) / 1000;
      categoryMap.set(key, existing);
    }

    const categories = Array.from(categoryMap.entries()).map(([category, data]) => ({
      category,
      scope: data.scope,
      tonnesCO2e: data.tonnesCO2e,
      trend: data.trend,
    }));

    // Monthly trends (group by month)
    const monthlyMap = new Map<string, { totalKg: number; scope1Kg: number; scope2Kg: number; scope3Kg: number }>();
    for (const a of activities) {
      const date = new Date(a.createdAt);
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      const existing = monthlyMap.get(monthKey) || { totalKg: 0, scope1Kg: 0, scope2Kg: 0, scope3Kg: 0 };
      const emissions = Number(a.emissionsKg || 0);
      existing.totalKg += emissions;
      if (a.scope === "SCOPE_1" || a.scope === "1") existing.scope1Kg += emissions;
      else if (a.scope === "SCOPE_2" || a.scope === "2") existing.scope2Kg += emissions;
      else existing.scope3Kg += emissions;
      monthlyMap.set(monthKey, existing);
    }

    const trends = Array.from(monthlyMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, data]) => ({
        month,
        totalKg: data.totalKg,
        scope1Kg: data.scope1Kg,
        scope2Kg: data.scope2Kg,
        scope3Kg: data.scope3Kg,
      }));

    // Activity stats
    const activityStats = {
      total: activities.length,
      draft: activities.filter(a => a.status === "draft").length,
      submitted: activities.filter(a => a.status === "SUBMITTED").length,
      underReview: activities.filter(a => a.status === "UNDER_REVIEW").length,
      verified: activities.filter(a => a.status === "VERIFIED").length,
      rejected: activities.filter(a => a.status === "REJECTED").length,
      calculated: activities.filter(a => a.status === "CALCULATED").length,
      pending: activities.filter(a => a.status === "PENDING").length,
      verifiedTotal: activities.filter(a => a.status === "VERIFIED").length,
    };

    // Recent activity
    const recentActivity = activities
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 10)
      .map(a => ({
        id: a.id,
        category: a.category,
        scope: a.scope,
        value: a.value,
        unit: a.unit,
        emissionsKg: a.emissionsKg,
        status: a.status,
        createdAt: a.createdAt,
      }));

    // Footprint groups (for frontend)
    const groups = [
      { key: "travel", name: "Business Travel", value: 0, icon: "airplane" },
      { key: "commute", name: "Employee Commute", value: 0, icon: "users" },
      { key: "energy", name: "Building Energy", value: 0, icon: "building" },
      { key: "procurement", name: "Procurement", value: 0, icon: "truck" },
      { key: "waste", name: "Waste", value: 0, icon: "factory" },
    ];

    // Get targets
    const targetRecords = await db.select().from(targets).where(eq(targets.tenantId, tenantId)).limit(10);

    return res.json({
      success: true,
      data: {
        overview: {
          totalEmissionsTonnes: (totalEmissionsKg / 1000).toFixed(2),
          scope1Tonnes: (scope1Total / 1000).toFixed(2),
          scope2Tonnes: (scope2Total / 1000).toFixed(2),
          scope3Tonnes: (scope3Total / 1000).toFixed(2),
          delta: 0,
          reductionPercentage: 0,
        },
        trends,
        categories,
        groups,
        scopeBreakdown: {
          scope1: { delta: 0 },
          scope2: { delta: 0 },
        },
        intensity: {
          tonnesPerStudent: 0,
          kgPerSqm: 0,
        },
        recentActivity,
        activityStats,
        targets: targetRecords.map(t => ({
          id: t.id,
          name: t.name,
          targetYear: t.targetYear,
          reductionPercentage: t.reductionPercentage,
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