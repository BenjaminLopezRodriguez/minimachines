"use client";
import { Analytics } from "@vercel/analytics/next";
import { analyticsAllowed } from "~/lib/analytics";
import { sanitizeAnalyticsUrl } from "~/lib/analytics-url";
export function ProductAnalytics() {
  return (
    <Analytics
      beforeSend={(event) => {
        if (!analyticsAllowed()) return null;
        const url = sanitizeAnalyticsUrl(event.url);
        return url ? { ...event, url } : null;
      }}
    />
  );
}
