import { AuthKitProvider } from "@workos-inc/authkit-nextjs/components";

export default function PagerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AuthKitProvider>{children}</AuthKitProvider>;
}
