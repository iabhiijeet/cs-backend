import { integer, pgTable, varchar, timestamp, jsonb, boolean, decimal, text } from "drizzle-orm/pg-core";

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

export const campuses = pgTable("campuses", {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  tenantId: varchar({ length: 255 }).notNull(),
  name: varchar({ length: 255 }).notNull(),
  code: varchar({ length: 50 }),
  city: varchar({ length: 255 }),
  region: varchar({ length: 255 }),
  country: varchar({ length: 255 }),
  metadata: jsonb(),
  createdAt: timestamp().defaultNow(),
  updatedAt: timestamp().defaultNow(),
});

export const buildings = pgTable("buildings", {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  tenantId: varchar({ length: 255 }).notNull(),
  campusId: integer().notNull().references(() => campuses.id),
  name: varchar({ length: 255 }).notNull(),
  code: varchar({ length: 50 }),
  buildingType: varchar({ length: 100 }),
  areaSqm: decimal({ precision: 10, scale: 2 }),
  occupancy: integer(),
  metadata: jsonb(),
  createdAt: timestamp().defaultNow(),
  updatedAt: timestamp().defaultNow(),
});

export const floors = pgTable("floors", {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  tenantId: varchar({ length: 255 }).notNull(),
  campusId: integer().notNull().references(() => campuses.id),
  buildingId: integer().notNull().references(() => buildings.id),
  name: varchar({ length: 255 }).notNull(),
  code: varchar({ length: 50 }),
  floorNumber: integer(),
  areaSqm: decimal({ precision: 10, scale: 2 }),
  occupancy: integer(),
  metadata: jsonb(),
  createdAt: timestamp().defaultNow(),
  updatedAt: timestamp().defaultNow(),
});

export const reportingPeriods = pgTable("reporting_periods", {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  tenantId: varchar({ length: 255 }).notNull(),
  name: varchar({ length: 255 }).notNull(),
  startDate: timestamp().notNull(),
  endDate: timestamp().notNull(),
  isLocked: boolean().default(false),
  createdAt: timestamp().defaultNow(),
  updatedAt: timestamp().defaultNow(),
});

export const activityData = pgTable("activity_data", {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  tenantId: varchar({ length: 255 }).notNull(),
  reportingPeriodId: integer().notNull().references(() => reportingPeriods.id),
  campusId: integer().references(() => campuses.id),
  buildingId: integer().references(() => buildings.id),
  floorId: integer().references(() => floors.id),
  category: varchar({ length: 255 }).notNull(),
  scope: varchar({ length: 50 }).notNull(),
  value: decimal({ precision: 15, scale: 4 }).notNull(),
  unit: varchar({ length: 50 }).notNull(),
  emissionFactor: decimal({ precision: 15, scale: 6 }),
  emissionsKg: decimal({ precision: 15, scale: 4 }),
  status: varchar({ length: 50 }).default("draft"),
  metadata: jsonb(),
  createdAt: timestamp().defaultNow(),
  updatedAt: timestamp().defaultNow(),
});

export const emissionFactors = pgTable("emission_factors", {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  tenantId: varchar({ length: 255 }),
  category: varchar({ length: 255 }).notNull(),
  scope: varchar({ length: 50 }).notNull(),
  factor: decimal({ precision: 15, scale: 6 }).notNull(),
  unit: varchar({ length: 50 }).notNull(),
  source: varchar({ length: 255 }),
  region: varchar({ length: 100 }),
  year: integer(),
  isApproved: boolean().default(false),
  metadata: jsonb(),
  createdAt: timestamp().defaultNow(),
  updatedAt: timestamp().defaultNow(),
});

export const targets = pgTable("targets", {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  tenantId: varchar({ length: 255 }).notNull(),
  name: varchar({ length: 255 }).notNull(),
  description: text(),
  targetYear: integer().notNull(),
  baselineYear: integer(),
  reductionPercentage: decimal({ precision: 5, scale: 2 }),
  scope: varchar({ length: 50 }),
  status: varchar({ length: 50 }).default("active"),
  metadata: jsonb(),
  createdAt: timestamp().defaultNow(),
  updatedAt: timestamp().defaultNow(),
});

export const notifications = pgTable("notifications", {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  tenantId: varchar({ length: 255 }).notNull(),
  userId: integer().references(() => users.id),
  type: varchar({ length: 100 }).notNull(),
  title: varchar({ length: 255 }).notNull(),
  message: text(),
  isRead: boolean().default(false),
  metadata: jsonb(),
  createdAt: timestamp().defaultNow(),
});

export const recommendations = pgTable("recommendations", {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  tenantId: varchar({ length: 255 }).notNull(),
  title: varchar({ length: 255 }).notNull(),
  description: text(),
  priority: varchar({ length: 50 }).notNull(),
  category: varchar({ length: 100 }),
  estimatedReduction: decimal({ precision: 10, scale: 2 }),
  status: varchar({ length: 50 }).default("pending"),
  metadata: jsonb(),
  createdAt: timestamp().defaultNow(),
  updatedAt: timestamp().defaultNow(),
});

export const documents = pgTable("documents", {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  tenantId: varchar({ length: 255 }).notNull(),
  fileName: varchar({ length: 255 }).notNull(),
  originalName: varchar({ length: 255 }),
  mimeType: varchar({ length: 100 }),
  size: integer(),
  url: text().notNull(),
  category: varchar({ length: 100 }),
  reportingPeriodId: integer().references(() => reportingPeriods.id),
  activityId: integer().references(() => activityData.id),
  metadata: jsonb(),
  createdAt: timestamp().defaultNow(),
  updatedAt: timestamp().defaultNow(),
});

export const baselines = pgTable("baselines", {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  tenantId: varchar({ length: 255 }).notNull(),
  name: varchar({ length: 255 }).notNull(),
  description: text(),
  reportingPeriodId: integer().notNull().references(() => reportingPeriods.id),
  totalEmissions: decimal({ precision: 15, scale: 4 }),
  scope1Emissions: decimal({ precision: 15, scale: 4 }),
  scope2Emissions: decimal({ precision: 15, scale: 4 }),
  scope3Emissions: decimal({ precision: 15, scale: 4 }),
  status: varchar({ length: 50 }).default("draft"),
  metadata: jsonb(),
  createdAt: timestamp().defaultNow(),
  updatedAt: timestamp().defaultNow(),
});
