import { handleAuth } from "@workos-inc/authkit-nextjs";

import { enrollVerifiedUser } from "~/server/data/beta";

import { ensureEmailContact } from "~/server/data/pager";

export const GET = handleAuth({
  returnPathname: "/dashboard",
  onSuccess: async ({ user }) => {
    await enrollVerifiedUser(user);
    await ensureEmailContact(user);
  },
});
