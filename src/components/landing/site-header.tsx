import Link from "next/link";
import { signOut, withAuth } from "@workos-inc/authkit-nextjs";

import { Button } from "~/components/ui/button";

export async function SiteHeader() {
  const { user } = await withAuth();

  return (
    <header className="absolute inset-x-0 top-0 z-20 border-b border-border/70 bg-background/75 backdrop-blur-md">
      <div className="mx-auto flex h-12 max-w-6xl items-center justify-between px-5 sm:px-8">
        <Link
          href="/"
          className="text-[13px] font-medium tracking-tight text-foreground"
        >
          minimachines
        </Link>
        <nav className="flex items-center gap-1 sm:gap-1.5">
          <a
            href="#how"
            className="hidden rounded-md px-2.5 py-1.5 text-[13px] text-muted-foreground transition-colors hover:bg-black/[0.04] hover:text-foreground sm:inline dark:hover:bg-white/[0.05]"
          >
            How it works
          </a>
          <a
            href="#features"
            className="hidden rounded-md px-2.5 py-1.5 text-[13px] text-muted-foreground transition-colors hover:bg-black/[0.04] hover:text-foreground sm:inline dark:hover:bg-white/[0.05]"
          >
            Features
          </a>
          <a
            href="#waitlist"
            className="rounded-md px-2.5 py-1.5 text-[13px] text-muted-foreground transition-colors hover:bg-black/[0.04] hover:text-foreground dark:hover:bg-white/[0.05]"
          >
            Waitlist
          </a>
          {user ? (
            <>
              <Link
                href="/dashboard"
                className="rounded-md px-2.5 py-1.5 text-[13px] text-muted-foreground transition-colors hover:bg-black/[0.04] hover:text-foreground dark:hover:bg-white/[0.05]"
              >
                Dashboard
              </Link>
              <form
                action={async () => {
                  "use server";
                  await signOut();
                }}
              >
                <button
                  type="submit"
                  className="rounded-md px-2.5 py-1.5 text-[13px] text-muted-foreground transition-colors hover:bg-black/[0.04] hover:text-foreground dark:hover:bg-white/[0.05]"
                >
                  Sign out
                </button>
              </form>
            </>
          ) : (
            <Button
              asChild
              size="sm"
              className="ml-1.5 h-7 rounded-md px-2.5 text-[13px] font-medium"
            >
              <Link href="/sign-in">Sign in</Link>
            </Button>
          )}
        </nav>
      </div>
    </header>
  );
}
