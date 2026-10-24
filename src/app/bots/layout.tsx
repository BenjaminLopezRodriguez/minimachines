import { PageSwitcher } from "~/components/dashboard/page-switcher";
import { BrandMark } from "~/components/brand-mark";
import { ThemeToggle } from "~/components/theme-toggle";
import type { Metadata } from "next";
import { withAuth } from "@workos-inc/authkit-nextjs";
import { AuthKitProvider } from "@workos-inc/authkit-nextjs/components";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export const metadata: Metadata = {
  title: "Bots — Conversations with your agents",
};
export default async function BotsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user } = await withAuth();
  if (!user) redirect("/sign-in");
  return (
    <AuthKitProvider>
      <div className="mm-bots-app">
        <a href="#bots-content" className="mm-bots-skip">
          Skip to conversation
        </a>
        <header className="mm-bots-header">
          <Link href="/bots" className="mm-bots-brand mm-bots-desktop-brand">
            <BrandMark className="mm-brand-mark" />
            bots<span>by minimachines</span>
          </Link>
          <h1 className="mm-bots-mobile-title">
            <PageSwitcher title="Bots" brand />
          </h1>
          <Link href="/dashboard" className="mm-bots-machines-link">
            <ArrowLeft size={14} />
            Machines
          </Link>
          <ThemeToggle />
          <span className="mm-bots-account">
            {user.firstName ?? user.email}
          </span>
        </header>
        {children}
      </div>
    </AuthKitProvider>
  );
}
