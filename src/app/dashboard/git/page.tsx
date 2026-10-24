import type { Metadata } from "next";
import { GitWorkspace } from "~/components/dashboard/git-workspace";

export const metadata: Metadata = { title: "Git workspace" };
export default async function GitPage({
  searchParams,
}: {
  searchParams: Promise<{ machine?: string }>;
}) {
  return <GitWorkspace initialMachine={(await searchParams).machine} />;
}
