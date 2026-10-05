import { Router } from "express";
import { db } from "../db.js";
import { baselines } from "../controllers/db/schema.js";
import { eq, and, desc } from "drizzle-orm";
import { authMiddleware } from "../middleware/auth.middleware.js";

const router = Router();

router.get("/", authMiddleware, async (req: any, res) => {
  try {
    const tenantId = req.user?.tenantId;
    const { universityId, reportingPeriodId, page = "1", limit = "50" } = req.query;

    if (!tenantId) return res.status(400).json({ success: false, message: "Tenant context missing" });

    const conditions = [eq(baselines.tenantId, tenantId)];
    if (reportingPeriodId) conditions.push(eq(baselines.reportingPeriodId, Number(reportingPeriodId)));

    const pageNum = Math.max(1, Number(page));
    const limitNum = Math.min(100, Math.max(1, Number(limit)));
    const offset = (pageNum - 1) * limitNum;

    const [records, totalResult] = await Promise.all([
      db.select().from(baselines).where(and(...conditions)).orderBy(desc(baselines.createdAt)).limit(limitNum).offset(offset),
      db.select({ count: count() }).from(baselines).where(and(...conditions)),
    ]);

    const total = totalResult[0]?.count || 0;

    return res.json({
      success: true,
      data: records.map(b => ({
        id: b.id,
        name: b.name,
        description: b.description,
        reportingPeriodId: b.reportingPeriodId,
        totalEmissions: b.totalEmissions,
        scope1Emissions: b.scope1Emissions,
        scope2Emissions: b.scope2Emissions,
        scope3Emissions: b.scope3Emissions,
        status: b.status,
        metadata: b.metadata,
        createdAt: b.createdAt,
        updatedAt: b.updatedAt,
      })),
      pagination: { page: pageNum, limit: limitNum, total, totalPages: Math.ceil(total / limitNum) },
    });
  } catch (error: any) {
    console.error("Get baselines failed:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

router.post("/", authMiddleware, async (req: any, res) => {
  try {
    const tenantId = req.user?.tenantId;
    if (!tenantId) return res.status(400).json({ success: false, message: "Tenant context missing" });

    const { name, description, reportingPeriodId, totalEmissions, scope1Emissions, scope2Emissions, scope3Emissions, status, metadata } = req.body;
    if (!name || !reportingPeriodId) return res.status(400).json({ success: false, message: "name, reportingPeriodId required" });

    const [baseline] = await db.insert(baselines).values({ tenantId, name, description, reportingPeriodId: Number(reportingPeriodId), totalEmissions, scope1Emissions, scope2Emissions, scope3Emissions, status: status || "draft", metadata }).returning();
    return res.status(201).json({ success: true, data: baseline });
  } catch (error: any) {
    console.error("Create baseline failed:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

router.patch("/:id", authMiddleware, async (req: any, res) => {
  try {
    const tenantId = req.user?.tenantId;
    if (!tenantId) return res.status(400).json({ success: false, message: "Tenant context missing" });

    const [baseline] = await db.update(baselines).set({ ...req.body, updatedAt: new Date() }).where(and(eq(baselines.id, Number(req.params.id)), eq(baselines.tenantId, tenantId))).returning();
    if (!baseline) return res.status(404).json({ success: false, message: "Baseline not found" });
    return res.json({ success: true, data: baseline });
  } catch (error: any) {
    console.error("Update baseline failed:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

router.delete("/:id", authMiddleware, async (req: any, res) => {
  try {
    const tenantId = req.user?.tenantId;
    if (!tenantId) return res.status(400).json({ success: false, message: "Tenant context missing" });

    await db.delete(baselines).where(and(eq(baselines.id, Number(req.params.id)), eq(baselines.tenantId, tenantId)));
    return res.json({ success: true });
  } catch (error: any) {
    console.error("Delete baseline failed:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

router.post("/:id/submit", authMiddleware, async (req: any, res) => {
  try {
    const tenantId = req.user?.tenantId;
    if (!tenantId) return res.status(400).json({ success: false, message: "Tenant context missing" });

    const [baseline] = await db.update(baselines).set({ status: "submitted", updatedAt: new Date() }).where(and(eq(baselines.id, Number(req.params.id)), eq(baselines.tenantId, tenantId))).returning();
    if (!baseline) return res.status(404).json({ success: false, message: "Baseline not found" });
    return res.json({ success: true, data: baseline });
  } catch (error: any) {
    console.error("Submit baseline failed:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

import { count } from "drizzle-orm";

export default router;