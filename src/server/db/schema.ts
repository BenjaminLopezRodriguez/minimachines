import { pgTableCreator, uniqueIndex } from "drizzle-orm/pg-core";

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
