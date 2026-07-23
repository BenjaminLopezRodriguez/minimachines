"use client";

import { Loader2 } from "lucide-react";
import { useState } from "react";

import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { api } from "~/trpc/react";

type Kind = "agent" | "model";

type CtaCopy = {
  kind: Kind;
  title: string;
  subtitle: string;
  cta: string;
  namePlaceholder: string;
};

const COPY: Record<Kind, CtaCopy> = {
  agent: {
    kind: "agent",
    title: "Building a coding agent?",
    subtitle: "Run it on minimachines. Request to add your agent to the platform.",
    cta: "Add your agent",
    namePlaceholder: "Agent / product name (optional)",
  },
  model: {
    kind: "model",
    title: "Ship a model?",
    subtitle:
      "Publish it on the minimachines model market. Request a provider slot.",
    cta: "Publish your model",
    namePlaceholder: "Model name (optional)",
  },
};

// Signup CTA for partners. One form, parameterized by kind so agent-builders
// and model providers share the same flow (posts partners.request).
function SignupCta({ copy }: { copy: CtaCopy }) {
  const [open, setOpen] = useState(false);
  const [company, setCompany] = useState("");
  const [email, setEmail] = useState("");
  const [agentName, setAgentName] = useState("");
  // Honeypot: hidden from humans, bots fill it.
  const [website, setWebsite] = useState("");

  const request = api.partners.request.useMutation();
  const done = request.isSuccess;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!company.trim() || !email.trim()) return;
    request.mutate({
      kind: copy.kind,
      company,
      email,
      agentName: agentName || undefined,
      website,
    });
  };

  return (
    <div className="w-full">
      <h2 className="text-xl font-medium tracking-tight text-foreground">
        {copy.title}
      </h2>
      <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
        {copy.subtitle}
      </p>

      {done ? (
        <p className="mt-6 text-sm text-foreground" role="status">
          Thanks — we&apos;ll be in touch about {company}.
        </p>
      ) : !open ? (
        <Button className="mt-6" onClick={() => setOpen(true)}>
          {copy.cta}
        </Button>
      ) : (
        <form
          onSubmit={submit}
          className="mx-auto mt-6 flex w-full max-w-md flex-col gap-3 text-left"
        >
          <Input
            aria-label="Company"
            placeholder="Company"
            value={company}
            onChange={(e) => setCompany(e.target.value)}
            required
          />
          <Input
            aria-label="Work email"
            type="email"
            placeholder="Work email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <Input
            aria-label={copy.namePlaceholder}
            placeholder={copy.namePlaceholder}
            value={agentName}
            onChange={(e) => setAgentName(e.target.value)}
          />
          {/* Honeypot */}
          <input
            type="text"
            tabIndex={-1}
            autoComplete="off"
            aria-hidden
            className="hidden"
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
          />
          {request.isError && (
            <p className="text-sm text-destructive" role="alert">
              {request.error.message}
            </p>
          )}
          <Button type="submit" disabled={request.isPending}>
            {request.isPending ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : (
              "Submit request"
            )}
          </Button>
        </form>
      )}
    </div>
  );
}

export function PartnerCta() {
  return (
    <section className="mx-auto grid w-full max-w-4xl gap-12 px-6 py-16 text-center sm:grid-cols-2">
      <SignupCta copy={COPY.agent} />
      <SignupCta copy={COPY.model} />
    </section>
  );
}
