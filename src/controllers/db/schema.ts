import { integer, pgTable, varchar, timestamp, jsonb } from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  email: varchar({ length: 255 }).notNull().unique(),
  passwordHash: varchar({ length: 255 }).notNull(),
  passwordSalt: varchar({ length: 255 }).notNull(),
  name: varchar({ length: 255 }).notNull(),
  role: varchar({ length: 50 }).notNull().default("user"),
  tenantId: varchar({ length: 255 }),
  createdAt: timestamp().defaultNow(),
});

export const sessions = pgTable("sessions", {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  userId: integer().notNull().references(() => users.id),
  token: varchar({ length: 255 }).notNull().unique(),
  expiresAt: timestamp().notNull(),
  createdAt: timestamp().defaultNow(),
});

export const onboarding = pgTable("onboarding", {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  tenantId: varchar({ length: 255 }).notNull().unique(),
  data: jsonb().notNull(),
  createdAt: timestamp().defaultNow(),
  updatedAt: timestamp().defaultNow(),
});
