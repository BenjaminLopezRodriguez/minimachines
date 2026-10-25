"use client";
import { track } from "@vercel/analytics";
export type ProductEvent =
  | "early_access_joined"
  | "beta_profile_saved"
  | "feedback_submitted"
  | "suggestions_opened"
  | "suggested_prompt_selected"
  | "bot_message_submitted"
  | "bot_reply_received"
  | "whiteboard_edited"
  | "whiteboard_history_browsed"
  | "whiteboard_edit_restored";
export function analyticsAllowed() {
  if (typeof window === "undefined") return false;
  if (
    navigator.doNotTrack === "1" ||
    (navigator as Navigator & { globalPrivacyControl?: boolean })
      .globalPrivacyControl
  )
    return false;
  try {
    return localStorage.getItem("mm-analytics-disabled") !== "true";
  } catch {
    return false;
  }
}
export function trackProduct(
  event: ProductEvent,
  surface?: "bot" | "whiteboard" | "machines" | "other",
) {
  if (!analyticsAllowed()) return;
  try {
    track(event, surface ? { surface } : undefined);
  } catch {
    /* Analytics never interrupts product actions. */
  }
}
