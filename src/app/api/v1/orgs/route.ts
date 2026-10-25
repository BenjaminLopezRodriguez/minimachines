import { isApiAuth, requireApiKey } from "~/server/api/v1/auth";
import { jsonOk } from "~/server/api/v1/respond";
import { displayName } from "~/server/data/invite-delivery";
import { listColleagues, listOrgs } from "~/server/data/orgs";

/** Your teams, and the teammates (with accounts) `mm people` can add directly. */
export async function GET(request: Request) {
  const auth = await requireApiKey(request);
  if (!isApiAuth(auth)) return auth;
  const [teams, colleagues] = await Promise.all([listOrgs(auth.userId), listColleagues(auth.userId)]);
  const teammates = await Promise.all(
    colleagues.map(async (c) => ({ userId: c.userId, team: c.orgName, ...(await displayName(c.userId)) })),
  );
  return jsonOk({ teams, teammates });
}
