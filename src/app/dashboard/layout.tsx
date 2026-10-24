import { AuthKitProvider } from "@workos-inc/authkit-nextjs/components";
import { DashboardShell } from "~/components/dashboard/shell";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AuthKitProvider>
      <DashboardShell>{children}</DashboardShell>
    </AuthKitProvider>
  );
}
