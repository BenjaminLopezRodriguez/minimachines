import "~/styles/globals.css";
import "~/styles/site.css";
import "~/styles/dashboard.css";
import "~/styles/git.css";
import "~/styles/bots.css";
import "~/styles/mobile.css";

import { type Metadata } from "next";
import { Figtree, Geist_Mono } from "next/font/google";

import { ThemeProvider } from "~/components/theme-provider";
import { themeScript } from "~/lib/theme";

import { TRPCReactProvider } from "~/trpc/react";

export const viewport = { width: "device-width", initialScale: 1, viewportFit: "cover" };

export const metadata: Metadata = {
  title: {
    default: "minimachines — Dedicated VMs for coding agents",
    template: "%s · minimachines",
  },
  description:
    "Cloud workspaces for coding agents. Install the Mini Machines CLI, connect your agent, and run builds, tests, and long jobs off your laptop.",
  icons: {
    icon: [{ url: "/icon.svg", type: "image/svg+xml" }],
    apple: "/apple-touch-icon.png",
  },
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "minimachines" },
  openGraph: {
    title: "minimachines",
    description:
      "Dedicated cloud VMs for the agents you already use. Heavy agentic compute, off your laptop.",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "minimachines",
    description:
      "Dedicated cloud VMs for the agents you already use. Heavy agentic compute, off your laptop.",
  },
};

const figtree = Figtree({
  subsets: ["latin"],
  variable: "--font-figtree",
});

const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-geist-mono",
});

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${figtree.variable} ${geistMono.variable}`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="font-sans">
        <ThemeProvider>
          <TRPCReactProvider>{children}</TRPCReactProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
