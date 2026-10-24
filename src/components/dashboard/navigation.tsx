"use client";

import { BookOpen, KeyRound, Server } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const items = [
  { href: "/dashboard", label: "Machines", icon: Server },
  { href: "/dashboard/settings", label: "API keys", icon: KeyRound },
  { href: "/dashboard/docs", label: "Setup & docs", icon: BookOpen },
];

export function DashboardNavigation({ activePath }: { activePath?: string }) {
  const pathname = usePathname();
  return (
    <nav className="mm-dashboard-nav" aria-label="Workspace navigation">
      {items.map(({ href, label, icon: Icon }) => (
        <Link
          key={href}
          href={href}
          aria-current={(activePath ?? pathname) === href ? "page" : undefined}
        >
          <Icon size={18} strokeWidth={1.7} aria-hidden="true" />
          <span>{label}</span>
        </Link>
      ))}
    </nav>
  );
}
