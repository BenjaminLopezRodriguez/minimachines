# Stable named endpoints

Status: proposed follow-up. No endpoint infrastructure or production DNS was changed in the website UX pass.

## The problem this preview exposed

A disposable VM address is awkward for application origins, WorkOS callback allowlists, webhooks, and links shared for review. A developer should be able to register an endpoint once and point it at a replacement machine without changing that URL.

The website preview also had a separate issue: the global AuthKit provider attempted session lookups on public pages outside AuthKit middleware. The UX changes scope that provider to protected layouts. Stable routing would help origin configuration; it would not replace valid credentials, callback configuration, or that code fix.

## Existing foundation

The current share implementation already persists branded proxy links and can resolve a machine port to its origin. It chooses a random slug and snapshots the origin at creation. The current share API supports creation, listing, and revocation; it does not provide a named endpoint and machine-reassignment contract.

Relevant source: `src/server/data/shares.ts`, `src/app/api/v1/shares/route.ts`, and `src/app/s/[slug]/[[...path]]/route.ts`.

## Ownership and warm provisioning

Use one reusable endpoint per project by default, within a user-owned namespace. An account can have a starter project for quick experiments, and create more projects as needed. Names belong to projects rather than to individual machines.

Reserve the address when the project is created. Provision or resume compute when the project is opened or a service is staged. A project can opt into keeping a machine warm, with an explicit idle timeout and compute budget. The endpoint remains reserved when compute is paused and presents a clear offline/waking state.

Keep these lifecycles explicit:

- Endpoint: reserved, attached, detached, or released.
- Compute: provisioning, warm, active, idle, stopping, or stopped.
- Service: starting, ready, unhealthy, or offline.

An unchanged hostname should not imply an unchanged running machine. Configure callback URLs against the project origin, and replace the target only after readiness passes. Avoid waking a sleeping VM for every crawler request; an owner action or an explicitly configured wake policy should control billable provisioning.

## First useful version

- Reserve a project-scoped endpoint in the user’s namespace independently of a VM’s lifetime.
- Attach it to one owned machine and exposed port, with the target origin derived by the server.
- Show the stable URL, current target, health, visibility, and last reassignment in the dashboard.
- Reassign atomically after the new target passes a readiness check. Keep the old target if readiness fails; support explicit rollback.
- Preserve the hostname, HTTPS origin, paths, query strings, and safe forwarding headers across reassignment.
- Return a clear unavailable response when a target is stopped. Reserving an endpoint does not keep compute running or restart a VM automatically.
- Keep access policy attached to the endpoint across reassignment. Exposing a service publicly remains an explicit action.
- Support HTTP, WebSocket/HMR, and streaming responses without mixing their lifecycle with machine creation.

## UX for this project

1. Create a review endpoint for Mini Machines and attach the running website service on port 3000.
2. Copy the stable callback URL into the intended WorkOS environment’s allowlist and configure that same application origin in the preview’s environment. Keep credentials in a secret store.
3. Build on a replacement VM and check readiness before moving the endpoint.
4. Open the same review link and verify sign-in, callback, and signed-in navigation.
5. Export the work and stop unused compute. The endpoint remains reserved and reports its offline state.

No new CLI command is advertised until this behavior exists. A future CLI/API should expose reserve, inspect, attach, reassign, detach, and delete as distinct operations; multi-service staging can compose them later.

## Acceptance checks

- The URL survives stopping and replacing its VM; callback paths remain unchanged.
- A user cannot attach another owner’s machine or provide an arbitrary internal upstream URL.
- Failed readiness checks leave the previous target intact.
- Concurrent reassignments detect stale target revisions.
- Public/private access policy survives a target swap.
- A stopped target produces a clear unavailable state rather than stale content or a provisioning side effect.
- Cookies, redirects, WebSocket connections, and SSE behave correctly through the stable origin.
- Endpoint reservation and compute usage have separately explained billing behavior.
