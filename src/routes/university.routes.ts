import { Router } from "express";
import { db } from "../db.js";
import { onboarding, users } from "../controllers/db/schema.js";
import { eq } from "drizzle-orm";
import { authMiddleware } from "../middleware/auth.middleware.js";

const router = Router();

router.get("/:id", authMiddleware, async (req: any, res) => {
  try {
    const tenantId = req.user?.tenantId;
    if (!tenantId) {
      return res.status(404).json({ success: false, message: "Organization not found" });
    }

    const [record] = await db
      .select()
      .from(onboarding)
      .where(eq(onboarding.tenantId, tenantId))
      .limit(1);

    if (!record) {
      return res.status(404).json({ success: false, message: "Onboarding not found" });
    }

    const data = record.data as any;
    const orgName = data.university?.brandName || data.university?.legalName || data.company?.brandName || data.company?.legalName || "Organization";

    return res.json({
      success: true,
      data: {
        id: tenantId,
        name: orgName,
        ...data,
      },
    });
  } catch (error: any) {
    console.error("Get university failed:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch university.",
    });
  }
});

export default router;