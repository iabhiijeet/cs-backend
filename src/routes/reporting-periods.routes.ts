import { Router } from "express";
import { db } from "../db.js";
import { reportingPeriods, users } from "../controllers/db/schema.js";
import { eq, and, desc } from "drizzle-orm";
import { authMiddleware } from "../middleware/auth.middleware.js";

const router = Router();

router.get("/", authMiddleware, async (req: any, res) => {
  try {
    const tenantId = req.user?.tenantId;
    if (!tenantId) {
      return res.status(400).json({ success: false, message: "Tenant context missing" });
    }

    const periods = await db
      .select()
      .from(reportingPeriods)
      .where(eq(reportingPeriods.tenantId, tenantId))
      .orderBy(desc(reportingPeriods.startDate));

    return res.json({
      success: true,
      data: periods.map(p => ({
        id: p.id,
        name: p.name,
        startDate: p.startDate,
        endDate: p.endDate,
        isLocked: p.isLocked,
        createdAt: p.createdAt,
        updatedAt: p.updatedAt,
      })),
    });
  } catch (error: any) {
    console.error("Get reporting periods failed:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch reporting periods.",
    });
  }
});

router.post("/", authMiddleware, async (req: any, res) => {
  try {
    const tenantId = req.user?.tenantId;
    const userId = req.user?.id;
    if (!tenantId || !userId) {
      return res.status(400).json({ success: false, message: "Context missing" });
    }

    const { name, startDate, endDate } = req.body;
    if (!name || !startDate || !endDate) {
      return res.status(400).json({ success: false, message: "name, startDate, endDate required" });
    }

    const [period] = await db
      .insert(reportingPeriods)
      .values({
        tenantId,
        name,
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        isLocked: false,
      })
      .returning();

    return res.status(201).json({
      success: true,
      data: {
        id: period.id,
        name: period.name,
        startDate: period.startDate,
        endDate: period.endDate,
        isLocked: period.isLocked,
      },
    });
  } catch (error: any) {
    console.error("Create reporting period failed:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to create reporting period.",
    });
  }
});

router.post("/:id/open", authMiddleware, async (req: any, res) => {
  try {
    const tenantId = req.user?.tenantId;
    if (!tenantId) {
      return res.status(400).json({ success: false, message: "Tenant context missing" });
    }

    const [period] = await db
      .update(reportingPeriods)
      .set({ isLocked: false, updatedAt: new Date() })
      .where(and(eq(reportingPeriods.id, Number(req.params.id)), eq(reportingPeriods.tenantId, tenantId)))
      .returning();

    if (!period) {
      return res.status(404).json({ success: false, message: "Reporting period not found" });
    }

    return res.json({ success: true, data: period });
  } catch (error: any) {
    console.error("Open reporting period failed:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

router.post("/:id/lock", authMiddleware, async (req: any, res) => {
  try {
    const tenantId = req.user?.tenantId;
    if (!tenantId) {
      return res.status(400).json({ success: false, message: "Tenant context missing" });
    }

    const [period] = await db
      .update(reportingPeriods)
      .set({ isLocked: true, updatedAt: new Date() })
      .where(and(eq(reportingPeriods.id, Number(req.params.id)), eq(reportingPeriods.tenantId, tenantId)))
      .returning();

    if (!period) {
      return res.status(404).json({ success: false, message: "Reporting period not found" });
    }

    return res.json({ success: true, data: period });
  } catch (error: any) {
    console.error("Lock reporting period failed:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

export default router;