import { withAuth } from "@workos-inc/authkit-nextjs";
import { redirect } from "next/navigation";
import { FolderGit2, XCircle } from "lucide-react";

import { Button } from "~/components/ui/button";
import { deliverCode, displayName } from "~/server/data/invite-delivery";
import { acceptInvite, issueJoinCode, resolveInvite } from "~/server/data/projects";

const ERROR_COPY: Record<string, string> = {
  bad_code: "That code didn't match. Check it and try again.",
  too_many_tries: "Too many wrong codes. Send a new one.",
  code_required: "Enter the code we sent you.",
  send_failed: "We couldn't send a code. Ask the person who invited you to send a new invite.",
  invalid: "This invite is no longer valid.",
};

/** a***@acme.dev / +1•••••0123 — enough to recognise, not enough to harvest. */
function mask(channel: string, contact: string): string {
  if (channel === "email") {
    const [user = "", domain = ""] = contact.split("@");
    return `${user.slice(0, 1)}***@${domain}`;
  }
  return `${contact.slice(0, 2)}•••••${contact.slice(-4)}`;
}

async function sendCodeAction(formData: FormData) {
  "use server";
  const token = String(formData.get("token") ?? "");
  const { user } = await withAuth();
  if (!user?.id) redirect(`/join/${token}`);
  const issued = await issueJoinCode(token);
  const sent = issued ? await deliverCode(issued.invite, issued.code).catch(() => false) : false;
  redirect(`/join/${token}?${sent ? "sent=1" : "error=send_failed"}`);
}

async function joinAction(formData: FormData) {
  "use server";
  const token = String(formData.get("token") ?? "");
  const code = String(formData.get("code") ?? "") || undefined;
  // Re-check auth inside the action — never trust the render-time user.
  const { user } = await withAuth();
  if (!user?.id) redirect(`/join/${token}`);
  const result = await acceptInvite({ token, userId: user.id, code });
  if (result.ok) redirect("/dashboard");
  redirect(`/join/${token}?${code ? "sent=1&" : ""}error=${result.reason}`);
}

function Panel({ children }: { children: React.ReactNode }) {
  return <div className="mm-cursor-panel rounded-lg border p-6 sm:p-8">{children}</div>;
}

export default async function JoinPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ sent?: string; error?: string }>;
}) {
  // Gate lives in middleware — read-only withAuth here.
  await withAuth();
  const { token } = await params;
  const { sent, error } = await searchParams;
  const found = await resolveInvite(token);

  if (!found) {
    return (
      <div className="mx-auto max-w-md px-4 pb-20 pt-10">
        <Panel>
          <div className="flex flex-col items-center gap-3 text-center">
            <XCircle className="size-8 text-muted-foreground" aria-hidden />
            <h1 className="text-lg font-medium tracking-tight">Invite not valid</h1>
            <p className="text-sm text-muted-foreground">
              This link was already used, revoked, or has expired. Ask for a new invite.
            </p>
          </div>
        </Panel>
      </div>
    );
  }

  const { invite, project } = found;
  const inviter = (await displayName(invite.invitedBy)).name;
  const access = invite.role === "viewer" ? "view" : "work on";

  return (
    <div className="mx-auto max-w-md px-4 pb-20 pt-10">
      <Panel>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <FolderGit2 className="size-4" aria-hidden />
          <span>Project invite</span>
        </div>
        <h1 className="mt-4 text-lg font-medium tracking-tight">
          {inviter} invited you to {access} {project.name}
        </h1>
        {project.repoKey && (
          <p className="mt-1 font-mono text-sm text-muted-foreground">{project.repoKey}</p>
        )}
        {invite.note && <p className="mt-4 text-sm">“{invite.note}”</p>}
        <p className="mt-4 text-sm text-muted-foreground">
          {invite.role === "viewer"
            ? "You'll be able to see this project's machines and logs, but not run commands."
            : "You'll be able to run commands, move files and share apps on this project's machines."}
        </p>

        {error && (
          <p role="alert" className="mt-4 text-sm text-destructive">
            {ERROR_COPY[error] ?? ERROR_COPY.invalid}
          </p>
        )}

        {invite.codeRequired && !sent ? (
          <form action={sendCodeAction} className="mt-6">
            <input type="hidden" name="token" value={token} />
            <Button type="submit" className="w-full">
              Send a code to {mask(invite.channel, invite.contact)}
            </Button>
          </form>
        ) : (
          <form action={joinAction} className="mt-6 flex flex-col gap-3">
            <input type="hidden" name="token" value={token} />
            {invite.codeRequired && (
              <label className="flex flex-col gap-1 text-sm">
                Code sent to {mask(invite.channel, invite.contact)}
                <input
                  name="code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  pattern="[0-9]{6}"
                  maxLength={6}
                  required
                  className="mm-cursor-inset rounded-md px-3 py-2 font-mono text-lg tracking-[0.3em]"
                />
              </label>
            )}
            <Button type="submit" className="w-full">
              Join {project.name}
            </Button>
          </form>
        )}
      </Panel>
    </div>
  );
}
