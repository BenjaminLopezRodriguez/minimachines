"use client";

import {
  BookOpen,
  Bot,
  GitBranch,
  KeyRound,
  PanelsTopLeft,
  Server,
  Users,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const items = [
  { href: "/dashboard", label: "Bot", icon: Bot },
  {
    href: "/dashboard?mode=whiteboard",
    label: "Whiteboard",
    icon: PanelsTopLeft,
  },
  { href: "/dashboard/machines", label: "Machines", icon: Server },
  { href: "/dashboard/git", label: "Git workspace", icon: GitBranch },
  { href: "/dashboard/team", label: "Team", icon: Users },
  { href: "/dashboard/settings", label: "Keys & MCP", icon: KeyRound },
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
