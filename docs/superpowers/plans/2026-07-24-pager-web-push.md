# Agent Pager — native push via Web Push (v1.1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development or superpowers:executing-plans. Steps use `- [ ]`.
>
> **Discipline:** `/plan` `/ponytail` `/backend-check`. Extends the [Agent Pager plan](./2026-07-24-agent-pager-companion-app.md).

**Goal:** Add **native push** as a pager channel — a page lands on the lock screen, no email needed — using **Web Push (VAPID)**. Covers **iPhone (iOS 16.4+ home-screen PWA), Android, and desktop** with one implementation and **no Apple Developer account**. Built channel-agnostic so a **future native iOS app reuses the same subscription + notify plumbing** (APNs sender slots in later; app is on the back burner).

**Architecture:**
- **VAPID** keypair signs pushes (env). One `web-push` send call per subscription; the payload is the same summary + reply link the email carries (`/m/<token>`).
- **PWA shell** on minimachin.es: a `manifest.webmanifest` + a service worker (`sw.js`) that handles the `push` event (`showNotification`) and `notificationclick` (open the reply link). iOS requires the page be **Added to Home Screen** (standalone) before `Notification.requestPermission()` works.
- **Enroll surface:** a small `/pager` page (and a prompt on the reply page) — "Add to Home Screen → Enable notifications" → subscribe → POST the subscription.
- **`pushSubscriptions` table** keyed by endpoint, scoped to the owner, with a `kind` column (`webpush` now, `apns` later). The `notify` send path fans out over the owner's subscriptions by kind — so the native app later just adds an `apns` sender + registers device tokens against the **same** table. No change to events/mailbox/notify.
- **Channel routing:** extend `pagerContacts.channels` (`email` | `push` | `both`, default `both` once a subscription exists). `notify` sends to each enabled channel; a channel with no target is skipped.

```
notify(kind,text) → create event + token (unchanged)
  ├─ email  → Resend (existing)
  └─ push   → for each owner pushSubscription: web-push(summary + /m/<token>)
                 → SW push event → showNotification → tap → opens reply page
```

**Tech stack:** `web-push` (VAPID signing + RFC 8291 payload encryption — do not hand-roll the crypto), Drizzle, a static service worker + manifest, the existing pager events/mailbox/reply page. Reuses `requireApiKey`, Resend path, `/m/<token>`.

## Global Constraints

- Subscriptions are owner-scoped; a push carries only a one-line summary + the signed reply link (no secrets in the payload).
- `web-push` handles encryption — **do not implement ECDH/HKDF/AES-GCM by hand** (ponytail: dep solves it, security-critical).
- Prune dead subscriptions: on a `404`/`410` from the push service, delete that row.
- iOS constraint is real: Web Push only fires for a **standalone** (home-screen) PWA — the enroll UX must say so, or users think it's broken.
- Keep the native-app door open: never bake `webpush` assumptions into the event/notify core; branch only in the sender.
- New env: `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (`mailto:` or the site URL). Public key also exposed to the client for `subscribe()`.
- Do not commit unless asked. Prefer `tsx --test`.

---

## File map

| Path | Responsibility |
|------|----------------|
| `src/server/db/schema.ts` | `pushSubscriptions` table; `pagerContacts.channels` already exists |
| `src/server/data/push.ts` | save/list/delete subscriptions; `sendPush(ownerUserId, {title,body,url})` via web-push; prune on 404/410 |
| `src/server/data/push.test.ts` | subscribe upsert, prune-on-gone, owner scoping |
| `src/server/data/pager.ts` (or notify path) | fan-out: email + push per `channels` |
| `src/app/api/v1/machines/[id]/notify/route.ts` | call push alongside email |
| `src/app/api/v1/pager/subscribe/route.ts` | `POST` store a subscription, `DELETE` unsubscribe (Bearer) |
| `public/manifest.webmanifest` | PWA manifest (name, icons, `display: standalone`, `start_url`) |
| `public/sw.js` | service worker: `push` → showNotification; `notificationclick` → open url |
| `src/app/pager/page.tsx` | enroll UI: install hint + Enable-notifications + subscribe |
| `src/app/m/[token]/page.tsx` | soft prompt to enable push after a reply |
| `packages/cli/src/cli.ts` | (optional) `mm pager channels email|push|both` |
| `.env.example` + `src/env.js` | VAPID keys |

---

### Task 0 — VAPID keys (enabling)
- Generate a keypair (`web-push generate-vapid-keys`); set `VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY`/`VAPID_SUBJECT` locally + in Vercel. Public key served to the client.

### Task 1 — Schema
- `pushSubscriptions`: `id`, `ownerUserId`, `kind` (default `webpush`), `endpoint` (unique), `p256dh`, `auth`, `ua?`, `createdAt`. Index `(ownerUserId)`.
- Reuse `pagerContacts.channels` for routing (`email|push|both`).

### Task 2 — Push data + sender
- `saveSubscription({ownerUserId, sub, ua})` (upsert on endpoint), `deleteSubscription(endpoint)`, `listSubscriptions(ownerUserId)`.
- `sendPush(ownerUserId, payload)`: web-push to each row; on `404/410` delete the row; swallow/log other errors (don't fail notify).
- **Test:** upsert idempotent by endpoint; a simulated gone-status prunes.

### Task 3 — Service worker + manifest
- `public/sw.js`: `self.addEventListener("push", …showNotification(title,{body,data:{url}}))`; `notificationclick` → `clients.openWindow(url)`.
- `public/manifest.webmanifest`: `display: standalone`, name, `start_url: "/pager"`, icons (reuse logo). Link it from the app `<head>`.

### Task 4 — Enroll UI
- `/pager`: register `sw.js`, request permission, `pushManager.subscribe({ applicationServerKey: VAPID_PUBLIC })`, POST to `/api/v1/pager/subscribe`. Show the iOS "Add to Home Screen first" hint when not standalone.
- Reply page: after sending, a one-tap "Get these on your lock screen" that deep-links to `/pager`.

### Task 5 — Subscribe API
- `POST /api/v1/pager/subscribe` (Bearer): store subscription for `auth.userId`; set `channels` to include push. `DELETE`: remove by endpoint.
- **Test:** wrong owner can't read another's subs; store is owner-scoped.

### Task 6 — Wire into notify
- In the notify path, after creating the event, fan out per `channels`: email (existing) and/or `sendPush(ownerUserId, { title: "agent " + kind, body: text, url: replyLink })`.
- **Test:** with a push sub + `channels=push`, notify calls the sender; email-only unchanged.

### Task 7 — backend-check
- [ ] Subscriptions owner-scoped; payload carries only summary + signed link (no secret).
- [ ] `web-push` used for encryption (no hand-rolled crypto).
- [ ] Dead subscriptions pruned on 404/410; a push failure never fails `notify`.
- [ ] iOS: enroll UX states the Home-Screen requirement.

---

## Native iOS app (back burner) — how this plan sets it up

The event → token → mailbox → reply loop is already channel-agnostic. When the app is built:
- It registers an **APNs device token** as a `pushSubscriptions` row with `kind: "apns"`.
- Add an `apns` branch in `sendPush` (APNs `.p8` key + HTTP/2) — needs the **Apple Developer Program** then.
- Everything else — notify, events, reply page, mailbox — is unchanged.

## Open questions
- Icon assets for the manifest (reuse `public/logos`?).
- Default `channels` when a user has both email + a push sub — `both`, or let them pick in `/pager`.
- Android/desktop only need permission (no install step); gate the "Add to Home Screen" hint to iOS Safari non-standalone.
