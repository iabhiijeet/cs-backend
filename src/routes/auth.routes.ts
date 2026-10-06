import { Router } from "express";
import crypto from "crypto";
import { db } from "../db.js";
import { users, sessions } from "../controllers/db/schema.js";
import { eq } from "drizzle-orm";

const router = Router();

const SALT_LENGTH = 16;
const ITERATIONS = 100000;
const KEY_LENGTH = 64;
const SESSION_DAYS = 30;

function hashPassword(password: string): { hash: string; salt: string } {
  const salt = crypto.randomBytes(SALT_LENGTH).toString("hex");
  const hash = crypto
    .pbkdf2Sync(password, salt, ITERATIONS, KEY_LENGTH, "sha512")
    .toString("hex");
  return { hash, salt };
}

function verifyPassword(password: string, salt: string, expectedHash: string): boolean {
  const hash = crypto
    .pbkdf2Sync(password, salt, ITERATIONS, KEY_LENGTH, "sha512")
    .toString("hex");
  return hash === expectedHash;
}

router.post("/login", async (req, res) => {
  try {
    const { tenantId, email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "Email and password are required.",
      });
    }

    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    if (!user || !verifyPassword(password, user.passwordSalt, user.passwordHash)) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password.",
      });
    }

    const token = crypto.randomBytes(48).toString("hex");
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + SESSION_DAYS);

    await db.insert(sessions).values({
      userId: user.id,
      token,
      expiresAt,
    });

    return res.json({
      success: true,
      data: {
        token,
        user: {
          id: String(user.id),
          tenantId: user.tenantId ?? null,
          organisationId: user.tenantId ?? null,
          name: user.name,
          email: user.email,
          role: user.role,
        },
      },
    });
  } catch (error: any) {
    console.error("Login failed:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Login failed.",
    });
  }
});

router.post("/logout", async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith("Bearer ")) {
      const token = authHeader.slice(7);
      await db.delete(sessions).where(eq(sessions.token, token));
    }
    return res.json({ success: true });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: error.message || "Logout failed.",
    });
  }
});

export default router;
