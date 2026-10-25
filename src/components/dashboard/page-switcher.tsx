"use client";

import {
  BookOpen,
  Bot,
  Check,
  ChevronDown,
  GitBranch,
  KeyRound,
  LogOut,
  Server,
  Terminal,
  Users,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { BrandMark } from "~/components/brand-mark";
import { signOutAction } from "./actions";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";

const pages = [
  { href: "/dashboard", label: "Machines", icon: Server },
  { href: "/dashboard/git", label: "Git workspace", icon: GitBranch },
  { href: "/bots", label: "Bots", icon: Bot },
  { href: "/dashboard/team", label: "Team", icon: Users },
  { href: "/dashboard/settings", label: "Keys & MCP", icon: KeyRound },
  { href: "/dashboard/docs", label: "Setup & docs", icon: BookOpen },
];

export function PageSwitcher({
  title,
  brand = false,
  desktopContent,
}: {
  title: string;
  brand?: boolean;
  desktopContent?: ReactNode;
}) {
  const pathname = usePathname();
  return (
    <>
      <span className="mm-desktop-page-title">{desktopContent ?? title}</span>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            className="mm-page-switcher"
            aria-label={`Switch page: ${title}`}
          >
            {brand && <BrandMark className="mm-brand-mark" />}
            <span>{title}</span>
            <ChevronDown size={18} aria-hidden="true" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="start"
          sideOffset={8}
          className="mm-page-menu"
        >
          {pages.map(({ href, label, icon: Icon }) => {
            const current = pathname === href || title === label;
            return (
              <DropdownMenuItem key={href} asChild>
                <Link
                  href={href}
                  prefetch={false}
                  aria-current={current ? "page" : undefined}
                >
                  <Icon size={19} aria-hidden="true" />
                  {label}
                  {current && (
                    <Check
                      className="mm-page-check"
                      size={16}
                      aria-hidden="true"
                    />
                  )}
                </Link>
              </DropdownMenuItem>
            );
          })}
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <Link href="/install">
              <Terminal size={19} aria-hidden="true" />
              Install the CLI
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => void signOutAction()}>
            <LogOut size={19} aria-hidden="true" />
            Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}
