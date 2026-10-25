"use client";

import { trackProduct } from "~/lib/analytics";

import {
  ArrowUp,
  ArrowUpRight,
  Code2,
  Lightbulb,
  ListChecks,
  PenLine,
} from "lucide-react";
import { useLayoutEffect, useRef, type ReactNode } from "react";

const suggestions = [
  {
    text: "Help me think through an idea",
    title: "Think through",
    hint: "an idea I have",
    icon: Lightbulb,
  },
  {
    text: "Make a plan for my project",
    title: "Make a plan",
    hint: "for my project",
    icon: ListChecks,
  },
  {
    text: "Help me fix a bug",
    title: "Fix a bug",
    hint: "in my code",
    icon: Code2,
  },
  {
    text: "Turn my notes into a first draft",
    title: "Draft from notes",
    hint: "into a first version",
    icon: PenLine,
  },
];

export function ChatWelcome({ children }: { children?: ReactNode }) {
  return (
    <div className="mm-chat-welcome">
      <h1>What can I help with?</h1>
      {children}
    </div>
  );
}

export function ChatSuggestions({
  onChoose,
  layout = "chips",
}: {
  onChoose: (prompt: string) => void;
  layout?: "chips" | "list";
}) {
  const choose = (text: string) => {
    trackProduct("suggested_prompt_selected", "bot");
    onChoose(text);
  };
  if (layout === "list")
    return (
      <div className="mm-chat-suggestions" aria-label="Suggested prompts">
        {suggestions.map(({ text, icon: Icon }) => (
          <button key={text} type="button" onClick={() => choose(text)}>
            <Icon size={18} aria-hidden="true" />
            <span>{text}</span>
            <ArrowUpRight size={16} aria-hidden="true" />
          </button>
        ))}
      </div>
    );
  return (
    <div className="mm-chat-chips" aria-label="Suggested prompts">
      {suggestions.map(({ text, title, hint }) => (
        <button key={text} type="button" onClick={() => choose(text)}>
          <strong>{title}</strong>
          <span>{hint}</span>
        </button>
      ))}
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
  placeholder = "What can I help with today?",
}: {
  draft: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  disabled?: boolean;
  sending?: boolean;
  label?: string;
  placeholder?: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [draft]);
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
        ref={ref}
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
        placeholder={placeholder}
        rows={1}
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
          <ArrowUp size={20} strokeWidth={2.4} aria-hidden="true" />
        </button>
      </div>
    </form>
  );
}
