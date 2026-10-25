"use client";
import Link from "next/link";
import { trackProduct } from "~/lib/analytics";
import { useState } from "react";
import { api, type RouterOutputs } from "~/trpc/react";
export function BetaApplication({ admin = false }: { admin?: boolean }) {
  const status = api.beta.status.useQuery();
  const utils = api.useUtils();
  const enroll = api.beta.enroll.useMutation({
    onSuccess: () => utils.beta.status.invalidate(),
  });
  if (status.isPending)
    return <p role="status">Loading your beta application…</p>;
  if (status.error)
    return (
      <p className="mm-beta-error" role="alert">
        {status.error.message}
      </p>
    );
  const entry = status.data;
  if (!entry)
    return (
      <div className="mm-beta-success">
        <h1>Join the beta testing group.</h1>
        <p>
          Your verified account helps us keep testing safe. We’ll review
          applications in small cohorts.
        </p>
        <button
          className="mm-gloss mm-gloss-primary"
          disabled={enroll.isPending}
          onClick={() => enroll.mutate()}
        >
          Join the beta
        </button>
        {enroll.error && <p role="alert">{enroll.error.message}</p>}
      </div>
    );
  return (
    <div>
      <h1>
        {entry.status === "approved"
          ? "You’re in the beta."
          : entry.status === "revoked"
            ? "Your beta access is paused."
            : "You’re in the testing queue."}
      </h1>
      <p className="mm-beta-lead">
        {entry.status === "approved"
          ? "Try one real project and tell us what worked, what didn’t, and whether you’d use it again."
          : "We’re bringing people in a few at a time. Tell us what you want to try so we can match you to a testing group."}
      </p>
      <ApplicationProfile key={entry.id} entry={entry} />
      {entry.status === "approved" && (
        <Link href="/dashboard" className="mm-gloss mm-gloss-primary">
          Open your workspace →
        </Link>
      )}
      {admin && (
        <p>
          <Link href="/dashboard/beta">Manage testers and feedback →</Link>
        </p>
      )}
    </div>
  );
}
function ApplicationProfile({
  entry,
}: {
  entry: NonNullable<RouterOutputs["beta"]["status"]>;
}) {
  const [role, setRole] = useState(entry.role ?? "");
  const [useCase, setUseCase] = useState(entry.useCase ?? "");
  const [consent, setConsent] = useState(entry.feedbackConsent);
  const save = api.beta.profile.useMutation({
    onSuccess: () => trackProduct("beta_profile_saved"),
  });
  return (
    <form
      className="mm-beta-form"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate({ role, useCase, feedbackConsent: consent });
      }}
    >
      <label htmlFor="beta-role">
        What best describes your work? <span>(optional)</span>
      </label>
      <input
        className="mm-beta-input"
        id="beta-role"
        value={role}
        onChange={(e) => setRole(e.target.value)}
        placeholder="Founder, developer, designer…"
        maxLength={80}
      />
      <label htmlFor="beta-usecase">
        What would you like to try? <span>(optional)</span>
      </label>
      <textarea
        className="mm-beta-input"
        id="beta-usecase"
        value={useCase}
        onChange={(e) => setUseCase(e.target.value)}
        rows={3}
        maxLength={1000}
        placeholder="A small project you already want to make progress on"
      />
      <label className="mm-beta-check">
        <input
          type="checkbox"
          checked={consent}
          onChange={(e) => setConsent(e.target.checked)}
        />
        You can contact me for a short feedback conversation.
      </label>
      <button className="mm-bot-button" disabled={save.isPending}>
        {save.isPending ? "Saving…" : "Save testing preferences"}
      </button>
      {save.isSuccess && <p role="status">Preferences saved.</p>}
      {save.error && (
        <p role="alert" className="mm-beta-error">
          {save.error.message}
        </p>
      )}
    </form>
  );
}
