import { batonStatus } from "~/server/data/pager";

type Ctx = { params: Promise<{ token: string }> };

/**
 * Feed for the reply page after it has been submitted. The unguessable reply
 * token is the capability — no session, because this is opened from a text
 * message on a phone that has never signed in.
 */
export async function GET(_request: Request, ctx: Ctx) {
  const { token } = await ctx.params;
  const status = await batonStatus(token);
  if (!status) {
    return Response.json({ error: "expired" }, { status: 404 });
  }
  return Response.json(status, {
    headers: { "cache-control": "no-store" },
  });
}
