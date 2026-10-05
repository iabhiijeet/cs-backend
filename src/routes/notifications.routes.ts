import { Router } from "express";
import { db } from "../db.js";
import { notifications, users } from "../controllers/db/schema.js";
import { eq, and, desc, count } from "drizzle-orm";
import { authMiddleware } from "../middleware/auth.middleware.js";

const router = Router();

router.get("/", authMiddleware, async (req: any, res) => {
  try {
    const tenantId = req.user?.tenantId;
    const userId = req.user?.id;
    const { isRead, type, page = "1", limit = "50" } = req.query;

    if (!tenantId) return res.status(400).json({ success: false, message: "Tenant context missing" });

    const conditions = [eq(notifications.tenantId, tenantId)];
    if (userId) conditions.push(eq(notifications.userId, userId));
    if (isRead !== undefined) conditions.push(eq(notifications.isRead, isRead === "true"));
    if (type) conditions.push(eq(notifications.type, type));

    const pageNum = Math.max(1, Number(page));
    const limitNum = Math.min(100, Math.max(1, Number(limit)));
    const offset = (pageNum - 1) * limitNum;

    const [records, totalResult] = await Promise.all([
      db.select().from(notifications).where(and(...conditions)).orderBy(desc(notifications.createdAt)).limit(limitNum).offset(offset),
      db.select({ count: count() }).from(notifications).where(and(...conditions)),
    ]);

    const total = totalResult[0]?.count || 0;

    return res.json({
      success: true,
      data: records.map(n => ({
        id: n.id,
        type: n.type,
        title: n.title,
        message: n.message,
        isRead: n.isRead,
        metadata: n.metadata,
        createdAt: n.createdAt,
      })),
      pagination: { page: pageNum, limit: limitNum, total, totalPages: Math.ceil(total / limitNum) },
    });
  } catch (error: any) {
    console.error("Get notifications failed:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

router.get("/unread-count", authMiddleware, async (req: any, res) => {
  try {
    const tenantId = req.user?.tenantId;
    const userId = req.user?.id;
    if (!tenantId) return res.status(400).json({ success: false, message: "Tenant context missing" });

    const conditions = [eq(notifications.tenantId, tenantId), eq(notifications.isRead, false)];
    if (userId) conditions.push(eq(notifications.userId, userId));

    const [result] = await db.select({ count: count() }).from(notifications).where(and(...conditions));
    return res.json({ success: true, data: { count: result.count } });
  } catch (error: any) {
    console.error("Get unread count failed:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

router.post("/", authMiddleware, async (req: any, res) => {
  try {
    const tenantId = req.user?.tenantId;
    const userId = req.user?.id;
    if (!tenantId) return res.status(400).json({ success: false, message: "Tenant context missing" });

    const { type, title, message, userId: targetUserId, metadata } = req.body;
    if (!type || !title) return res.status(400).json({ success: false, message: "type, title required" });

    const [notification] = await db
      .insert(notifications)
      .values({
        tenantId,
        userId: targetUserId || userId,
        type,
        title,
        message,
        metadata,
      })
      .returning();

    return res.status(201).json({ success: true, data: notification });
  } catch (error: any) {
    console.error("Create notification failed:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

router.patch("/:id/read", authMiddleware, async (req: any, res) => {
  try {
    const tenantId = req.user?.tenantId;
    if (!tenantId) return res.status(400).json({ success: false, message: "Tenant context missing" });

    await db.update(notifications).set({ isRead: true }).where(and(eq(notifications.id, Number(req.params.id)), eq(notifications.tenantId, tenantId)));
    return res.json({ success: true });
  } catch (error: any) {
    console.error("Mark notification read failed:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

router.patch("/read-all", authMiddleware, async (req: any, res) => {
  try {
    const tenantId = req.user?.tenantId;
    const userId = req.user?.id;
    if (!tenantId) return res.status(400).json({ success: false, message: "Tenant context missing" });

    const conditions = [eq(notifications.tenantId, tenantId), eq(notifications.isRead, false)];
    if (userId) conditions.push(eq(notifications.userId, userId));

    await db.update(notifications).set({ isRead: true }).where(and(...conditions));
    return res.json({ success: true });
  } catch (error: any) {
    console.error("Mark all read failed:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

export default router;