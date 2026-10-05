import { Router } from "express";
import { db } from "../db.js";
import { documents } from "../controllers/db/schema.js";
import { eq, and, desc, count } from "drizzle-orm";
import { authMiddleware } from "../middleware/auth.middleware.js";

const router = Router();

router.get("/", authMiddleware, async (req: any, res) => {
  try {
    const tenantId = req.user?.tenantId;
    const { universityId, reportingPeriodId, activityId, page = "1", limit = "50" } = req.query;

    if (!tenantId) return res.status(400).json({ success: false, message: "Tenant context missing" });

    const conditions = [eq(documents.tenantId, tenantId)];
    if (reportingPeriodId) conditions.push(eq(documents.reportingPeriodId, Number(reportingPeriodId)));
    if (activityId) conditions.push(eq(documents.activityId, Number(activityId)));

    const pageNum = Math.max(1, Number(page));
    const limitNum = Math.min(100, Math.max(1, Number(limit)));
    const offset = (pageNum - 1) * limitNum;

    const [records, totalResult] = await Promise.all([
      db.select().from(documents).where(and(...conditions)).orderBy(desc(documents.createdAt)).limit(limitNum).offset(offset),
      db.select({ count: count() }).from(documents).where(and(...conditions)),
    ]);

    const total = totalResult[0]?.count || 0;

    return res.json({
      success: true,
      data: records.map(d => ({
        id: d.id,
        fileName: d.fileName,
        originalName: d.originalName,
        mimeType: d.mimeType,
        size: d.size,
        url: d.url,
        category: d.category,
        reportingPeriodId: d.reportingPeriodId,
        activityId: d.activityId,
        metadata: d.metadata,
        createdAt: d.createdAt,
        updatedAt: d.updatedAt,
      })),
      pagination: { page: pageNum, limit: limitNum, total, totalPages: Math.ceil(total / limitNum) },
    });
  } catch (error: any) {
    console.error("Get documents failed:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

router.post("/", authMiddleware, async (req: any, res) => {
  try {
    const tenantId = req.user?.tenantId;
    if (!tenantId) return res.status(400).json({ success: false, message: "Tenant context missing" });

    const { fileName, originalName, mimeType, size, url, category, reportingPeriodId, activityId, metadata } = req.body;
    if (!fileName || !url) return res.status(400).json({ success: false, message: "fileName, url required" });

    const [doc] = await db.insert(documents).values({ tenantId, fileName, originalName, mimeType, size, url, category, reportingPeriodId: reportingPeriodId ? Number(reportingPeriodId) : null, activityId: activityId ? Number(activityId) : null, metadata }).returning();
    return res.status(201).json({ success: true, data: doc });
  } catch (error: any) {
    console.error("Create document failed:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

router.get("/:id", authMiddleware, async (req: any, res) => {
  try {
    const tenantId = req.user?.tenantId;
    if (!tenantId) return res.status(400).json({ success: false, message: "Tenant context missing" });

    const [doc] = await db.select().from(documents).where(and(eq(documents.id, Number(req.params.id)), eq(documents.tenantId, tenantId))).limit(1);
    if (!doc) return res.status(404).json({ success: false, message: "Document not found" });

    return res.json({ success: true, data: doc });
  } catch (error: any) {
    console.error("Get document failed:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

router.delete("/:id", authMiddleware, async (req: any, res) => {
  try {
    const tenantId = req.user?.tenantId;
    if (!tenantId) return res.status(400).json({ success: false, message: "Tenant context missing" });

    await db.delete(documents).where(and(eq(documents.id, Number(req.params.id)), eq(documents.tenantId, tenantId)));
    return res.json({ success: true });
  } catch (error: any) {
    console.error("Delete document failed:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

router.post("/:id/ocr", authMiddleware, async (req: any, res) => {
  try {
    const tenantId = req.user?.tenantId;
    if (!tenantId) return res.status(400).json({ success: false, message: "Tenant context missing" });

    // OCR processing would go here
    return res.json({ success: true, data: { message: "OCR processing started" } });
  } catch (error: any) {
    console.error("OCR document failed:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

export default router;