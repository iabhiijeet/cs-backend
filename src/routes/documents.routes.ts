import express from "express";
import { Router } from "express";
import { db } from "../db.js";
import { documents, activityData, reportingPeriods } from "../controllers/db/schema.js";
import { eq, and, desc, count } from "drizzle-orm";
import { authMiddleware } from "../middleware/auth.middleware.js";
import { uploadSingle } from "../middleware/upload.middleware.js";
import { processInvoiceEmissions } from "../services/InvoiceEmission.service.js";

const router = Router();

// GET /documents - list documents
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

// POST /documents/upload - V2 upload (raw body + X-Filename header)
router.post("/upload", express.raw({ type: "*/*", limit: "20mb" }), authMiddleware, async (req: any, res) => {
  try {
    const tenantId = req.user?.tenantId;
    if (!tenantId) return res.status(400).json({ success: false, message: "Tenant context missing" });

    console.log("[V2 Upload] req.body type:", typeof req.body);
    console.log("[V2 Upload] req.body length:", req.body?.length);
    console.log("[V2 Upload] headers x-filename:", req.headers["x-filename"]);

    const fileBuffer = req.body;
    if (!fileBuffer || fileBuffer.length === 0) {
      return res.status(400).json({ success: false, message: "No file data received" });
    }

    const encodedFilename = req.headers["x-filename"];
    if (!encodedFilename) {
      return res.status(400).json({ success: false, message: "X-Filename header required" });
    }
    const filename = decodeURIComponent(encodedFilename);
    
    const mimeType = req.headers["content-type"] || "application/octet-stream";
    const { reportingPeriodId, category } = req.query;

    const base64Data = Buffer.from(fileBuffer).toString("base64");
    const dataUrl = `data:${mimeType};base64,${base64Data}`;

    const [doc] = await db.insert(documents).values({
      tenantId,
      fileName: filename,
      originalName: filename,
      mimeType,
      size: fileBuffer.length,
      url: dataUrl,
      category: category || "INVOICE",
      reportingPeriodId: reportingPeriodId ? Number(reportingPeriodId) : null,
      metadata: {
        uploadedAt: new Date().toISOString(),
        fileData: base64Data,
      },
    }).returning();

    return res.status(201).json({ success: true, data: { id: doc.id, ...doc } });
  } catch (error: any) {
    console.error("Upload document V2 failed:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

// POST /documents/upload - V1 upload (multipart/form-data via multer)
router.post("/upload-multipart", authMiddleware, uploadSingle, async (req: any, res) => {
  try {
    const tenantId = req.user?.tenantId;
    if (!tenantId) return res.status(400).json({ success: false, message: "Tenant context missing" });

    const file = req.file;
    if (!file) return res.status(400).json({ success: false, message: "No file uploaded" });

    const { universityId, reportingPeriodId, category } = req.body;

    const fileBuffer = file.buffer;
    const base64Data = fileBuffer.toString("base64");
    const dataUrl = `data:${file.mimetype};base64,${base64Data}`;

    const [doc] = await db.insert(documents).values({
      tenantId,
      fileName: file.originalname,
      originalName: file.originalname,
      mimeType: file.mimetype,
      size: file.size,
      url: dataUrl,
      category: category || "INVOICE",
      reportingPeriodId: reportingPeriodId ? Number(reportingPeriodId) : null,
      metadata: {
        uploadedAt: new Date().toISOString(),
        fileData: base64Data,
      },
    }).returning();

    return res.status(201).json({ success: true, data: { id: doc.id, ...doc } });
  } catch (error: any) {
    console.error("Upload document failed:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

// POST /documents/:id/ocr - OCR extraction
router.post("/:id/ocr", authMiddleware, async (req: any, res) => {
  try {
    const tenantId = req.user?.tenantId;
    if (!tenantId) return res.status(400).json({ success: false, message: "Tenant context missing" });

    const [doc] = await db.select().from(documents).where(and(eq(documents.id, Number(req.params.id)), eq(documents.tenantId, tenantId))).limit(1);
    if (!doc) return res.status(404).json({ success: false, message: "Document not found" });

    const metadata = doc.metadata as any;
    const fileData = metadata?.fileData;
    if (!fileData) {
      return res.status(400).json({ success: false, message: "No file data available for OCR" });
    }

    let extractedText = "";
    if (doc.mimeType === "application/pdf") {
      extractedText = "[PDF content - OCR would extract text here]";
    } else if (doc.mimeType.startsWith("image/")) {
      extractedText = "[Image content - OCR would extract text here]";
    }

    const extraction = extractInvoiceData(extractedText, doc.mimeType);

    await db.update(documents)
      .set({ metadata: { ...metadata, extraction, ocrCompleted: true, ocrAt: new Date().toISOString() }, updatedAt: new Date() })
      .where(eq(documents.id, doc.id));

    return res.json({ success: true, data: { extraction, documentId: doc.id } });
  } catch (error: any) {
    console.error("OCR document failed:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

// POST /documents/:id/create-activity - Create activity from document with emission calculation
router.post("/:id/create-activity", authMiddleware, async (req: any, res) => {
  try {
    const tenantId = req.user?.tenantId;
    const userId = req.user?.id;
    if (!tenantId || !userId) return res.status(400).json({ success: false, message: "Context missing" });

    const { category, scope, quantity, unit, activityDate, description, inputSource, status, reportingPeriodId, region, country } = req.body;
    if (!category || !scope || !quantity || !unit || !reportingPeriodId) {
      return res.status(400).json({ success: false, message: "category, scope, quantity, unit, reportingPeriodId required" });
    }

    const [doc] = await db.select().from(documents).where(and(eq(documents.id, Number(req.params.id)), eq(documents.tenantId, tenantId))).limit(1);
    if (!doc) return res.status(404).json({ success: false, message: "Document not found" });

    const [period] = await db.select().from(reportingPeriods).where(eq(reportingPeriods.id, Number(reportingPeriodId))).limit(1);
    if (!period) return res.status(404).json({ success: false, message: "Reporting period not found" });

    // Determine region/country from request or defaults
    const emissionRegion = region || "IN";
    const emissionCountry = country || "India";

    // Call the emission calculation engine
    const emissionResult = await processInvoiceEmissions({
      region: emissionRegion,
      country_name: emissionCountry,
      invoice_text: "", // Could be enhanced with actual OCR text
      items: [{
        item_name: doc.originalName || "Invoice",
        category: category.toLowerCase().replace(/_/g, " "),
        value: Number(quantity),
        unit,
      }],
    });

    // The emissionResult is an object (not an array) with the overall result
    // The actual calculated items are in the 'results' property
    let emissionsKg = 0;
    let emissionFactor = null;
    let factorName = null;
    let factorUnit = null;
    let calculated = false;
    let itemResult = null;

    if (emissionResult && typeof emissionResult === 'object') {
      const overallResult = emissionResult;
      if (overallResult.results && overallResult.results.length > 0) {
        itemResult = overallResult.results[0];
        if (itemResult.status === "calculated") {
          calculated = true;
          emissionsKg = itemResult.co2e || 0;
          emissionFactor = itemResult.factor_value;
          factorName = itemResult.factor_name;
          factorUnit = itemResult.factor_unit;
        }
      }
    }

    // Create activity data entry with calculated emissions
    const [activity] = await db.insert(activityData).values({
      tenantId,
      reportingPeriodId: Number(reportingPeriodId),
      category,
      scope,
      value: quantity.toString(),
      unit,
      emissionFactor: emissionFactor ? emissionFactor.toString() : null,
      emissionsKg: calculated ? emissionsKg.toString() : null,
      status: status || "SUBMITTED",
      metadata: {
        source: inputSource || "INVOICE",
        documentId: doc.id,
        description,
        originalFileName: doc.originalName,
        // Store full emission calculation details
        emissionCalculation: {
          calculated,
          emissionsKg,
          emissionFactor,
          factorName,
          factorUnit,
          scope: itemResult?.scope || scope,
          sourceEngine: itemResult?.source_engine,
          preferredSource: itemResult?.preferred_source,
          total_tco2e: itemResult?.total_tco2e,
        },
      },
    }).returning();

    return res.status(201).json({ 
      success: true, 
      data: { 
        id: activity.id, 
        ...activity,
        // Include emission calculation in response
        emissionCalculation: {
          calculated,
          emissionsKg,
          emissionFactor,
          factorName,
          factorUnit,
          scope: itemResult?.scope || scope,
          sourceEngine: itemResult?.source_engine,
          preferredSource: itemResult?.preferred_source,
          total_tco2e: itemResult?.total_tco2e,
        }
      } 
    });
  } catch (error: any) {
    console.error("Create activity from document failed:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

// POST /documents - Create document manually (with URL)
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

// GET /documents/:id - Get single document
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

// DELETE /documents/:id - Delete document
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

function extractInvoiceData(text: string, mimeType: string): any {
  const result: any = {
    rawText: text,
    mimeType,
    extractedAt: new Date().toISOString(),
  };

  const amountMatch = text.match(/(\d+(?:,\d{3})*(?:\.\d+)?)\s*(kWh|kwh|litres?|liters?|m3|m³|kg|tonnes?|gallons?)/i);
  if (amountMatch) {
    result.quantity = parseFloat(amountMatch[1].replace(/,/g, ""));
    result.unit = amountMatch[2].toLowerCase();
  }

  const textLower = text.toLowerCase();
  if (textLower.includes("electric") || textLower.includes("power") || textLower.includes("kwh")) {
    result.category = "PURCHASED_ELECTRICITY";
    result.scope = "SCOPE_2";
  } else if (textLower.includes("diesel")) {
    result.category = "DIESEL";
    result.scope = "SCOPE_1";
  } else if (textLower.includes("petrol") || textLower.includes("gasoline")) {
    result.category = "PETROL";
    result.scope = "SCOPE_1";
  } else if (textLower.includes("natural gas") || textLower.includes("cng")) {
    result.category = "NATURAL_GAS";
    result.scope = "SCOPE_1";
  } else if (textLower.includes("lpg")) {
    result.category = "LPG";
    result.scope = "SCOPE_1";
  } else if (textLower.includes("steam")) {
    result.category = "PURCHASED_STEAM";
    result.scope = "SCOPE_2";
  }

  const vendorMatch = text.match(/(?:vendor|supplier|from)[:\s]+([^\n]+)/i);
  if (vendorMatch) result.vendor = vendorMatch[1].trim();

  const invoiceMatch = text.match(/(?:invoice|bill|receipt)[\s#:]+([A-Z0-9\-]+)/i);
  if (invoiceMatch) result.invoiceNumber = invoiceMatch[1].trim();

  const dateMatch = text.match(/(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})/);
  if (dateMatch) result.activityDate = dateMatch[1];

  return result;
}

export default router;