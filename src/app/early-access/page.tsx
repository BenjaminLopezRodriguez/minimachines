import { SiteHeader } from "~/components/landing/site-header";
import { SiteFooter } from "~/components/landing/site-footer";
import { EarlyAccessForm } from "~/components/beta/early-access-form";
export const metadata = { title: "Join the early-access beta" };
export default function EarlyAccessPage() {
  return (
    <div className="mm-site">
      <SiteHeader />
      <main className="mm-beta-page" id="main-content">
        <p className="mm-beta-label">minimachines · Early access</p>
        <h1>Help shape what comes next.</h1>
        <p className="mm-beta-lead">
          Bring a real project. Try a bot, sketch on a whiteboard, and tell us
          where the workflow gets in your way.
        </p>
        <EarlyAccessForm />
        <p className="mm-beta-fine">
          We’re inviting small groups so we can help each tester personally.
          You’ll need a verified account before beta access is approved.
        </p>
      </main>
      <SiteFooter />
    </div>
  );
}
