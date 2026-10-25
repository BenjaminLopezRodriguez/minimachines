"use client";
import { useState } from "react";
import { X } from "lucide-react";
import { FeedbackButton } from "./feedback-button";
export function SuggestionsBanner({
  surface = "other",
}: {
  surface?: "bot" | "whiteboard" | "machines" | "other";
}) {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;
  return (
    <aside className="mm-suggestions-banner" aria-label="Beta suggestions">
      <p>
        Help shape minimachines.{" "}
        <span>Have an idea or found a rough edge?</span>
      </p>
      <FeedbackButton surface={surface} label="Share a suggestion" />
      <button
        className="mm-suggestions-dismiss"
        onClick={() => setDismissed(true)}
        aria-label="Dismiss suggestions banner"
      >
        <X size={16} aria-hidden="true" />
      </button>
    </aside>
  );
}
