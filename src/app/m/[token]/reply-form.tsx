"use client";

import { useActionState, useLayoutEffect, useRef, useState } from "react";
import { replyToAgent } from "./reply-action";

export function ReplyForm({ token }: { token: string }) {
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);
  // Keep text entered while this small page is still hydrating on a slow phone.
  useLayoutEffect(() => {
    const value = inputRef.current?.value;
    if (value) setDraft(value);
  }, []);
  const [state, action, pending] = useActionState(
    replyToAgent.bind(null, token),
    { error: "" },
  );
  return (
    <form action={action} className="mm-baton-form" aria-busy={pending}>
      <label htmlFor="baton-reply">Your answer</label>
      <textarea
        ref={inputRef}
        id="baton-reply"
        name="body"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        required
        readOnly={pending}
        maxLength={4000}
        rows={3}
        placeholder="Tell your agent what to do…"
        aria-describedby={
          state.error && !pending ? "baton-reply-error" : "baton-reply-hint"
        }
      />
      {state.error && !pending && (
        <p id="baton-reply-error" role="alert" className="mm-baton-error">
          {state.error}
        </p>
      )}
      <div className="mm-baton-send">
        <p id="baton-reply-hint">
          One reply hands the decision back to your agent.
        </p>
        <button type="submit" className="mm-bot-button" disabled={pending}>
          {pending ? "Sending…" : "Send reply"}
        </button>
      </div>
    </form>
  );
}
