import { and, eq } from "drizzle-orm";
import type { GitRequest } from "~/lib/git";
import { db } from "~/server/db";
import { machines } from "~/server/db/schema";
import { gitWorker } from "~/server/git/worker";
import { machineAccess } from "./machine-store";
import { execSandbox, modalEnabled } from "./modal-driver";

const quote = (value: string) => `'${value.replace(/'/g, `'\\''`)}'`;

/** Ownership is checked before touching the sandbox; Git never runs on the web host. */
export async function machineGit<T = { message: string }>(
  id: string,
  ownerUserId: string,
  input: GitRequest,
): Promise<T> {
  const [machine] = await db
    .select({ status: machines.status, sandboxId: machines.sandboxId })
    .from(machines)
    .where(and(eq(machines.id, id), machineAccess(ownerUserId)))
    .limit(1);
  if (!machine) throw new Error("Machine not found");
  if (machine.status !== "running")
    throw new Error("Start the machine before using Git.");
  if (!machine.sandboxId || !modalEnabled())
    throw new Error(
      "Git requires a connected cloud machine. No simulated changes were made.",
    );
  const source = Buffer.from(gitWorker).toString("base64");
  const script = `python3 -c ${quote(`import base64; exec(base64.b64decode('${source}'))`)} ${quote(JSON.stringify(input))}`;
  const result = await execSandbox(machine.sandboxId, [
    "sh",
    "-c",
    `exec "$(command -v gosu || command -v su-exec)" agent sh -c ${quote(script)}`,
  ]);
  if (result.exitCode !== 0)
    throw new Error(
      "Git could not run. Ensure Git and Python 3 are installed in this machine.",
    );
  let response: { ok: boolean; data: T; error?: string };
  try {
    response = JSON.parse(result.stdout) as typeof response;
  } catch {
    throw new Error("The machine returned an invalid Git response.");
  }
  if (!response.ok) throw new Error(response.error ?? "Git operation failed.");
  return response.data;
}
