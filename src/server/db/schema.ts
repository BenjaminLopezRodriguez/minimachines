import { index, pgTableCreator, uniqueIndex } from "drizzle-orm/pg-core";

/**
 * Multi-project schema feature of Drizzle ORM — lets the same database
 * instance be shared across multiple projects via a table name prefix.
 *
 * @see https://orm.drizzle.team/docs/goodies#multi-project-schema
 */
export const createTable = pgTableCreator((name) => `minimachines_${name}`);

export const waitlist = createTable(
  "waitlist",
  (d) => ({
    id: d.uuid().primaryKey().defaultRandom(),
    email: d.varchar({ length: 320 }).notNull(),
    createdAt: d
      .timestamp({ withTimezone: true })
      .$defaultFn(() => new Date())
      .notNull(),
  }),
  (t) => [uniqueIndex("waitlist_email_idx").on(t.email)],
);

/**
 * Dashboard API keys (`mm_…`). Only the sha256 hash is stored — the secret is
 * shown once at creation and is not recoverable.
 */
export const apiKeys = createTable(
  "api_key",
  (d) => ({
    id: d.varchar({ length: 64 }).primaryKey(),
    userId: d.varchar({ length: 128 }).notNull(),
    keyHash: d.varchar({ length: 64 }).notNull(),
    keyPrefix: d.varchar({ length: 16 }).notNull(),
    label: d.varchar({ length: 128 }).notNull(),
    createdAt: d
      .timestamp({ withTimezone: true })
      .$defaultFn(() => new Date())
      .notNull(),
    lastUsedAt: d.timestamp({ withTimezone: true }),
    revokedAt: d.timestamp({ withTimezone: true }),
  }),
  (t) => [
    // Verification looks a key up by hash on every authenticated API call.
    uniqueIndex("api_key_hash_idx").on(t.keyHash),
    index("api_key_user_idx").on(t.userId),
  ],
);

export const machines = createTable(
  "machine",
  (d) => ({
    id: d.varchar({ length: 64 }).primaryKey(),
    name: d.varchar({ length: 128 }).notNull(),
    title: d.varchar({ length: 200 }).notNull(),
    agent: d.varchar({ length: 64 }).notNull(),
    task: d.text().notNull(),
    status: d.varchar({ length: 16 }).notNull(),
    region: d.varchar({ length: 64 }).notNull(),
    cpu: d.integer().notNull(),
    memoryGb: d.integer().notNull(),
    // Display strings ("0m", "just now") kept as-is so the Machine contract
    // is unchanged; createdAt is what actually orders the fleet.
    uptime: d.varchar({ length: 64 }).notNull(),
    lastActive: d.varchar({ length: 64 }).notNull(),
    templateId: d.varchar({ length: 128 }),
    dockerfile: d.varchar({ length: 256 }),
    emulatorUrl: d.varchar({ length: 512 }),
    ownerUserId: d.varchar({ length: 128 }),
    createdAt: d
      .timestamp({ withTimezone: true })
      .$defaultFn(() => new Date())
      .notNull(),
  }),
  (t) => [index("machine_owner_idx").on(t.ownerUserId)],
);

export const execs = createTable(
  "exec",
  (d) => ({
    id: d.varchar({ length: 64 }).primaryKey(),
    machineId: d.varchar({ length: 64 }).notNull(),
    cmd: d.text().notNull(),
    cwd: d.varchar({ length: 512 }),
    exitCode: d.integer().notNull(),
    stdout: d.text().notNull(),
    stderr: d.text().notNull(),
    durationMs: d.integer().notNull(),
    createdAt: d
      .timestamp({ withTimezone: true })
      .$defaultFn(() => new Date())
      .notNull(),
  }),
  (t) => [index("exec_machine_idx").on(t.machineId)],
);

/** Files written into a machine's workspace. Content is base64 in `content`. */
export const machineFiles = createTable(
  "machine_file",
  (d) => ({
    machineId: d.varchar({ length: 64 }).notNull(),
    path: d.varchar({ length: 512 }).notNull(),
    content: d.text().notNull(),
    bytes: d.integer().notNull(),
    updatedAt: d
      .timestamp({ withTimezone: true })
      .$defaultFn(() => new Date())
      .notNull(),
  }),
  (t) => [
    // One row per (machine, path) — writes upsert onto this key.
    uniqueIndex("machine_file_key_idx").on(t.machineId, t.path),
  ],
);

export const jobs = createTable(
  "job",
  (d) => ({
    id: d.varchar({ length: 64 }).primaryKey(),
    machineId: d.varchar({ length: 64 }).notNull(),
    ownerUserId: d.varchar({ length: 128 }).notNull(),
    type: d.varchar({ length: 64 }).notNull(),
    status: d.varchar({ length: 16 }).notNull(),
    input: d.jsonb().notNull(),
    artifacts: d.jsonb().notNull(),
    createdAt: d
      .timestamp({ withTimezone: true })
      .$defaultFn(() => new Date())
      .notNull(),
    updatedAt: d
      .timestamp({ withTimezone: true })
      .$defaultFn(() => new Date())
      .notNull(),
  }),
  (t) => [index("job_owner_idx").on(t.ownerUserId)],
);
