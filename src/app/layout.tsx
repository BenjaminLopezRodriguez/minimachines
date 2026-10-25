import "~/styles/globals.css";
import "@excalidraw/excalidraw/index.css";
import "~/styles/site.css";
import "~/styles/dashboard.css";
import "~/styles/git.css";
import "~/styles/bots.css";
import "~/styles/mobile.css";
import "~/styles/materials.css";
import "~/styles/landing.css";
import "~/styles/messenger.css";

import { type Metadata } from "next";
import { IBM_Plex_Sans, IBM_Plex_Mono } from "next/font/google";

import { ThemeProvider } from "~/components/theme-provider";
import { themeScript } from "~/lib/theme";

import { TRPCReactProvider } from "~/trpc/react";

export const viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export const metadata: Metadata = {
  title: {
    default: "minimachines — A little room for your next idea",
    template: "%s · minimachines",
  },
  description:
    "Give your coding agent a cloud workspace, share what it builds, and stay in the loop with the baton. Bring your next project to minimachines.",
  icons: {
    icon: [{ url: "/icon.svg", type: "image/svg+xml" }],
    apple: "/apple-touch-icon.png",
  },
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "minimachines" },
  openGraph: {
    title: "minimachines",
    description:
      "A cloud workspace for your coding agent. Bring an idea, share what it builds, and stay in the loop with the baton.",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "minimachines",
    description:
      "A cloud workspace for your coding agent. Bring an idea, share what it builds, and stay in the loop with the baton.",
  },
};

const plexSans = IBM_Plex_Sans({
  subsets: ["latin"],
  variable: "--font-plex-sans",
  display: "swap",
});

const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-plex-mono",
  display: "swap",
});

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${plexSans.variable} ${plexMono.variable}`}
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
