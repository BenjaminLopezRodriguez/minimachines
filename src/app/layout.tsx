import "~/styles/globals.css";
import "~/styles/site.css";

import { type Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";

import { TRPCReactProvider } from "~/trpc/react";

export const metadata: Metadata = {
  title: {
    default: "minimachines — Dedicated VMs for coding agents",
    template: "%s · minimachines",
  },
  description:
    "Cloud workspaces for coding agents. Install the Mini Machines CLI, connect your agent, and run builds, tests, and long jobs off your laptop.",
  icons: [{ rel: "icon", url: "/favicon.ico" }],
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

const geistSans = Geist({
  subsets: ["latin"],
  variable: "--font-geist-sans",
});

const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-geist-mono",
});

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable}`}>
      <body className="font-sans">
        <TRPCReactProvider>{children}</TRPCReactProvider>
      </body>
    </html>
  );
}
