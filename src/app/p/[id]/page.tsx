import { withAuth } from "@workos-inc/authkit-nextjs";
import { Lock } from "lucide-react";

import { Workspace } from "~/components/workspace/workspace";
import { displayName } from "~/server/data/invite-delivery";
import { projectMachine } from "~/server/data/machine-store";
import { getProject, getRole } from "~/server/data/projects";
import { roomAccess, roomToken, syncEnabled } from "~/server/data/sync-token";

export const dynamic = "force-dynamic";

/** Fresh room token for reconnects; re-checks membership every time. */
async function refreshToken(projectId: string): Promise<string> {
  "use server";
  const { user } = await withAuth();
  const role = user?.id ? await getRole(projectId, user.id) : null;
  if (!user?.id || !role) throw new Error("Not a member of this project");
  return roomToken(projectId, user.id, role);
}

function Notice({ title, body }: { title: string; body: string }) {
  return (
    <div className="mx-auto max-w-md px-4 pb-20 pt-16">
      <div className="mm-cursor-panel flex flex-col items-center gap-3 rounded-lg border p-8 text-center">
        <Lock className="size-7 text-muted-foreground" aria-hidden />
        <h1 className="text-lg font-medium tracking-tight">{title}</h1>
        <p className="text-sm text-muted-foreground">{body}</p>
      </div>
    </div>
  );
}

export default async function ProjectWorkspacePage({ params }: { params: Promise<{ id: string }> }) {
  // Gate lives in middleware — read-only withAuth here.
  const { user } = await withAuth();
  const { id } = await params;
  const role = user?.id && /^[0-9a-f-]{36}$/.test(id) ? await getRole(id, user.id) : null;
  if (!user?.id || !role) {
    return <Notice title="You're not in this project" body="Ask the owner to invite you; the invite link signs you in and brings you here." />;
  }
  if (!syncEnabled()) {
    return <Notice title="Live sync is off" body="This server has no sync room configured (SYNC_URL / SYNC_SECRET)." />;
  }
  const [project, machine, me] = await Promise.all([getProject(id), projectMachine(id), displayName(user.id)]);
  const access = roomAccess(id, user.id, role);
  return (
    <Workspace
      project={{ id, name: project?.name ?? "project", repoKey: project?.repoKey ?? null }}
      access={access}
      me={{ name: (user.firstName ?? "").trim() || me.name }}
      machine={machine ? { id: machine.id, name: machine.name, status: machine.status, appUrl: machine.appUrl ?? null, consoleUrl: machine.emulatorUrl ?? null } : null}
      refreshToken={refreshToken.bind(null, id)}
    />
  );
}
