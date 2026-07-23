# UX + backend bug ledger — minimachines

## 2026-07-23 — Audit + Fix session (ux-debug + backend-check, parallel)

### Fixed
| ID | Slug | File | Fix |
|----|------|------|-----|
| A | dashboard-blinks (P0) | globals.css:108, shell.tsx:21 | `.mm-cursor` theme scope renamed `.mm-app`; blink `.mm-cursor` (globals.css:216) now caret-only. Dashboard no longer flashes. |
| A | caret-invisible (P1) | vm-preview.tsx:92 | Same rename — caret keeps `.mm-cursor` (blink only), no longer inherits dark bg → `bg-white/70` shows. |
| SEC | ratelimit-ip-spoof (High) | waitlist.ts:~27 | Key rate-limit on `x-real-ip` (Vercel-trusted), not spoofable leftmost `x-forwarded-for`. |
| C | preview-low-contrast (P2) | vm-preview.tsx:37,49,76,80,89 | `text-white/40,/45` → `/55` (passes AA ≥4.5:1 on #141414). |
| B | token-hover-white (P2) | shell.tsx, mobile-fleet-drawer.tsx | bare `hover:bg-white` on primary buttons → `hover:opacity-90` (user's later refactor to ghost variants superseded most). |
| A | framer-no-reduced-motion (P1) | waitlist-form.tsx | `useReducedMotion()` gates the entrance motion.div. |
| T | h1-brand-only (P2) | hero.tsx:20,32 | Descriptive line is now `h1`; brand word demoted to `p` (visual unchanged, better SEO). |

### Open / backlogged
| ID | Slug | File | Severity | Note |
|----|------|------|----------|------|
| P | sub-44px-targets | site-header, dashboard buttons (h-7/h-9) | P2 | Deliberate Cursor/Linear desktop density; dashboard actively being restyled. Revisit mobile hit areas post-design-freeze. |
| C | muted-80-tiny | fleet-list.tsx:63 (region) | P2 | User re-set `muted-foreground/80` @11px during live edit — their call, left as-is. |
| B | hardcoded-hex | vm-preview.tsx:29 (`bg-[#141414]`) | P2 | Deliberate dark terminal chrome on light landing. Could scope with `.mm-app` instead; not worth churn now. |
| I | dead-controls | dashboard Open/Stop/New machine | — | Static mock, expected pre-backend. |
| X | no-js-invisible-copy | diffuse-type-text.tsx | P2 | Scroll-section headings render transparent until IO fires; blank with JS off (aria-label keeps AT tree). |
| N | no-mobile-nav | (addressed) | — | User added MobileFleetDrawer since audit. |

### Recurring patterns
- `.mm-cursor` selector was triple-purposed (theme scope + blink) → root-caused by rename. Watch for generic class names reused across concerns.
- Low-opacity text on already-muted tokens at 11–12px → AA fails; keep meta text ≥ /55.

### Verified clean (not bugs)
Auth wiring end-to-end (callback path = redirect URI, `/dashboard` gated via `withAuth({ensureSignedIn:true})`, sign-in route, AuthKitProvider, tRPC registration, JSON errors); waitlist honeypot→ratelimit→insert order + unique-index idempotency; dark-mode var coverage; form a11y (labels, aria-invalid, double-submit); no horizontal scroll; viewport meta auto-injected by Next.
