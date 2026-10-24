"use client";

import { Check, Copy } from "lucide-react";
import { useEffect, useRef, useState } from "react";

export function CommandBlock({
  command,
  label = "command",
  disabled = false,
}: {
  command: string;
  label?: string;
  disabled?: boolean;
}) {
  const [feedback, setFeedback] = useState<{
    command: string;
    result: "copied" | "error";
  } | null>(null);
  const status = feedback?.command === command ? feedback.result : "idle";
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  async function copy() {
    try {
      await navigator.clipboard.writeText(command);
      setFeedback({ command, result: "copied" });
    } catch {
      setFeedback({ command, result: "error" });
    }
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setFeedback(null), 2500);
  }

  return (
    <div className="mm-command-wrap">
      <div className="mm-command" data-disabled={disabled || undefined}>
        <span className="mm-prompt" aria-hidden="true">
          $
        </span>
        <pre tabIndex={0} aria-label={label}>
          <code>{command}</code>
        </pre>
        <button
          type="button"
          className="mm-copy"
          onClick={copy}
          disabled={disabled}
          aria-label={`Copy ${label}`}
          title={disabled ? "Enter your machine ID first" : `Copy ${label}`}
        >
          {status === "copied" ? (
            <Check size={16} aria-hidden="true" />
          ) : (
            <Copy size={16} aria-hidden="true" />
          )}
        </button>
      </div>
      <span className="mm-copy-status" role="status">
        {status === "copied"
          ? "Copied to clipboard"
          : status === "error"
            ? "Couldn’t copy. Select the command and copy it manually."
            : ""}
      </span>
    </div>
  );
}
