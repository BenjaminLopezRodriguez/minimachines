"use client";

import {
  ArrowUp,
  ArrowUpRight,
  Code2,
  Lightbulb,
  ListChecks,
  PenLine,
} from "lucide-react";

const suggestions = [
  { text: "Help me think through an idea", icon: Lightbulb },
  { text: "Make a plan for my project", icon: ListChecks },
  { text: "Help me fix a bug", icon: Code2 },
  { text: "Turn my notes into a first draft", icon: PenLine },
];

export function ChatWelcome({
  onChoose,
}: {
  onChoose: (prompt: string) => void;
}) {
  return (
    <div className="mm-chat-welcome">
      <h1>What can I help with?</h1>
      <div className="mm-chat-suggestions" aria-label="Suggested prompts">
        {suggestions.map(({ text, icon: Icon }) => (
          <button key={text} type="button" onClick={() => onChoose(text)}>
            <Icon size={18} aria-hidden="true" />
            <span>{text}</span>
            <ArrowUpRight size={16} aria-hidden="true" />
          </button>
        ))}
      </div>
    </div>
  );
}

export function ChatComposer({
  draft,
  onChange,
  onSubmit,
  disabled = false,
  sending = false,
  label = "Message your bot",
}: {
  draft: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  disabled?: boolean;
  sending?: boolean;
  label?: string;
}) {
  return (
    <form
      className="mm-bot-composer mm-chat-composer"
      onSubmit={(e) => {
        e.preventDefault();
        if (!disabled && !sending && draft.trim()) onSubmit();
      }}
    >
      <label className="sr-only" htmlFor="bot-message">
        {label}
      </label>
      <textarea
        id="bot-message"
        value={draft}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
            // A touch keyboard keeps Enter available for paragraphs.
            if (matchMedia("(pointer: coarse)").matches) return;
            e.preventDefault();
            if (!disabled && !sending && draft.trim()) onSubmit();
          }
        }}
        placeholder="What can I help with today?"
        rows={2}
        maxLength={4000}
        disabled={disabled || sending}
      />
      <div>
        <span>
          {draft.length > 3500
            ? `${draft.length.toLocaleString()} / 4,000`
            : ""}
        </span>
        <button
          type="submit"
          aria-label={sending ? "Waiting for reply" : "Send message"}
          disabled={!draft.trim() || disabled || sending}
        >
          <ArrowUp size={24} strokeWidth={2.2} aria-hidden="true" />
        </button>
      </div>
    </form>
  );
}
