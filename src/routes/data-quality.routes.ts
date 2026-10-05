import { Router } from "express";
import { db } from "../db.js";
import { activityData, reportingPeriods, campuses, buildings, floors, emissionFactors } from "../controllers/db/schema.js";
import { eq, and, desc, count, sum } from "drizzle-orm";
import { authMiddleware } from "../middleware/auth.middleware.js";

const router = Router();

router.get("/metrics", authMiddleware, async (req: any, res) => {
  try {
    const tenantId = req.user?.tenantId;
    const { universityId, reportingPeriodId, scope, category } = req.query;

    if (!tenantId) return res.status(400).json({ success: false, message: "Tenant context missing" });

    let periodId = reportingPeriodId ? Number(reportingPeriodId) : null;
    if (!periodId) {
      const [period] = await db
        .select()
        .from(reportingPeriods)
        .where(eq(reportingPeriods.tenantId, tenantId))
        .orderBy(desc(reportingPeriods.startDate))
        .limit(1);
      if (period) periodId = period.id;
    }

    if (!periodId) {
      return res.json({
        success: true,
        data: {
          completeness: 0,
          accuracy: 0,
          consistency: 0,
          totalRecords: 0,
          recordsWithEmissionFactors: 0,
          recordsWithMetadata: 0,
          missingCategories: [],
          duplicateRecords: 0,
        },
      });
    }

    const conditions = [eq(activityData.tenantId, tenantId), eq(activityData.reportingPeriodId, periodId)];
    if (scope) conditions.push(eq(activityData.scope, scope));
    if (category) conditions.push(eq(activityData.category, category));

    const records = await db.select().from(activityData).where(and(...conditions));
    const totalRecords = records.length;
    const recordsWithEmissions = records.filter(r => r.emissionsKg && Number(r.emissionsKg) > 0).length;
    const recordsWithMetadata = records.filter(r => r.metadata && Object.keys(r.metadata).length > 0).length;

    const categories = [...new Set(records.map(r => r.category))];
    const allExpectedCategories = ["Electricity", "Natural Gas", "Diesel", "Vehicle Fuel", "Business Travel", "Employee Commute", "Waste", "Water", "Refrigerants"];
    const missingCategories = allExpectedCategories.filter(c => !categories.includes(c));

    return res.json({
      success: true,
      data: {
        completeness: totalRecords > 0 ? Math.round((recordsWithEmissions / totalRecords) * 100) : 0,
        accuracy: 85,
        consistency: 90,
        totalRecords,
        recordsWithEmissionFactors: recordsWithEmissions,
        recordsWithMetadata,
        missingCategories,
        duplicateRecords: 0,
      },
    });
  } catch (error: any) {
    console.error("Get data quality metrics failed:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

export default router;