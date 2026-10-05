import { Router } from "express";
import crypto from "crypto";
import { db } from "../db.js";
import { onboarding, users } from "../controllers/db/schema.js";
import { eq } from "drizzle-orm";

const router = Router();

router.get("/", async (req: any, res) => {
  try {
    const tenantId = req.user?.tenantId;
    if (!tenantId) {
      return res.status(404).json({ success: false, message: "Onboarding not found" });
    }

    const [record] = await db
      .select()
      .from(onboarding)
      .where(eq(onboarding.tenantId, tenantId))
      .limit(1);

    if (!record) {
      return res.status(404).json({ success: false, message: "Onboarding not found" });
    }

    return res.json({
      success: true,
      data: {
        id: String(record.id),
        organisationId: record.tenantId,
        ...record.data,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
      },
    });
  } catch (error: any) {
    console.error("Get onboarding failed:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch onboarding.",
    });
  }
});

router.post("/", async (req: any, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(400).json({
        success: false,
        message: "User context is missing.",
      });
    }

    const payload = req.body;

    const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    let tenantId = user.tenantId;
    if (!tenantId) {
      tenantId = `tenant_${crypto.randomBytes(12).toString("hex")}`;
      await db.update(users).set({ tenantId }).where(eq(users.id, userId));
    }

    const [existing] = await db
      .select()
      .from(onboarding)
      .where(eq(onboarding.tenantId, tenantId))
      .limit(1);

    if (existing) {
      return res.status(409).json({ success: false, message: "Onboarding already exists" });
    }

    const [record] = await db
      .insert(onboarding)
      .values({
        tenantId,
        data: payload,
      })
      .returning();

    return res.status(201).json({
      success: true,
      data: {
        id: String(record.id),
        organisationId: record.tenantId,
        ...record.data,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
      },
    });
  } catch (error: any) {
    console.error("Create onboarding failed:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to save onboarding.",
    });
  }
});

router.put("/", async (req: any, res) => {
  try {
    const tenantId = req.user?.tenantId;
    if (!tenantId) {
      return res.status(400).json({
        success: false,
        message: "User tenant context is missing.",
      });
    }

    const payload = req.body;

    const [record] = await db
      .update(onboarding)
      .set({ data: payload, updatedAt: new Date() })
      .where(eq(onboarding.tenantId, tenantId))
      .returning();

    if (!record) {
      return res.status(404).json({ success: false, message: "Onboarding not found" });
    }

    return res.json({
      success: true,
      data: {
        id: String(record.id),
        organisationId: record.tenantId,
        ...record.data,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
      },
    });
  } catch (error: any) {
    console.error("Update onboarding failed:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to update onboarding.",
    });
  }
});

export default router;
