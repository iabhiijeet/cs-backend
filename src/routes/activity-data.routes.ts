import { Router } from "express";
import { db } from "../db.js";
import { activityData, reportingPeriods, campuses, buildings, floors } from "../controllers/db/schema.js";
import { eq, and, desc, count } from "drizzle-orm";
import { authMiddleware } from "../middleware/auth.middleware.js";

const router = Router();

router.get("/", authMiddleware, async (req: any, res) => {
  try {
    const tenantId = req.user?.tenantId;
    const { reportingPeriodId, campusId, buildingId, floorId, status, page = "1", limit = "50" } = req.query;

    if (!tenantId) {
      return res.status(400).json({ success: false, message: "Tenant context missing" });
    }

    // Determine reporting period
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
      return res.json({ success: true, data: [] });
    }

    const conditions = [eq(activityData.tenantId, tenantId), eq(activityData.reportingPeriodId, periodId)];
    if (campusId) conditions.push(eq(activityData.campusId, Number(campusId)));
    if (buildingId) conditions.push(eq(activityData.buildingId, Number(buildingId)));
    if (floorId) conditions.push(eq(activityData.floorId, Number(floorId)));
    if (status) conditions.push(eq(activityData.status, status));

    const pageNum = Math.max(1, Number(page));
    const limitNum = Math.min(100, Math.max(1, Number(limit)));
    const offset = (pageNum - 1) * limitNum;

    const [records, totalResult] = await Promise.all([
      db
        .select()
        .from(activityData)
        .where(and(...conditions))
        .orderBy(desc(activityData.createdAt))
        .limit(limitNum)
        .offset(offset),
      db.select({ count: count() }).from(activityData).where(and(...conditions)),
    ]);

    const total = totalResult[0]?.count || 0;

    return res.json({
      success: true,
      data: records.map(a => ({
        id: a.id,
        category: a.category,
        scope: a.scope,
        value: a.value,
        unit: a.unit,
        emissionFactor: a.emissionFactor,
        emissionsKg: a.emissionsKg,
        status: a.status,
        metadata: a.metadata,
        campusId: a.campusId,
        buildingId: a.buildingId,
        floorId: a.floorId,
        createdAt: a.createdAt,
        updatedAt: a.updatedAt,
      })),
      pagination: { page: pageNum, limit: limitNum, total, totalPages: Math.ceil(total / limitNum) },
    });
  } catch (error: any) {
    console.error("Get activity data failed:", error);
    return res.status(500).json({ success: false, message: error.message || "Failed to fetch activity data." });
  }
});

router.post("/", authMiddleware, async (req: any, res) => {
  try {
    const tenantId = req.user?.tenantId;
    if (!tenantId) {
      return res.status(400).json({ success: false, message: "Tenant context missing" });
    }

    const { reportingPeriodId, campusId, buildingId, floorId, category, scope, value, unit, emissionFactor, emissionsKg, status, metadata } = req.body;

    if (!reportingPeriodId || !category || !scope || !value || !unit) {
      return res.status(400).json({ success: false, message: "reportingPeriodId, category, scope, value, unit required" });
    }

    const [record] = await db
      .insert(activityData)
      .values({
        tenantId,
        reportingPeriodId: Number(reportingPeriodId),
        campusId: campusId ? Number(campusId) : null,
        buildingId: buildingId ? Number(buildingId) : null,
        floorId: floorId ? Number(floorId) : null,
        category,
        scope,
        value: value.toString(),
        unit,
        emissionFactor: emissionFactor ? emissionFactor.toString() : null,
        emissionsKg: emissionsKg ? emissionsKg.toString() : null,
        status: status || "draft",
        metadata: metadata || {},
      })
      .returning();

    return res.status(201).json({ success: true, data: record });
  } catch (error: any) {
    console.error("Create activity data failed:", error);
    return res.status(500).json({ success: false, message: error.message || "Failed to create activity data." });
  }
});

router.patch("/:id", authMiddleware, async (req: any, res) => {
  try {
    const tenantId = req.user?.tenantId;
    if (!tenantId) {
      return res.status(400).json({ success: false, message: "Tenant context missing" });
    }

    const updateData = req.body;
    const [record] = await db
      .update(activityData)
      .set({ ...updateData, updatedAt: new Date() })
      .where(and(eq(activityData.id, Number(req.params.id)), eq(activityData.tenantId, tenantId)))
      .returning();

    if (!record) {
      return res.status(404).json({ success: false, message: "Activity data not found" });
    }

    return res.json({ success: true, data: record });
  } catch (error: any) {
    console.error("Update activity data failed:", error);
    return res.status(500).json({ success: false, message: error.message || "Failed to update activity data." });
  }
});

router.delete("/:id", authMiddleware, async (req: any, res) => {
  try {
    const tenantId = req.user?.tenantId;
    if (!tenantId) {
      return res.status(400).json({ success: false, message: "Tenant context missing" });
    }

    await db
      .delete(activityData)
      .where(and(eq(activityData.id, Number(req.params.id)), eq(activityData.tenantId, tenantId)));

    return res.json({ success: true });
  } catch (error: any) {
    console.error("Delete activity data failed:", error);
    return res.status(500).json({ success: false, message: error.message || "Failed to delete activity data." });
  }
});

router.get("/review", authMiddleware, async (req: any, res) => {
  try {
    const tenantId = req.user?.tenantId;
    const { reportingPeriodId, universityId } = req.query;

    if (!tenantId) {
      return res.status(400).json({ success: false, message: "Tenant context missing" });
    }

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
      return res.json({ success: true, data: [] });
    }

    const conditions = [
      eq(activityData.tenantId, tenantId),
      eq(activityData.reportingPeriodId, periodId),
      eq(activityData.status, "SUBMITTED"),
    ];

    const records = await db
      .select()
      .from(activityData)
      .where(and(...conditions))
      .orderBy(desc(activityData.createdAt));

    return res.json({
      success: true,
      data: records.map(a => ({
        id: a.id,
        category: a.category,
        scope: a.scope,
        value: a.value,
        unit: a.unit,
        emissionFactor: a.emissionFactor,
        emissionsKg: a.emissionsKg,
        status: a.status,
        metadata: a.metadata,
        campusId: a.campusId,
        buildingId: a.buildingId,
        floorId: a.floorId,
        createdAt: a.createdAt,
        updatedAt: a.updatedAt,
      })),
    });
  } catch (error: any) {
    console.error("Get review activity data failed:", error);
    return res.status(500).json({ success: false, message: error.message || "Failed to fetch review data." });
  }
});

export default router;