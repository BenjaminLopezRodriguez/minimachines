/** Only product routes and known campaign labels reach analytics. Never send tokens or IDs. */
export function sanitizeAnalyticsUrl(value: string): string | null {
  try {
    const url = new URL(value);
    if (/^\/(auth|join|pager|m|api|sign-in|sign-up)(\/|$)/.test(url.pathname))
      return null;
    const source = url.searchParams.get("utm_source");
    const campaign = url.searchParams.get("utm_campaign");
    url.search = "";
    url.hash = "";
    url.pathname = url.pathname
      .replace(/^\/p\/[^/]+/, "/p/project")
      .replace(/^\/s\/[^/]+/, "/s/shared");
    if (
      source &&
      ["linkedin", "github", "referral", "community", "email"].includes(source)
    )
      url.searchParams.set("utm_source", source);
    if (campaign && /^beta-[0-9]{2}$/.test(campaign))
      url.searchParams.set("utm_campaign", campaign);
    return url.toString();
  } catch {
    return null;
  }
}
