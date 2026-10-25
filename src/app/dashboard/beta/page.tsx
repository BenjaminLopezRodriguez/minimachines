import { withAuth } from "@workos-inc/authkit-nextjs";
import { notFound } from "next/navigation";
import { isBetaAdmin } from "~/server/data/beta";
import { BetaAdmin } from "~/components/beta/admin";
export default async function BetaAdminPage() {
  const { user } = await withAuth();
  if (!user?.emailVerified || !isBetaAdmin(user.id)) notFound();
  return <BetaAdmin />;
}
