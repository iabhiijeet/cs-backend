import crypto from "crypto";
import db from "../src/db.js";
import { users, sessions, onboarding } from "../src/controllers/db/schema.js";

const SALT_LENGTH = 16;
const ITERATIONS = 100000;
const KEY_LENGTH = 64;

function hashPassword(password: string): { hash: string; salt: string } {
  const salt = crypto.randomBytes(SALT_LENGTH).toString("hex");
  const hash = crypto
    .pbkdf2Sync(password, salt, ITERATIONS, KEY_LENGTH, "sha512")
    .toString("hex");
  return { hash, salt };
}

async function seed() {
  const email = "admin@carbonsync.com";
  const password = "admin123";
  const name = "Admin User";
  const { hash, salt } = hashPassword(password);

  const [user] = await db
    .insert(users)
    .values({
      email,
      passwordHash: hash,
      passwordSalt: salt,
      name,
      role: "admin",
      tenantId: null,
    })
    .returning();

  console.log("Seeded user:", { id: user.id, email: user.email });

  const token = crypto.randomBytes(48).toString("hex");
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 30);

  await db.insert(sessions).values({
    userId: user.id,
    token,
    expiresAt,
  });

  console.log("Seeded session token:", token);

  process.exit(0);
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
