import { createHash } from "node:crypto";

import { get, put } from "@vercel/blob";

import { env } from "~/env";

/** Vercel Functions accept request bodies up to 4.5 MB; stay under it. */
export const MAX_BLOB_BYTES = 4 * 1024 * 1024;
export const SHA = /^[0-9a-f]{64}$/;

export function blobEnabled(): boolean {
  return Boolean(env.BLOB_READ_WRITE_TOKEN ?? env.BLOB_STORE_ID);
}

const pathFor = (projectId: string, sha: string) => `projects/${projectId}/${sha}`;

/**
 * Store bytes for a project, addressed by their sha256: the same file is
 * stored once, and uploading it again is a harmless overwrite of identical bytes.
 */
export async function putProjectBlob(projectId: string, bytes: Uint8Array, contentType: string) {
  if (bytes.byteLength > MAX_BLOB_BYTES) throw new Error(`Files over ${MAX_BLOB_BYTES / 1024 / 1024} MB aren't shared yet`);
  const sha = createHash("sha256").update(bytes).digest("hex");
  await put(pathFor(projectId, sha), Buffer.from(bytes), {
    access: "private",
    contentType,
    addRandomSuffix: false,
    allowOverwrite: true,
  });
  return { sha, size: bytes.byteLength, contentType };
}

/** Stream a project blob. The caller has already checked the reader is in the project. */
export async function projectBlobResponse(projectId: string, sha: string): Promise<Response> {
  if (!SHA.test(sha)) return new Response("Not found", { status: 404 });
  const res = await get(pathFor(projectId, sha), { access: "private" });
  if (res?.statusCode !== 200) return new Response("Not found", { status: 404 });
  return new Response(res.stream, {
    headers: {
      "content-type": res.blob.contentType,
      // No content-length: Blob compresses some types in transit and then reports size 0;
      // the stream here is already decoded, so let it go out chunked.
      // Content-addressed: the bytes behind a sha never change. Private: never in a shared cache.
      "cache-control": "private, max-age=31536000, immutable",
      "x-content-type-options": "nosniff",
      // Never runs as a page on our origin, whatever the bytes are.
      "content-security-policy": "default-src 'none'; img-src 'self' data:; media-src 'self'; style-src 'unsafe-inline'; sandbox",
    },
  });
}

/** Content types a browser may render inline from our origin; anything else downloads. */
export function safeType(raw: string | null): string {
  const t = (raw ?? "").split(";")[0]!.trim().toLowerCase();
  return /^(image\/(png|jpe?g|gif|webp|avif)|application\/pdf|font\/woff2?|audio\/[\w.+-]+|video\/[\w.+-]+)$/.test(t) ? t : "application/octet-stream";
}

/** Shared upload handler: role check is the caller's, size/type checks are here. */
export async function uploadFromRequest(projectId: string, request: Request): Promise<Response> {
  if (!blobEnabled()) return Response.json({ error: { code: "storage_disabled", message: "File storage is not configured on this server" } }, { status: 503 });
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > MAX_BLOB_BYTES) return Response.json({ error: { code: "too_large", message: "Files over 4 MB aren't shared yet" } }, { status: 413 });
  const bytes = new Uint8Array(await request.arrayBuffer());
  if (!bytes.byteLength) return Response.json({ error: { code: "empty", message: "Empty upload" } }, { status: 400 });
  if (bytes.byteLength > MAX_BLOB_BYTES) return Response.json({ error: { code: "too_large", message: "Files over 4 MB aren't shared yet" } }, { status: 413 });
  const type = new URL(request.url).searchParams.get("type") ?? request.headers.get("content-type");
  return Response.json(await putProjectBlob(projectId, bytes, safeType(type)), { status: 201 });
}
