import { withAuth } from "@workos-inc/authkit-nextjs";
import { AuthKitProvider } from "@workos-inc/authkit-nextjs/components";
import { redirect } from "next/navigation";
import Link from "next/link";
import { BetaApplication } from "~/components/beta/application";
import { isBetaAdmin } from "~/server/data/beta";
export default async function BetaPage() {
  const { user } = await withAuth();
  if (!user) redirect("/sign-in");
  return (
    <AuthKitProvider>
      <main className="mm-beta-page">
        <Link href="/">← minimachines</Link>
        {!user.emailVerified ? (
          <div>
            <h1>Verify your email first.</h1>
            <p>Sign in again and complete the email verification step.</p>
            <Link href="/sign-in">Continue to sign in</Link>
          </div>
        ) : (
          <BetaApplication admin={isBetaAdmin(user.id)} />
        )}
      </main>
    </AuthKitProvider>
  );
}
