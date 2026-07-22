import { DiffuseTypeText } from "~/components/ui/diffuse-type-text";

import { AgentLogos } from "./agent-logos";

const steps = [
  {
    title: "Spin up a dedicated VM",
    body: "Each agent gets its own machine — isolated filesystem, full shell, no shared tenancy noise.",
  },
  {
    title: "Point your agent at it",
    body: "Claude, Codex, Grok, Cursor, Gemini — keep your existing workflows. We supply the compute.",
  },
  {
    title: "Ship while it works",
    body: "Builds, tests, refactors, and long-running loops stay in the cloud so your laptop stays free.",
  },
] as const;

const metrics = [
  { stat: "1.2s", label: "avg. VM spin-up" },
  { stat: "0", label: "workflow changes" },
  { stat: "24/7", label: "agent loops" },
] as const;

const features = [
  {
    title: "VM marketplace",
    body: "Browse and launch machine images tuned for agent workloads — preloaded toolchains, runtimes, and agent configs.",
    terminal: [
      { toned: "muted", text: "$ mm market search agent-node" },
      { toned: "default", text: "  node-agent-22.04   4 vCPU · 16GB · ready" },
      { toned: "default", text: "  claude-devbox      8 vCPU · 32GB · ready" },
      { toned: "muted", text: "$ mm market launch node-agent-22.04" },
      { toned: "signal", text: "→ vm-9c2e provisioned in 1.4s" },
    ],
  },
  {
    title: "Copyleft checker",
    body: "Scan dependencies and generated code for license risk before agents merge, so open-source obligations stay visible.",
    terminal: [
      { toned: "muted", text: "$ mm license scan ./src --diff HEAD~1" },
      { toned: "warn", text: "⚠ GPL-3.0   lodash-fork@1.2.0  (agent-added)" },
      { toned: "default", text: "✓ MIT       48 packages clean" },
      { toned: "signal", text: "→ blocked merge until license reviewed" },
    ],
  },
  {
    title: "Cloud deploy",
    body: "Push from an agent workspace straight to production targets without bouncing builds back to your laptop.",
    terminal: [
      { toned: "muted", text: "$ mm deploy --env prod --from vm-7f3a" },
      { toned: "default", text: "  building image… done (41s)" },
      { toned: "default", text: "  rolling 3 / 3 healthy" },
      { toned: "signal", text: "→ https://api.northline.dev" },
    ],
  },
  {
    title: "Cloud debug",
    body: "Attach to live VMs, inspect agent sessions, and dig through logs when a long-running loop goes sideways.",
    terminal: [
      { toned: "muted", text: "$ mm debug attach vm-7f3a" },
      { toned: "default", text: "  session claude#14  paused" },
      { toned: "default", text: "  auth.ts:88  TypeError: token undefined" },
      { toned: "signal", text: "→ attached · live stdout streaming" },
    ],
  },
  {
    title: "Collaborative cloud",
    body: "Share running machines with your team — same VM, same workspace, agents and humans working side by side.",
    terminal: [
      { toned: "muted", text: "$ mm share vm-7f3a --with elena@silt.dev" },
      { toned: "default", text: "  invite sent · shell + workspace" },
      { toned: "signal", text: "→ elena joined · 2 sessions active" },
    ],
  },
] as const;

const points = [
  {
    title: "Real isolation",
    body: "Dedicated VMs, not thin containers fighting for the same host. Predictable CPU and memory when agents thrash.",
  },
  {
    title: "Built for long loops",
    body: "Agentic work is bursty and patient. Persistent workspaces survive restarts so agents pick up where they left off.",
  },
  {
    title: "Bring your stack",
    body: "No new agent to learn. Wire up the models and tools you already trust and give them room to run.",
  },
] as const;

const testimonials = [
  {
    quote:
      "We used to leave Claude overnight on a spare Mac Mini and hope it didn't melt. Moving the same workflow onto a minimachines VM cut our iteration loop roughly in half — and the laptop fans finally shut up.",
    name: "Priya Nandakumar",
    role: "Staff engineer",
    company: "Northline",
  },
  {
    quote:
      "The copyleft checker caught a GPL transitive dep an agent had pulled mid-refactor. That alone paid for the pilot. Cloud debug is what we actually live in day to day though — attaching to a stuck session beats SSH archaeology.",
    name: "Marcus Ellison",
    role: "Founding engineer",
    company: "Harborkit",
  },
  {
    quote:
      "Collaborative cloud is the underrated part. I can jump onto the same VM my teammate's Codex run is using, poke the failing test, and hand it back without shipping zip files around Slack.",
    name: "Elena Voss",
    role: "Engineering manager",
    company: "Silt",
  },
] as const;

function TerminalSnippet({
  lines,
}: {
  lines: readonly { toned: "muted" | "default" | "signal" | "warn"; text: string }[];
}) {
  return (
    <div className="border-border bg-surface overflow-hidden border">
      <div className="border-border flex items-center gap-1.5 border-b px-3 py-2">
        <span className="size-1.5 rounded-full bg-foreground/25" />
        <span className="size-1.5 rounded-full bg-foreground/25" />
        <span className="size-1.5 rounded-full bg-foreground/25" />
      </div>
      <pre className="overflow-x-auto p-3 font-mono text-[11px] leading-relaxed sm:text-xs">
        {lines.map((line) => (
          <div
            key={line.text}
            className={
              line.toned === "muted"
                ? "text-muted-foreground"
                : line.toned === "signal"
                  ? "text-signal"
                  : line.toned === "warn"
                    ? "text-destructive"
                    : "text-foreground/85"
            }
          >
            {line.text}
          </div>
        ))}
      </pre>
    </div>
  );
}

export function ProductSections() {
  return (
    <>
      <section className="border-y border-border bg-surface/40">
        <div className="mx-auto flex max-w-6xl justify-center px-5 py-10 sm:justify-start sm:px-8">
          <AgentLogos className="sm:justify-start" />
        </div>
      </section>

      <section className="border-b border-border">
        <div className="mx-auto grid max-w-6xl grid-cols-1 divide-y divide-border sm:grid-cols-3 sm:divide-x sm:divide-y-0">
          {metrics.map((metric) => (
            <div
              key={metric.label}
              className="px-5 py-10 sm:px-8 sm:py-12 first:sm:pl-8 last:sm:pr-8"
            >
              <p className="font-mono text-3xl tracking-tight text-foreground sm:text-4xl">
                {metric.stat}
              </p>
              <p className="mt-2 text-sm text-muted-foreground">{metric.label}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="how" className="scroll-mt-14">
        <div className="mx-auto max-w-6xl px-5 py-20 sm:px-8 sm:py-28">
          <div className="max-w-2xl">
            <DiffuseTypeText
              as="h2"
              speed={20}
              wave={4}
              delay={80}
              className="text-3xl tracking-tight text-foreground sm:text-4xl"
            >
              Agents belong on machines that can keep up
            </DiffuseTypeText>
            <DiffuseTypeText
              as="p"
              speed={12}
              wave={5}
              delay={220}
              className="mt-4 text-base leading-relaxed text-muted-foreground sm:text-lg"
            >
              Local laptops choke on multi-agent loops. minimachines moves that
              compute to dedicated cloud VMs without changing how you work.
            </DiffuseTypeText>
          </div>

          <ol className="mt-14 grid gap-10 border-t border-border pt-10 md:grid-cols-3 md:gap-8">
            {steps.map((step, i) => (
              <li key={step.title}>
                <DiffuseTypeText
                  as="h3"
                  speed={22}
                  wave={3}
                  delay={100 + i * 80}
                  className="text-lg tracking-tight text-foreground"
                >
                  {step.title}
                </DiffuseTypeText>
                <DiffuseTypeText
                  as="p"
                  speed={11}
                  wave={4}
                  delay={180 + i * 80}
                  className="mt-2 text-sm leading-relaxed text-muted-foreground"
                >
                  {step.body}
                </DiffuseTypeText>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section id="features" className="scroll-mt-14 border-t border-border">
        <div className="mx-auto max-w-6xl px-5 py-20 sm:px-8 sm:py-28">
          <div className="max-w-2xl">
            <DiffuseTypeText
              as="h2"
              speed={20}
              wave={4}
              delay={80}
              className="text-3xl tracking-tight text-foreground sm:text-4xl"
            >
              Everything around the machine
            </DiffuseTypeText>
            <DiffuseTypeText
              as="p"
              speed={12}
              wave={5}
              delay={200}
              className="mt-4 text-base leading-relaxed text-muted-foreground sm:text-lg"
            >
              Dedicated VMs are the core. These are the tools that make agentic
              development shippable with a team.
            </DiffuseTypeText>
          </div>

          <ul className="mt-14 divide-y divide-border border-y border-border">
            {features.map((feature, i) => (
              <li
                key={feature.title}
                className="grid gap-6 py-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:items-start lg:gap-12"
              >
                <div>
                  <DiffuseTypeText
                    as="h3"
                    speed={22}
                    wave={3}
                    delay={80 + i * 60}
                    className="text-lg tracking-tight text-foreground"
                  >
                    {feature.title}
                  </DiffuseTypeText>
                  <DiffuseTypeText
                    as="p"
                    speed={11}
                    wave={4}
                    delay={140 + i * 60}
                    className="mt-2 text-sm leading-relaxed text-muted-foreground sm:max-w-md"
                  >
                    {feature.body}
                  </DiffuseTypeText>
                </div>
                <TerminalSnippet lines={feature.terminal} />
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="border-t border-border bg-surface/50">
        <div className="mx-auto max-w-6xl px-5 py-20 sm:px-8 sm:py-28">
          <div className="max-w-2xl">
            <DiffuseTypeText
              as="h2"
              speed={20}
              wave={4}
              delay={80}
              className="text-3xl tracking-tight text-foreground sm:text-4xl"
            >
              Heavy agent work, without the laptop tax
            </DiffuseTypeText>
          </div>

          <div className="mt-14 grid gap-12 border-t border-border pt-10 md:grid-cols-3 md:gap-10">
            {points.map((point, i) => (
              <div key={point.title}>
                <DiffuseTypeText
                  as="h3"
                  speed={22}
                  wave={3}
                  delay={100 + i * 80}
                  className="text-lg tracking-tight text-foreground"
                >
                  {point.title}
                </DiffuseTypeText>
                <DiffuseTypeText
                  as="p"
                  speed={11}
                  wave={4}
                  delay={180 + i * 80}
                  className="mt-2 text-sm leading-relaxed text-muted-foreground"
                >
                  {point.body}
                </DiffuseTypeText>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="stories" className="scroll-mt-14 border-t border-border">
        <div className="mx-auto max-w-6xl px-5 py-20 sm:px-8 sm:py-28">
          <div className="max-w-2xl">
            <DiffuseTypeText
              as="h2"
              speed={20}
              wave={4}
              delay={80}
              className="text-3xl tracking-tight text-foreground sm:text-4xl"
            >
              What it feels like once the agents leave your laptop
            </DiffuseTypeText>
          </div>

          <ul className="mt-14 grid gap-4 md:grid-cols-3 md:gap-5">
            {testimonials.map((item) => (
              <li
                key={item.name}
                className="flex flex-col border border-border bg-card p-6 sm:p-7"
              >
                <blockquote className="flex-1 text-[15px] leading-relaxed text-foreground/90">
                  &ldquo;{item.quote}&rdquo;
                </blockquote>
                <footer className="mt-8 border-t border-border pt-5">
                  <p className="text-sm font-medium tracking-tight text-foreground">
                    {item.name}
                  </p>
                  <p className="mt-1 font-mono text-[11px] tracking-wide text-muted-foreground">
                    {item.role} · {item.company}
                  </p>
                </footer>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="border-t border-border">
        <div className="mx-auto flex max-w-6xl flex-col gap-6 px-5 py-20 sm:flex-row sm:items-end sm:justify-between sm:px-8 sm:py-24">
          <div className="max-w-xl">
            <DiffuseTypeText
              as="h2"
              speed={20}
              wave={4}
              delay={80}
              className="text-3xl tracking-tight text-foreground sm:text-4xl"
            >
              Give your agents a machine of their own
            </DiffuseTypeText>
            <DiffuseTypeText
              as="p"
              speed={12}
              wave={4}
              delay={200}
              className="mt-4 text-base text-muted-foreground"
            >
              Join the waitlist — we're onboarding teams building with coding
              agents first.
            </DiffuseTypeText>
          </div>
          <a
            href="#waitlist"
            className="inline-flex h-10 shrink-0 items-center justify-center bg-primary px-5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
          >
            Join the waitlist
          </a>
        </div>
      </section>
    </>
  );
}
