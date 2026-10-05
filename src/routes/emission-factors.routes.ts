import { Router } from "express";
import { db } from "../db.js";
import { emissionFactors } from "../controllers/db/schema.js";
import { eq, and, desc } from "drizzle-orm";
import { authMiddleware } from "../middleware/auth.middleware.js";

const router = Router();

router.get("/", authMiddleware, async (req: any, res) => {
  try {
    const tenantId = req.user?.tenantId;
    if (!tenantId) return res.status(400).json({ success: false, message: "Tenant context missing" });

    const list = await db
      .select()
      .from(emissionFactors)
      .where(eq(emissionFactors.tenantId, tenantId))
      .orderBy(desc(emissionFactors.createdAt));

    return res.json({
      success: true,
      data: list.map(f => ({
        id: f.id,
        category: f.category,
        scope: f.scope,
        factor: f.factor,
        unit: f.unit,
        source: f.source,
        region: f.region,
        year: f.year,
        isApproved: f.isApproved,
        metadata: f.metadata,
      })),
    });
  } catch (error: any) {
    console.error("Get emission factors failed:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

router.post("/", authMiddleware, async (req: any, res) => {
  try {
    const tenantId = req.user?.tenantId;
    if (!tenantId) return res.status(400).json({ success: false, message: "Tenant context missing" });

    const { category, scope, factor, unit, source, region, year, isApproved, metadata } = req.body;
    if (!category || !scope || !factor || !unit) return res.status(400).json({ success: false, message: "category, scope, factor, unit required" });

    const [ef] = await db.insert(emissionFactors).values({ tenantId, category, scope, factor: factor.toString(), unit, source, region, year, isApproved: isApproved || false, metadata }).returning();
    return res.status(201).json({ success: true, data: ef });
  } catch (error: any) {
    console.error("Create emission factor failed:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

router.patch("/:id", authMiddleware, async (req: any, res) => {
  try {
    const tenantId = req.user?.tenantId;
    if (!tenantId) return res.status(400).json({ success: false, message: "Tenant context missing" });

    const [ef] = await db.update(emissionFactors).set({ ...req.body, updatedAt: new Date() }).where(and(eq(emissionFactors.id, Number(req.params.id)), eq(emissionFactors.tenantId, tenantId))).returning();
    if (!ef) return res.status(404).json({ success: false, message: "Emission factor not found" });
    return res.json({ success: true, data: ef });
  } catch (error: any) {
    console.error("Update emission factor failed:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

router.delete("/:id", authMiddleware, async (req: any, res) => {
  try {
    const tenantId = req.user?.tenantId;
    if (!tenantId) return res.status(400).json({ success: false, message: "Tenant context missing" });

    await db.delete(emissionFactors).where(and(eq(emissionFactors.id, Number(req.params.id)), eq(emissionFactors.tenantId, tenantId)));
    return res.json({ success: true });
  } catch (error: any) {
    console.error("Delete emission factor failed:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

export default router;