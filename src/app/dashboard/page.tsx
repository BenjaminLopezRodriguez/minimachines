import { withAuth } from "@workos-inc/authkit-nextjs";
import Link from "next/link";
import { BlankWhiteboard } from "~/components/dashboard/blank-whiteboard";
import { MessengerDashboard } from "~/components/dashboard/messenger";
import { LiveWhiteboard } from "~/components/dashboard/live-whiteboard";
import { listProjects, getRole } from "~/server/data/projects";
import { blobEnabled } from "~/server/data/project-blobs";
import { roomAccess, roomToken, syncEnabled } from "~/server/data/sync-token";

async function refreshToken(projectId: string) {
  "use server";
  const { user } = await withAuth();
  const role = user?.id ? await getRole(projectId, user.id) : null;
  if (!user || !role) throw new Error("Project access is required");
  return roomToken(projectId, user.id, role);
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string; project?: string }>;
}) {
  const query = await searchParams;
  const mode = query.mode === "whiteboard" ? "whiteboard" : "bot";
  if (mode === "bot") return <MessengerDashboard mode="bot" />;
  const { user } = await withAuth();
  if (!query.project)
    return (
      <MessengerDashboard
        mode="whiteboard"
        whiteboard={<BlankWhiteboard owner={user?.id ?? "guest"} />}
      />
    );
  const projects = user ? await listProjects(user.id) : [];
  const project = projects.find((p) => p.id === query.project);
  const available = Boolean(user && project && syncEnabled());
  return (
    <MessengerDashboard
      mode="whiteboard"
      whiteboard={
        <div className="mm-whiteboard-mode">
          <div className="mm-whiteboard-toolbar">
            <div>
              <h1>Whiteboard</h1>
              <p>A shared space to sketch what comes next.</p>
            </div>
            {projects.length > 0 && (
              <form action="/dashboard" method="get">
                <input type="hidden" name="mode" value="whiteboard" />
                <label className="sr-only" htmlFor="board-project">
                  Project
                </label>
                <select
                  id="board-project"
                  name="project"
                  defaultValue={project?.id}
                >
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
                <button className="mm-bot-button" type="submit">
                  Open
                </button>
              </form>
            )}
          </div>
          {available && user && project ? (
            <LiveWhiteboard
              key={project.id}
              access={roomAccess(
                project.id,
                user.id,
                project.role as "owner" | "member" | "viewer",
              )}
              name={user.firstName ?? "You"}
              files={blobEnabled() ? `/p/${project.id}/blobs` : null}
              refreshToken={refreshToken.bind(null, project.id)}
            />
          ) : (
            <div className="mm-board-notice">
              <h2>
                {project
                  ? "Your whiteboard is waiting"
                  : "Bring your first project"}
              </h2>
              <p>
                {project
                  ? "Live whiteboards need a connected sync service. Follow the setup guide to connect this workspace."
                  : "Connect a project with the CLI to sketch ideas and share a whiteboard with your team."}
              </p>
              <Link href="/dashboard/docs">Open setup guide →</Link>
            </div>
          )}
        </div>
      }
    />
  );
}
