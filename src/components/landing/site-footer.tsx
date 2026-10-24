import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="mm-site-footer mm-container">
      <div>
        <Link href="/" className="mm-wordmark">
          minimachines
        </Link>
        <p>More room for the work.</p>
      </div>
      <nav aria-label="Footer navigation">
        <Link href="/install">Install CLI</Link>
        <Link href="/docs">Documentation</Link>
        <a href="/sign-in">Sign in</a>
      </nav>
    </footer>
  );
}
