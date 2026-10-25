"use server";

import { redirect } from "next/navigation";
import { submitReply } from "~/server/data/pager";

export async function replyToAgent(
  token: string,
  _previous: { error: string },
  formData: FormData,
): Promise<{ error: string }> {
  const value = formData.get("body");
  const body = typeof value === "string" ? value.trim() : "";
  if (!/^[a-f0-9]{48}$/.test(token))
    return {
      error:
        "This reply link isn’t valid. Open the link from your latest email.",
    };
  if (!body || body.length > 4000)
    return { error: "Add an answer up to 4,000 characters." };
  let sent = false;
  try {
    sent = await submitReply({ token, body });
  } catch {
    return {
      error: "Couldn’t send right now. Your answer is still here—try again.",
    };
  }
  if (!sent)
    return {
      error:
        "This link was already used or has expired. Open the latest email to check the request.",
    };
  redirect(`/m/${token}?sent=1`);
}
