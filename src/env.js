import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
  /**
   * Specify your server-side environment variables schema here. This way you can ensure the app
   * isn't built with invalid env vars.
   */
  server: {
    DATABASE_URL: z.string().url(),
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
    WORKOS_API_KEY: z.string().startsWith("sk_"),
    WORKOS_CLIENT_ID: z.string().startsWith("client_"),
    // Used to encrypt the session cookie — must be at least 32 characters.
    WORKOS_COOKIE_PASSWORD: z.string().min(32),
    // Optional: when both are set, machines are provisioned as real Modal
    // sandboxes. Unset (e.g. local dev) the app records machines only.
    MODAL_TOKEN_ID: z.string().optional(),
    MODAL_TOKEN_SECRET: z.string().optional(),
    // Agent Pager (v1, email-first). Unset → pager notify is a no-op that logs.
    RESEND_API_KEY: z.string().optional(),
    PAGER_FROM_EMAIL: z.string().optional(),
    // Project invites. Email falls back to PAGER_FROM_EMAIL; Twilio unset →
    // text invites are handed back to the CLI to send from Messages.
    INVITE_FROM_EMAIL: z.string().optional(),
    TWILIO_ACCOUNT_SID: z.string().optional(),
    TWILIO_AUTH_TOKEN: z.string().optional(),
    TWILIO_MESSAGING_SERVICE_SID: z.string().optional(),
    // Vercel Blob (private store) for whiteboard images and binary project files.
    // Either a read-write token, or a store id with OIDC on Vercel. Unset → binaries stay local.
    BLOB_READ_WRITE_TOKEN: z.string().optional(),
    BLOB_STORE_ID: z.string().optional(),
    // Live project rooms (packages/sync). Unset → collaboration is off.
    SYNC_URL: z.string().url().optional(),
    SYNC_SECRET: z.string().min(32).optional(),
    // Public origin used for reply links and injected into sandboxes.
    APP_BASE_URL: z.string().url().optional(),
    // Web Push (VAPID). Unset → push is a no-op; email still works.
    VAPID_PRIVATE_KEY: z.string().optional(),
    VAPID_SUBJECT: z.string().optional(),
  },

  /**
   * Specify your client-side environment variables schema here. This way you can ensure the app
   * isn't built with invalid env vars. To expose them to the client, prefix them with
   * `NEXT_PUBLIC_`.
   */
  client: {
    NEXT_PUBLIC_WORKOS_REDIRECT_URI: z.string().url(),
    NEXT_PUBLIC_VAPID_PUBLIC_KEY: z.string().optional(),
  },

  /**
   * You can't destruct `process.env` as a regular object in the Next.js edge runtimes (e.g.
   * middlewares) or client-side so we need to destruct manually.
   */
  runtimeEnv: {
    DATABASE_URL: process.env.DATABASE_URL,
    NODE_ENV: process.env.NODE_ENV,
    MODAL_TOKEN_ID: process.env.MODAL_TOKEN_ID,
    MODAL_TOKEN_SECRET: process.env.MODAL_TOKEN_SECRET,
    RESEND_API_KEY: process.env.RESEND_API_KEY,
    PAGER_FROM_EMAIL: process.env.PAGER_FROM_EMAIL,
    INVITE_FROM_EMAIL: process.env.INVITE_FROM_EMAIL,
    TWILIO_ACCOUNT_SID: process.env.TWILIO_ACCOUNT_SID,
    TWILIO_AUTH_TOKEN: process.env.TWILIO_AUTH_TOKEN,
    TWILIO_MESSAGING_SERVICE_SID: process.env.TWILIO_MESSAGING_SERVICE_SID,
    APP_BASE_URL: process.env.APP_BASE_URL,
    BLOB_READ_WRITE_TOKEN: process.env.BLOB_READ_WRITE_TOKEN,
    BLOB_STORE_ID: process.env.BLOB_STORE_ID,
    SYNC_URL: process.env.SYNC_URL,
    SYNC_SECRET: process.env.SYNC_SECRET,
    VAPID_PRIVATE_KEY: process.env.VAPID_PRIVATE_KEY,
    VAPID_SUBJECT: process.env.VAPID_SUBJECT,
    NEXT_PUBLIC_VAPID_PUBLIC_KEY: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
    WORKOS_API_KEY: process.env.WORKOS_API_KEY,
    WORKOS_CLIENT_ID: process.env.WORKOS_CLIENT_ID,
    WORKOS_COOKIE_PASSWORD: process.env.WORKOS_COOKIE_PASSWORD,
    NEXT_PUBLIC_WORKOS_REDIRECT_URI:
      process.env.NEXT_PUBLIC_WORKOS_REDIRECT_URI,
  },
  /**
   * Run `build` or `dev` with `SKIP_ENV_VALIDATION` to skip env validation. This is especially
   * useful for Docker builds.
   */
  skipValidation: !!process.env.SKIP_ENV_VALIDATION,
  /**
   * Makes it so that empty strings are treated as undefined. `SOME_VAR: z.string()` and
   * `SOME_VAR=''` will throw an error.
   */
  emptyStringAsUndefined: true,
});
