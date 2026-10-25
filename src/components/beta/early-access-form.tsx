"use client";
import Link from "next/link";
import { trackProduct } from "~/lib/analytics";
import { useState } from "react";
import { api } from "~/trpc/react";
export function EarlyAccessForm() {
  const [email, setEmail] = useState("");
  const [consent, setConsent] = useState(false);
  const join = api.waitlist.join.useMutation({
    onSuccess: () => trackProduct("early_access_joined"),
  });
  if (join.isSuccess)
    return (
      <div className="mm-beta-success" role="status">
        <h2>You’re on the early-access list.</h2>
        <p>
          Next, verify your account so we can consider you for a testing cohort.
          Access opens in small batches.
        </p>
        <Link className="mm-gloss mm-gloss-primary" href="/sign-up">
          Verify my account →
        </Link>
        <p className="mm-beta-fine">
          Already have an account? <Link href="/sign-in">Sign in</Link>
        </p>
      </div>
    );
  return (
    <form
      className="mm-beta-form"
      onSubmit={(e) => {
        e.preventDefault();
        const form = new FormData(e.currentTarget);
        join.mutate({
          email,
          feedbackConsent: consent,
          website:
            typeof form.get("website") === "string"
              ? (form.get("website") as string)
              : "",
        });
      }}
    >
      <label htmlFor="early-email">Email address</label>
      <input
        className="mm-beta-input"
        id="early-email"
        type="email"
        autoComplete="email"
        required
        maxLength={320}
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="you@company.com"
        disabled={join.isPending}
      />
      <input
        name="website"
        className="mm-beta-honeypot"
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
      />
      <label className="mm-beta-check">
        <input
          type="checkbox"
          checked={consent}
          onChange={(e) => setConsent(e.target.checked)}
        />
        I’m open to a short feedback conversation while testing.
      </label>
      {join.error && (
        <p className="mm-beta-error" role="alert">
          {join.error.message}
        </p>
      )}
      <button className="mm-gloss mm-gloss-primary" disabled={join.isPending}>
        {join.isPending ? "Joining…" : "Join early access"}
      </button>
      <p className="mm-beta-fine">
        We’ll use your email for early-access updates. Joining the list doesn’t
        start compute or incur charges.{" "}
        <Link href="/privacy">How we handle your data</Link>
      </p>
    </form>
  );
}
