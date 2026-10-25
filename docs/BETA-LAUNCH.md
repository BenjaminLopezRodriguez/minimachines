# minimachines: a small, useful private beta

Prepared October 25, 2026. This is a working launch plan, with proposed thresholds rather than claims about existing traction.

## Recommendation

Start with 5–10 technical founders or small agencies who already use a coding agent and have a real unfinished project. Give each person one concrete job: bring an existing project, ask the bot for a useful change, review the result, and tell you what blocked them. Treat the phone/baton round trip as a separate, explicitly supported test; the landing page currently promises email or push, not an SMS workflow that has not been implemented.

Use a private beta for learning, not a large waitlist for appearance. Personally onboard the first group, watch their first attempt with permission, and invite the next group only after the most common blockers have been fixed. This follows YC’s emphasis on understanding real workflows and getting useful user feedback early: [Building Product, Talking to Users, and Growing](https://www.ycombinator.com/library/dS-how-to-start-a-startup-building-product-talking-to-users-and-growing).

## What is implemented

- `/early-access`: an email-first application with optional interview consent, a honeypot, bounded inputs, shared PostgreSQL rate limits, and a non-enumerating success response for duplicate emails. Success is shown only after the server saves the request.
- WorkOS handles account creation and inbox verification. A signup confirmation alone is not beta admission. Verified authentication enrolls the account; `/beta` lets people add their role, intended project, and interview preference.
- `/dashboard/beta`: an administrator-only tester pool, cohorts, approval/pause controls, operational counts, and a feedback inbox. Unverified applicants cannot be approved. Approval does not send an email.
- A dismissible suggestions banner and feedback dialog in the main Bot/Whiteboard shell. Feedback text is stored in the application database, never sent as an analytics property.
- `@vercel/analytics/next` collects page views and a small explicit event set. Automatic session replay is not installed. Auth, pager, invitation and API URLs are excluded; project IDs, non-allowlisted query parameters and fragments are removed before capture. Browser analytics can be disabled at `/privacy`; Do Not Track and Global Privacy Control are respected.
- WorkOS verification is checked for authenticated procedures and before real compute/API-key creation. Optional beta admission is enforced server-side for dashboard/Bots access, protected tRPC operations, API keys and real compute.

WorkOS documents its hosted verification flow here: [Email Verification](https://workos.com/docs/authkit/email-verification). A verified inbox is not proof that a user is harmless; admission controls and resource limits remain necessary.

## Rollout order

1. Apply `0015_beta_program.sql` before deploying code that reads the new tables. It adds beta applications, feedback, shared request buckets and compute reservations. Existing `waitlist` records are backfilled as unverified applicants. Do not infer verification from an email string.
2. Set `BETA_ADMIN_USER_IDS` to the founders’ verified WorkOS IDs. No administrator is inferred from an email domain, applicant field, client-supplied role or user metadata.
3. Review existing users before closing admission. Run `scripts/bootstrap-beta.ts --include-existing` as a dry run with the intended database and WorkOS environment, then use `--apply` to admit the reviewed verified accounts. The script sends no messages. Existing applications that were deliberately paused should be reviewed before re-admission.
4. Deploy and verify `/early-access`, signup → verification → pending application, admin approval → workspace access, and pause → blocked access through both browser and CLI. Keep a founder account open for recovery.
5. Set `BETA_GATE_ENABLED=true` only after admins and existing testers are bootstrapped. This flag defaults to `false` so deploying a schema/UI change cannot unexpectedly lock current customers out. A deployment may be needed for a changed environment variable to take effect.
6. Confirm Vercel’s Web Analytics project toggle is enabled, deploy the SDK, and inspect a real production page view and custom event. The project toggle was found enabled during implementation. A report with no data is not evidence that the event pipeline works. The SDK logs debug events rather than sending real production data during development.
7. Admit the first cohort manually. Only contact people who actually applied; interview outreach additionally requires their saved interview preference. Drafts below are for a human to send—no outreach is automated by this implementation.

See [Vercel Web Analytics quickstart](https://vercel.com/docs/analytics/quickstart) and [custom events](https://vercel.com/docs/analytics/custom-events). Custom event availability and report retention depend on the Vercel plan. No paid Plus upgrade is purchased by installing the SDK.

## Guardrails and limits

| Surface                        | Default limit / protection                                                                                      |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| Early-access signup            | 5 attempts per IP / 10 minutes; 3 per email / hour; honeypot; generic duplicate response                        |
| Authenticated tRPC writes      | 60 mutations per user / minute                                                                                  |
| CLI/API authentication         | 300 authentication attempts per IP / minute                                                                     |
| CLI/API usage                  | 240 reads or 90 writes per user / minute, pooled across that user’s API keys                                    |
| Device-code creation / polling | 10 creates / minute; 60 polls / minute per IP                                                                   |
| Bot requests                   | 20 messages per user / hour; existing per-conversation generation lock                                          |
| Feedback                       | 10 submissions per user / hour; bounded message; private administrator review                                   |
| Real compute                   | 2 active machines and 5 start/restart attempts per day for testers; templates capped at 4 CPUs / 8 GB RAM       |
| Compute concurrency            | A PostgreSQL advisory lock plus expiring provisioning reservations prevents parallel requests bypassing the cap |
| Compute emergency pause        | `COMPUTE_ENABLED=false` stops new/restarted compute; existing machines and access remain available              |

Administrators are explicitly exempt from tester compute quotas so the existing development fleet remains operable. They are still subject to verification and the emergency compute pause. Keep the admin allowlist short; do not share administrator API keys with testers. Provisioned VMs already have a one-hour default lifetime. Failed/expired provisioning reservations are cleaned before reserving a new slot. These controls bound ordinary tester usage; they do not replace monitoring the Modal bill and account-level budgets.

Rate buckets are atomic PostgreSQL rows, not per-process memory. Their identifiers are SHA-256 hashes scoped to time windows and they are cleaned opportunistically. Requests fail closed when the shared limiting database is unavailable. Fixed windows can permit a burst around a boundary; this is not a strict rolling-window guarantee. Vercel’s trusted `x-real-ip` header is used, not the first user-supplied forwarded address. Shared networks can share a public-IP budget; increase limits deliberately if real testers are blocked.

## A ten-day testing launch

| Day  | Work                                                                                                     | Evidence to collect                                                                                  |
| ---- | -------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| 1    | Verify staging flows and production event ingestion. Pick one supported demo and one browser/phone path. | A complete trace from application to admission to meaningful use; no unexpected resource creation.   |
| 2    | Invite five suitable applicants personally. Schedule a short onboarding if they consent.                 | Their real project, what they use today, and the last time this problem occurred.                    |
| 3–4  | Watch first use. Let users attempt the task before explaining the interface.                             | Time to first useful result, setup failures, prompts that caused confusion, and missing affordances. |
| 5    | Fix the top two repeated blockers; follow up with affected testers.                                      | Whether they can complete the same job without a founder doing it for them.                          |
| 6–7  | Ask the same users to bring a second task.                                                               | Voluntary repeat use, not just a polite first try.                                                   |
| 8    | Review feedback by cohort and inspect usage/cost.                                                        | Activation, repeat sessions, failure rate, support time, spend and verified-to-approved conversion.  |
| 9–10 | Add a second cohort of 10–15 only if the first group gets value reliably.                                | Which problems recur across users, and whether onboarding improvements held up.                      |

Suggested expansion criteria: at least 5 of the first 10 approved testers complete one useful task, at least 3 return with another task within a week, no unresolved access-control/data-loss issue, and costs stay within a founder-set daily budget. These are proposed learning targets for this beta, not industry benchmarks. If they fail, narrow the task and fix onboarding before buying traffic.

## Analytics readout

Use the database’s verified, approved and feedback counts as the source of truth for admission. Use Vercel for aggregate traffic and feature interaction trends. Vercel’s anonymous visitor/session reporting does not provide an account-linked cohort retention funnel, so do not divide unrelated anonymous browser counts and call that user retention. Use the saved tester cohort and consensual follow-up for the small pilot; add account-linked first-party activity reporting later only if needed and documented.

Explicit event names: `early_access_joined`, `beta_profile_saved`, `suggestions_opened`, `feedback_submitted`, `suggested_prompt_selected`, `bot_message_submitted`, `bot_reply_received`, `whiteboard_edited`, `whiteboard_history_browsed`, `whiteboard_edit_restored`.

Events carry at most the enumerated product surface. They never include email addresses, account IDs, message text, drawings, files, command output, feedback bodies or credentials. A cached canvas opening does not count as a new edit. The `early_access_joined` event measures a successful submission, including a duplicate; unique applications come from the database. Client events can be blocked or forged, so they never determine access or billing.

Start with known campaign URLs, e.g. `/?utm_source=github&utm_campaign=beta-01`. Only the documented allowlisted campaign values survive URL sanitization. Do not put email addresses or invitation secrets in analytics labels.

## Feedback and interview guide

In the app, ask: “What did you try?”, “What happened?”, and “What did you expect?” Categorize findings as a bug, idea or testing experience. Ask for a 1–5 usefulness score only as an optional supplement to the explanation. Review new feedback daily and mark items reviewed/resolved; a single loud request is not a roadmap vote.

In a short conversation, ask about a recent real task: what they attempted, how they solved it before, where they stopped, and what they did next. Avoid asking whether an imaginary future feature sounds useful. Watch whether they return and bring another task. Keep notes short, and obtain permission before recording anything.

Draft invitation, for manual sending to an approved applicant:

“Your minimachines beta access is ready. Bring one small project you already want to move forward. Sign in with the email you applied with, try Bot or Whiteboard, and use ‘Share a suggestion’ when anything gets in your way. We’re still early, so keep a local copy of important files. If you opted into a feedback conversation, we’d love to hear how the first attempt goes.”

Draft follow-up, for consenting testers:

“What did you try with minimachines? Where did you get stuck, and did you get something useful out of it? If you have another real task, we’d like to see whether it’s easier the second time.”

## Runbook

- High error rate: pause new admissions. If provisioning is the cause, disable new compute; do not delete users’ machines as a substitute for a pause.
- Abuse: pause that application, revoke affected keys if compromised, inspect resource use, then review which limit failed. Pausing admission does not automatically terminate a VM already running; stop it separately if needed.
- Database outage: signup and protected operations may fail closed. Do not report a successful signup until the database confirms it.
- Removal request: verify ownership, then remove the application/feedback and any associated user data through a reviewed operator process. The in-app feedback route is an intake channel, not an automated deletion promise.
- Before a larger launch: verify the one-hour VM expiry behavior against actual running sandboxes, set a spend budget with alerts in the infrastructure accounts, review public-share abuse paths, and consider edge bot protection for sustained distributed abuse. The application limits here do not claim to prevent DDoS or prove identity beyond inbox verification.
