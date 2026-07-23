"use client";

import { Loader2 } from "lucide-react";
import { useState } from "react";

import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { api } from "~/trpc/react";

// CTA for agentic-coding companies to request being added to the platform.
// Deliberately lighter than the waitlist form (no react-hook-form) — a button
// that reveals three fields and posts to partners.request.
export function PartnerCta() {
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
    request.mutate({ company, email, agentName: agentName || undefined, website });
  };

  return (
    <section className="mx-auto w-full max-w-2xl px-6 py-16 text-center">
      <h2 className="text-xl font-medium tracking-tight text-foreground">
        Building a coding agent?
      </h2>
      <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
        Run it on minimachines. Request to add your agent to the platform.
      </p>

      {done ? (
        <p className="mt-6 text-sm text-foreground" role="status">
          Thanks — we&apos;ll be in touch about adding {company}.
        </p>
      ) : !open ? (
        <Button className="mt-6" onClick={() => setOpen(true)}>
          Add your agent
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
            aria-label="Agent or product name (optional)"
            placeholder="Agent / product name (optional)"
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
    </section>
  );
}
