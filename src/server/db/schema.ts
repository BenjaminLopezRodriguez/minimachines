import { sql } from "drizzle-orm";
import { index, pgTableCreator, primaryKey, uniqueIndex } from "drizzle-orm/pg-core";

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
 * Inbound requests from partners. `kind` distinguishes agent-builders who want
 * their agent on the platform from model providers who want to publish on the
 * model market. `subjectName` holds the agent or model name accordingly.
 */
export const partnerRequests = createTable("partner_request", (d) => ({
  id: d.uuid().primaryKey().defaultRandom(),
  kind: d.varchar({ length: 16 }).notNull().default("agent"),
  company: d.varchar({ length: 200 }).notNull(),
  email: d.varchar({ length: 320 }).notNull(),
  // Agent name (kind=agent) or model name (kind=model).
  agentName: d.varchar({ length: 200 }),
  note: d.text(),
  createdAt: d
    .timestamp({ withTimezone: true })
    .$defaultFn(() => new Date())
    .notNull(),
}));

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
    /** Public tunnel to the machine's app port (3000), when running. */
    appUrl: d.varchar({ length: 512 }),
    /** Modal sandbox backing this machine, when provisioned. */
    sandboxId: d.varchar({ length: 128 }),
    ownerUserId: d.varchar({ length: 128 }),
    /** Project this machine belongs to; members of it can reach the machine. */
    projectId: d.uuid(),
    /** Exposed port → public tunnel URL, captured at provision (for shares). */
    ports: d.jsonb(),
    createdAt: d
      .timestamp({ withTimezone: true })
      .$defaultFn(() => new Date())
      .notNull(),
  }),
  (t) => [
    index("machine_owner_idx").on(t.ownerUserId),
    index("machine_project_idx").on(t.projectId),
  ],
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

/**
 * Device-authorization codes (RFC 8628 style) for CLI/agent login. The raw
 * device code is never stored — only its sha256 hash. No secret is stored at
 * rest: the API key is minted at first approved poll and returned once.
 */
export const deviceCodes = createTable(
  "device_code",
  (d) => ({
    id: d.uuid().primaryKey().defaultRandom(),
    userCode: d.varchar({ length: 16 }).notNull(),
    deviceCodeHash: d.varchar({ length: 64 }).notNull(),
    approvedUserId: d.varchar({ length: 128 }),
    mintedKeyId: d.varchar({ length: 64 }),
    consumedAt: d.timestamp({ withTimezone: true }),
    deniedAt: d.timestamp({ withTimezone: true }),
    expiresAt: d.timestamp({ withTimezone: true }).notNull(),
    createdAt: d
      .timestamp({ withTimezone: true })
      .$defaultFn(() => new Date())
      .notNull(),
  }),
  (t) => [
    uniqueIndex("device_code_hash_idx").on(t.deviceCodeHash),
    uniqueIndex("device_code_user_idx").on(t.userCode),
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

/**
 * Agent Pager — one notification contact per machine owner. Pager stays inert
 * until a row exists here. v1 uses `email`; `phone`/SMS is deferred.
 */
export const pagerContacts = createTable("pager_contact", (d) => ({
  ownerUserId: d.varchar({ length: 128 }).primaryKey(),
  email: d.varchar({ length: 320 }),
  phone: d.varchar({ length: 32 }),
  emailVerifiedAt: d.timestamp({ withTimezone: true }),
  phoneVerifiedAt: d.timestamp({ withTimezone: true }),
  channels: d.varchar({ length: 16 }).notNull().default("email"),
  createdAt: d
    .timestamp({ withTimezone: true })
    .$defaultFn(() => new Date())
    .notNull(),
}));

/**
 * A page emitted by an in-sandbox agent (`question`/`finished`/`succeeded`).
 * The reply link carries a random token; only its sha256 is stored, and the
 * event is single-use (`consumedAt`) and expiring (`expiresAt`) — no replay.
 */
export const pagerEvents = createTable(
  "pager_event",
  (d) => ({
    id: d.uuid().primaryKey().defaultRandom(),
    machineId: d.varchar({ length: 64 }).notNull(),
    ownerUserId: d.varchar({ length: 128 }).notNull(),
    kind: d.varchar({ length: 16 }).notNull(),
    text: d.text().notNull(),
    tokenHash: d.varchar({ length: 64 }).notNull(),
    expiresAt: d.timestamp({ withTimezone: true }).notNull(),
    consumedAt: d.timestamp({ withTimezone: true }),
    createdAt: d
      .timestamp({ withTimezone: true })
      .$defaultFn(() => new Date())
      .notNull(),
  }),
  (t) => [uniqueIndex("pager_event_token_idx").on(t.tokenHash)],
);

/** Replies from the phone reply page, polled + drained by the agent. */
export const mailbox = createTable(
  "mailbox",
  (d) => ({
    id: d.uuid().primaryKey().defaultRandom(),
    machineId: d.varchar({ length: 64 }).notNull(),
    ownerUserId: d.varchar({ length: 128 }).notNull(),
    eventId: d.uuid(),
    body: d.text().notNull(),
    model: d.varchar({ length: 64 }),
    imageUrl: d.varchar({ length: 512 }),
    deliveredAt: d.timestamp({ withTimezone: true }),
    createdAt: d
      .timestamp({ withTimezone: true })
      .$defaultFn(() => new Date())
      .notNull(),
  }),
  (t) => [index("mailbox_poll_idx").on(t.machineId, t.deliveredAt)],
);

/**
 * A branded, shareable link (`<slug>.minimachin.es`) that proxies to a web
 * project's port. Origin is a minimachines machine port (tunnel resolved
 * server-side) or a validated local tunnel URL. Public or Basic-auth gated;
 * revoke = `enabled=false`. Gate secret is stored hash-only.
 */
export const shares = createTable(
  "share",
  (d) => ({
    slug: d.varchar({ length: 32 }).primaryKey(),
    ownerUserId: d.varchar({ length: 128 }).notNull(),
    originKind: d.varchar({ length: 16 }).notNull(), // machine | local
    originUrl: d.text().notNull(),
    machineId: d.varchar({ length: 64 }),
    port: d.integer(),
    label: d.varchar({ length: 128 }).notNull().default(""),
    kind: d.varchar({ length: 16 }).notNull().default("website"), // api | website
    access: d.varchar({ length: 16 }).notNull().default("public"), // public | gated
    secretHash: d.varchar({ length: 64 }),
    enabled: d.boolean().notNull().default(true),
    createdAt: d
      .timestamp({ withTimezone: true })
      .$defaultFn(() => new Date())
      .notNull(),
    lastUsedAt: d.timestamp({ withTimezone: true }),
  }),
  (t) => [index("share_owner_idx").on(t.ownerUserId)],
);

/**
 * Web Push (VAPID) subscriptions for native pager notifications. `kind` is
 * `webpush` today; a future native iOS app registers `apns` device tokens
 * against the same table so the notify fan-out is unchanged.
 */
export const pushSubscriptions = createTable(
  "push_subscription",
  (d) => ({
    id: d.uuid().primaryKey().defaultRandom(),
    ownerUserId: d.varchar({ length: 128 }).notNull(),
    kind: d.varchar({ length: 16 }).notNull().default("webpush"),
    endpoint: d.text().notNull(),
    p256dh: d.varchar({ length: 256 }).notNull(),
    auth: d.varchar({ length: 128 }).notNull(),
    ua: d.varchar({ length: 256 }),
    createdAt: d
      .timestamp({ withTimezone: true })
      .$defaultFn(() => new Date())
      .notNull(),
  }),
  (t) => [
    uniqueIndex("push_endpoint_idx").on(t.endpoint),
    index("push_owner_idx").on(t.ownerUserId),
  ],
);

/** Bots is a separate conversation product; credentials stay on the selected machine. */
export const bots = createTable("bot", (d) => ({
  id: d.uuid().primaryKey().defaultRandom(),
  ownerUserId: d.varchar({ length: 128 }).notNull(),
  machineId: d.varchar({ length: 64 }).notNull(),
  name: d.varchar({ length: 80 }).notNull(),
  instructions: d.text().notNull(),
  provider: d.varchar({ length: 16 }).notNull(),
  createdAt: d.timestamp({ withTimezone: true }).defaultNow().notNull(),
  updatedAt: d.timestamp({ withTimezone: true }).defaultNow().notNull(),
}), (t) => [index("bot_owner_idx").on(t.ownerUserId)]);

export const botConversations = createTable("bot_conversation", (d) => ({
  id: d.uuid().primaryKey().defaultRandom(),
  botId: d.uuid().notNull().references(() => bots.id, { onDelete: "cascade" }),
  ownerUserId: d.varchar({ length: 128 }).notNull(),
  title: d.varchar({ length: 160 }).notNull().default("New conversation"),
  generationId: d.uuid(),
  generationStartedAt: d.timestamp({ withTimezone: true }),
  createdAt: d.timestamp({ withTimezone: true }).defaultNow().notNull(),
  updatedAt: d.timestamp({ withTimezone: true }).defaultNow().notNull(),
}), (t) => [index("bot_conversation_owner_idx").on(t.ownerUserId, t.botId)]);

export const botMessages = createTable("bot_message", (d) => ({
  id: d.uuid().primaryKey().defaultRandom(),
  conversationId: d.uuid().notNull().references(() => botConversations.id, { onDelete: "cascade" }),
  role: d.varchar({ length: 16 }).notNull(),
  content: d.text().notNull(),
  replyTo: d.uuid(),
  createdAt: d.timestamp({ withTimezone: true }).defaultNow().notNull(),
}), (t) => [index("bot_message_conversation_idx").on(t.conversationId, t.createdAt), uniqueIndex("bot_message_reply_idx").on(t.replyTo)]);

/**
 * A shared workspace: usually a git repo (`repoKey` = normalized origin, e.g.
 * `github.com/acme/app`), or a named project when there is no repo.
 */
export const projects = createTable(
  "project",
  (d) => ({
    id: d.uuid().primaryKey().defaultRandom(),
    ownerUserId: d.varchar({ length: 128 }).notNull(),
    name: d.varchar({ length: 128 }).notNull(),
    repoKey: d.varchar({ length: 256 }),
    createdAt: d
      .timestamp({ withTimezone: true })
      .$defaultFn(() => new Date())
      .notNull(),
  }),
  (t) => [
    uniqueIndex("project_owner_repo_idx").on(t.ownerUserId, t.repoKey),
    // Names repeat across repos (two repos called "app"); only repo-less projects are unique by name.
    uniqueIndex("project_owner_named_idx").on(t.ownerUserId, t.name).where(sql`"repoKey" IS NULL`),
  ],
);

/**
 * `principal` is a WorkOS user id, or `key:<apiKeyId>` for another machine's
 * agent added as a viewer. Roles: owner | member | viewer.
 */
export const projectMembers = createTable(
  "project_member",
  (d) => ({
    projectId: d.uuid().notNull(),
    principal: d.varchar({ length: 128 }).notNull(),
    role: d.varchar({ length: 16 }).notNull(),
    invitedBy: d.varchar({ length: 128 }),
    joinedAt: d
      .timestamp({ withTimezone: true })
      .$defaultFn(() => new Date())
      .notNull(),
  }),
  (t) => [
    primaryKey({ columns: [t.projectId, t.principal] }),
    index("project_member_principal_idx").on(t.principal),
  ],
);

/**
 * Invite link token and join code are stored as sha256 only. The code is
 * minted when the invitee asks for it on the join page and goes to `contact`,
 * so a forwarded link alone cannot be accepted.
 */
export const projectInvites = createTable(
  "project_invite",
  (d) => ({
    id: d.uuid().primaryKey().defaultRandom(),
    projectId: d.uuid().notNull(),
    tokenHash: d.varchar({ length: 64 }).notNull(),
    role: d.varchar({ length: 16 }).notNull(), // member | viewer
    channel: d.varchar({ length: 8 }).notNull(), // email | sms
    contact: d.varchar({ length: 320 }).notNull(),
    note: d.varchar({ length: 280 }),
    codeRequired: d.boolean().notNull().default(true),
    codeHash: d.varchar({ length: 64 }),
    codeExpiresAt: d.timestamp({ withTimezone: true }),
    codeTries: d.integer().notNull().default(0),
    /** Codes sent for this invite, and when the last went out — caps re-sends. */
    codesSent: d.integer().notNull().default(0),
    codeSentAt: d.timestamp({ withTimezone: true }),
    invitedBy: d.varchar({ length: 128 }).notNull(),
    expiresAt: d.timestamp({ withTimezone: true }).notNull(),
    acceptedAt: d.timestamp({ withTimezone: true }),
    acceptedBy: d.varchar({ length: 128 }),
    revokedAt: d.timestamp({ withTimezone: true }),
    createdAt: d
      .timestamp({ withTimezone: true })
      .$defaultFn(() => new Date())
      .notNull(),
  }),
  (t) => [
    uniqueIndex("project_invite_token_idx").on(t.tokenHash),
    index("project_invite_project_idx").on(t.projectId),
  ],
);
