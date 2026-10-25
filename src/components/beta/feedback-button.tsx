"use client";
import { trackProduct } from "~/lib/analytics";
import { MessageCircle } from "lucide-react";
import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from "~/components/ui/dialog";
import { api } from "~/trpc/react";
export function FeedbackButton({
  surface = "other",
  label,
}: {
  surface?: "bot" | "whiteboard" | "machines" | "other";
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<"bug" | "idea" | "experience">(
    label ? "idea" : "experience",
  );
  const [message, setMessage] = useState("");
  const [rating, setRating] = useState("");
  const send = api.beta.feedback.useMutation({
    onSuccess: () => {
      setMessage("");
      trackProduct("feedback_submitted", surface);
    },
  });
  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        setOpen(value);
        if (value) trackProduct("suggestions_opened", surface);
        if (!value) send.reset();
      }}
    >
      <DialogTrigger asChild>
        <button
          className={`mm-beta-feedback-trigger${label ? "mm-beta-feedback-text" : ""}`}
          aria-label={label ?? "Send feedback"}
          title="Send feedback"
        >
          <MessageCircle size={18} aria-hidden="true" />
          {label && <span>{label}</span>}
        </button>
      </DialogTrigger>
      <DialogContent>
        <DialogTitle>How’s testing going?</DialogTitle>
        <DialogDescription>
          Tell us what you tried, what happened, and what you expected.
        </DialogDescription>
        {send.isSuccess ? (
          <p role="status">Thanks — your feedback is in our review queue.</p>
        ) : (
          <form
            className="mm-beta-form"
            onSubmit={(e) => {
              e.preventDefault();
              send.mutate({
                kind,
                message,
                surface,
                rating: rating ? Number(rating) : undefined,
              });
            }}
          >
            <label htmlFor="feedback-kind">Feedback type</label>
            <select
              className="mm-beta-input"
              id="feedback-kind"
              value={kind}
              onChange={(e) => setKind(e.target.value as typeof kind)}
            >
              <option value="experience">Testing experience</option>
              <option value="bug">Something broke</option>
              <option value="idea">An idea</option>
            </select>
            <label htmlFor="feedback-message">What should we know?</label>
            <textarea
              className="mm-beta-input"
              id="feedback-message"
              rows={4}
              required
              minLength={10}
              maxLength={3000}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
            />
            <p className="mm-beta-fine">
              Don’t include passwords, API keys, or private project content.
            </p>
            <label htmlFor="feedback-rating">
              How useful was this session? <span>(optional)</span>
            </label>
            <select
              className="mm-beta-input"
              id="feedback-rating"
              value={rating}
              onChange={(e) => setRating(e.target.value)}
            >
              <option value="">Skip rating</option>
              {[1, 2, 3, 4, 5].map((n) => (
                <option key={n} value={n}>
                  {n} / 5
                </option>
              ))}
            </select>
            <button className="mm-bot-button" disabled={send.isPending}>
              {send.isPending ? "Sending…" : "Send feedback"}
            </button>
            {send.error && (
              <p role="alert" className="mm-beta-error">
                {send.error.message}
              </p>
            )}
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
