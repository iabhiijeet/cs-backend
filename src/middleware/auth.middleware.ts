import { db } from "../db.js";
import { sessions, users } from "../controllers/db/schema.js";
import { eq } from "drizzle-orm";

export async function authMiddleware(req: any, res: any, next: any) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    return res.status(401).json({ success: false, message: "Unauthorized" });
  }

  const token = authHeader.slice(7);
  const [session] = await db
    .select()
    .from(sessions)
    .where(eq(sessions.token, token))
    .limit(1);

  if (!session || session.expiresAt < new Date()) {
    return res.status(401).json({ success: false, message: "Invalid or expired token" });
  }

  const [user] = await db.select().from(users).where(eq(users.id, session.userId)).limit(1);
  if (!user) {
    return res.status(401).json({ success: false, message: "User not found" });
  }

  req.user = user;
  next();
}
