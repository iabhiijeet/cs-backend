import { Router } from "express";
import { db } from "../db.js";
import { recommendations } from "../controllers/db/schema.js";
import { eq, and, desc } from "drizzle-orm";
import { authMiddleware } from "../middleware/auth.middleware.js";

const router = Router();

router.get("/", authMiddleware, async (req: any, res) => {
  try {
    const tenantId = req.user?.tenantId;
    const { priority, category, status, page = "1", limit = "50" } = req.query;

    if (!tenantId) return res.status(400).json({ success: false, message: "Tenant context missing" });

    const conditions = [eq(recommendations.tenantId, tenantId)];
    if (priority) conditions.push(eq(recommendations.priority, priority));
    if (category) conditions.push(eq(recommendations.category, category));
    if (status) conditions.push(eq(recommendations.status, status));

    const pageNum = Math.max(1, Number(page));
    const limitNum = Math.min(100, Math.max(1, Number(limit)));
    const offset = (pageNum - 1) * limitNum;

    const [list, totalResult] = await Promise.all([
      db.select().from(recommendations).where(and(...conditions)).orderBy(desc(recommendations.createdAt)).limit(limitNum).offset(offset),
      db.select({ count: count() }).from(recommendations).where(and(...conditions)),
    ]);

    const total = totalResult[0]?.count || 0;

    return res.json({
      success: true,
      data: list.map(r => ({
        id: r.id,
        title: r.title,
        description: r.description,
        priority: r.priority,
        category: r.category,
        estimatedReduction: r.estimatedReduction,
        status: r.status,
        metadata: r.metadata,
        createdAt: r.createdAt,
      })),
      pagination: { page: pageNum, limit: limitNum, total, totalPages: Math.ceil(total / limitNum) },
    });
  } catch (error: any) {
    console.error("Get recommendations failed:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

router.post("/", authMiddleware, async (req: any, res) => {
  try {
    const tenantId = req.user?.tenantId;
    if (!tenantId) return res.status(400).json({ success: false, message: "Tenant context missing" });

    const { title, description, priority, category, estimatedReduction, status, metadata } = req.body;
    if (!title || !priority) return res.status(400).json({ success: false, message: "title, priority required" });

    const [rec] = await db.insert(recommendations).values({ tenantId, title, description, priority, category, estimatedReduction, status: status || "pending", metadata }).returning();
    return res.status(201).json({ success: true, data: rec });
  } catch (error: any) {
    console.error("Create recommendation failed:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

router.patch("/:id", authMiddleware, async (req: any, res) => {
  try {
    const tenantId = req.user?.tenantId;
    if (!tenantId) return res.status(400).json({ success: false, message: "Tenant context missing" });

    const [rec] = await db.update(recommendations).set({ ...req.body, updatedAt: new Date() }).where(and(eq(recommendations.id, Number(req.params.id)), eq(recommendations.tenantId, tenantId))).returning();
    if (!rec) return res.status(404).json({ success: false, message: "Recommendation not found" });
    return res.json({ success: true, data: rec });
  } catch (error: any) {
    console.error("Update recommendation failed:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

router.delete("/:id", authMiddleware, async (req: any, res) => {
  try {
    const tenantId = req.user?.tenantId;
    if (!tenantId) return res.status(400).json({ success: false, message: "Tenant context missing" });

    await db.delete(recommendations).where(and(eq(recommendations.id, Number(req.params.id)), eq(recommendations.tenantId, tenantId)));
    return res.json({ success: true });
  } catch (error: any) {
    console.error("Delete recommendation failed:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

import { count } from "drizzle-orm";

export default router;