import { Router } from "express";
import { db } from "../db.js";
import { campuses, buildings, floors } from "../controllers/db/schema.js";
import { eq, and, desc } from "drizzle-orm";
import { authMiddleware } from "../middleware/auth.middleware.js";

const router = Router();

// Campuses
router.get("/campuses", authMiddleware, async (req: any, res) => {
  try {
    const tenantId = req.user?.tenantId;
    if (!tenantId) return res.status(400).json({ success: false, message: "Tenant context missing" });

    const list = await db.select().from(campuses).where(eq(campuses.tenantId, tenantId)).orderBy(desc(campuses.createdAt));
    return res.json({ success: true, data: list });
  } catch (error: any) {
    console.error("Get campuses failed:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

router.post("/campuses", authMiddleware, async (req: any, res) => {
  try {
    const tenantId = req.user?.tenantId;
    if (!tenantId) return res.status(400).json({ success: false, message: "Tenant context missing" });

    const { name, code, city, region, country, metadata } = req.body;
    if (!name) return res.status(400).json({ success: false, message: "name required" });

    const [campus] = await db.insert(campuses).values({ tenantId, name, code, city, region, country, metadata }).returning();
    return res.status(201).json({ success: true, data: campus });
  } catch (error: any) {
    console.error("Create campus failed:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

router.patch("/campuses/:id", authMiddleware, async (req: any, res) => {
  try {
    const tenantId = req.user?.tenantId;
    if (!tenantId) return res.status(400).json({ success: false, message: "Tenant context missing" });

    const [campus] = await db.update(campuses).set({ ...req.body, updatedAt: new Date() }).where(and(eq(campuses.id, Number(req.params.id)), eq(campuses.tenantId, tenantId))).returning();
    if (!campus) return res.status(404).json({ success: false, message: "Campus not found" });
    return res.json({ success: true, data: campus });
  } catch (error: any) {
    console.error("Update campus failed:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

router.delete("/campuses/:id", authMiddleware, async (req: any, res) => {
  try {
    const tenantId = req.user?.tenantId;
    if (!tenantId) return res.status(400).json({ success: false, message: "Tenant context missing" });

    await db.delete(campuses).where(and(eq(campuses.id, Number(req.params.id)), eq(campuses.tenantId, tenantId)));
    return res.json({ success: true });
  } catch (error: any) {
    console.error("Delete campus failed:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

// Buildings
router.get("/buildings", authMiddleware, async (req: any, res) => {
  try {
    const tenantId = req.user?.tenantId;
    const { campusId } = req.query;
    if (!tenantId) return res.status(400).json({ success: false, message: "Tenant context missing" });

    const conditions = [eq(buildings.tenantId, tenantId)];
    if (campusId) conditions.push(eq(buildings.campusId, Number(campusId)));

    const list = await db.select().from(buildings).where(and(...conditions)).orderBy(desc(buildings.createdAt));
    return res.json({ success: true, data: list });
  } catch (error: any) {
    console.error("Get buildings failed:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

router.post("/buildings", authMiddleware, async (req: any, res) => {
  try {
    const tenantId = req.user?.tenantId;
    if (!tenantId) return res.status(400).json({ success: false, message: "Tenant context missing" });

    const { name, code, buildingType, areaSqm, occupancy, metadata, campusId } = req.body;
    if (!name || !campusId) return res.status(400).json({ success: false, message: "name, campusId required" });

    const [building] = await db.insert(buildings).values({ tenantId, name, code, buildingType, areaSqm, occupancy, metadata, campusId: Number(campusId) }).returning();
    return res.status(201).json({ success: true, data: building });
  } catch (error: any) {
    console.error("Create building failed:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

router.patch("/buildings/:id", authMiddleware, async (req: any, res) => {
  try {
    const tenantId = req.user?.tenantId;
    if (!tenantId) return res.status(400).json({ success: false, message: "Tenant context missing" });

    const [building] = await db.update(buildings).set({ ...req.body, updatedAt: new Date() }).where(and(eq(buildings.id, Number(req.params.id)), eq(buildings.tenantId, tenantId))).returning();
    if (!building) return res.status(404).json({ success: false, message: "Building not found" });
    return res.json({ success: true, data: building });
  } catch (error: any) {
    console.error("Update building failed:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

router.delete("/buildings/:id", authMiddleware, async (req: any, res) => {
  try {
    const tenantId = req.user?.tenantId;
    if (!tenantId) return res.status(400).json({ success: false, message: "Tenant context missing" });

    await db.delete(buildings).where(and(eq(buildings.id, Number(req.params.id)), eq(buildings.tenantId, tenantId)));
    return res.json({ success: true });
  } catch (error: any) {
    console.error("Delete building failed:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

// Floors
router.get("/floors", authMiddleware, async (req: any, res) => {
  try {
    const tenantId = req.user?.tenantId;
    const { campusId, buildingId } = req.query;
    if (!tenantId) return res.status(400).json({ success: false, message: "Tenant context missing" });

    const conditions = [eq(floors.tenantId, tenantId)];
    if (campusId) conditions.push(eq(floors.campusId, Number(campusId)));
    if (buildingId) conditions.push(eq(floors.buildingId, Number(buildingId)));

    const list = await db.select().from(floors).where(and(...conditions)).orderBy(desc(floors.createdAt));
    return res.json({ success: true, data: list });
  } catch (error: any) {
    console.error("Get floors failed:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

router.post("/floors", authMiddleware, async (req: any, res) => {
  try {
    const tenantId = req.user?.tenantId;
    if (!tenantId) return res.status(400).json({ success: false, message: "Tenant context missing" });

    const { name, code, floorNumber, areaSqm, occupancy, metadata, campusId, buildingId } = req.body;
    if (!name || !campusId || !buildingId) return res.status(400).json({ success: false, message: "name, campusId, buildingId required" });

    const [floor] = await db.insert(floors).values({ tenantId, name, code, floorNumber, areaSqm, occupancy, metadata, campusId: Number(campusId), buildingId: Number(buildingId) }).returning();
    return res.status(201).json({ success: true, data: floor });
  } catch (error: any) {
    console.error("Create floor failed:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

router.patch("/floors/:id", authMiddleware, async (req: any, res) => {
  try {
    const tenantId = req.user?.tenantId;
    if (!tenantId) return res.status(400).json({ success: false, message: "Tenant context missing" });

    const [floor] = await db.update(floors).set({ ...req.body, updatedAt: new Date() }).where(and(eq(floors.id, Number(req.params.id)), eq(floors.tenantId, tenantId))).returning();
    if (!floor) return res.status(404).json({ success: false, message: "Floor not found" });
    return res.json({ success: true, data: floor });
  } catch (error: any) {
    console.error("Update floor failed:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

router.delete("/floors/:id", authMiddleware, async (req: any, res) => {
  try {
    const tenantId = req.user?.tenantId;
    if (!tenantId) return res.status(400).json({ success: false, message: "Tenant context missing" });

    await db.delete(floors).where(and(eq(floors.id, Number(req.params.id)), eq(floors.tenantId, tenantId)));
    return res.json({ success: true });
  } catch (error: any) {
    console.error("Delete floor failed:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

export default router;