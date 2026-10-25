import { BrandMark } from "~/components/brand-mark";
import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="mm-site-footer mm-container">
      <div>
        <Link href="/" className="mm-wordmark">
          <BrandMark className="mm-brand-mark" /> minimachines
        </Link>
        <p>A little room for your next idea.</p>
      </div>
      <nav aria-label="Footer navigation">
        <Link href="/install">Install CLI</Link>
        <Link href="/docs">Documentation</Link>
        <a href="/sign-in">Sign in</a>
      </nav>
    </footer>
  );
}
