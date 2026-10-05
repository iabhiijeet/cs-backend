import { Router } from "express";
import { db } from "../db.js";
import { targets } from "../controllers/db/schema.js";
import { eq, and, desc } from "drizzle-orm";
import { authMiddleware } from "../middleware/auth.middleware.js";

const router = Router();

router.get("/", authMiddleware, async (req: any, res) => {
  try {
    const tenantId = req.user?.tenantId;
    if (!tenantId) return res.status(400).json({ success: false, message: "Tenant context missing" });

    const list = await db.select().from(targets).where(eq(targets.tenantId, tenantId)).orderBy(desc(targets.createdAt));
    return res.json({
      success: true,
      data: list.map(t => ({
        id: t.id,
        name: t.name,
        description: t.description,
        targetYear: t.targetYear,
        baselineYear: t.baselineYear,
        reductionPercentage: t.reductionPercentage,
        scope: t.scope,
        status: t.status,
        metadata: t.metadata,
      })),
    });
  } catch (error: any) {
    console.error("Get targets failed:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

router.post("/", authMiddleware, async (req: any, res) => {
  try {
    const tenantId = req.user?.tenantId;
    if (!tenantId) return res.status(400).json({ success: false, message: "Tenant context missing" });

    const { name, description, targetYear, baselineYear, reductionPercentage, scope, status, metadata } = req.body;
    if (!name || !targetYear) return res.status(400).json({ success: false, message: "name, targetYear required" });

    const [target] = await db.insert(targets).values({ tenantId, name, description, targetYear, baselineYear, reductionPercentage, scope, status: status || "active", metadata }).returning();
    return res.status(201).json({ success: true, data: target });
  } catch (error: any) {
    console.error("Create target failed:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

router.patch("/:id", authMiddleware, async (req: any, res) => {
  try {
    const tenantId = req.user?.tenantId;
    if (!tenantId) return res.status(400).json({ success: false, message: "Tenant context missing" });

    const [target] = await db.update(targets).set({ ...req.body, updatedAt: new Date() }).where(and(eq(targets.id, Number(req.params.id)), eq(targets.tenantId, tenantId))).returning();
    if (!target) return res.status(404).json({ success: false, message: "Target not found" });
    return res.json({ success: true, data: target });
  } catch (error: any) {
    console.error("Update target failed:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

router.delete("/:id", authMiddleware, async (req: any, res) => {
  try {
    const tenantId = req.user?.tenantId;
    if (!tenantId) return res.status(400).json({ success: false, message: "Tenant context missing" });

    await db.delete(targets).where(and(eq(targets.id, Number(req.params.id)), eq(targets.tenantId, tenantId)));
    return res.json({ success: true });
  } catch (error: any) {
    console.error("Delete target failed:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

export default router;