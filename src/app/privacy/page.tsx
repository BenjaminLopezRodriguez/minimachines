import Link from "next/link";
import { AnalyticsPreferences } from "~/components/analytics/preferences";
export const metadata = { title: "Beta privacy and data" };
export default function PrivacyPage() {
  return (
    <main className="mm-beta-page">
      <Link href="/">← minimachines</Link>
      <h1>Your data during the beta.</h1>
      <p>
        We store your email, verification and access status, testing
        preferences, and any feedback you submit to run the early-access
        program. Feedback and application details are visible to authorized beta
        administrators.
      </p>
      <h2>Product analytics</h2>
      <p>
        We use Vercel Web Analytics to understand page traffic and product
        actions such as joining the beta, sending a message, and using
        whiteboard history. Analytics do not include your messages, drawings,
        files, command output, feedback text, email address, or credentials.
        Automatic interaction capture and session replay are disabled.
      </p>
      <p>
        You can turn off analytics on this browser and still use the product.
        You can change your choice below.
      </p>
      <AnalyticsPreferences />
      <h2>Whiteboard history</h2>
      <p>
        Personal whiteboard drafts and their latest 120 edits are stored in this
        browser. Clearing browser data removes them. Project whiteboards use a
        separate shared project room.
      </p>
      <h2>Testing preferences and requests</h2>
      <p>
        Interview participation is optional. You can update your preference on
        the <Link href="/beta">beta page</Link>. To request removal of a beta
        application or feedback, use the in-app feedback form and choose
        “Testing experience.”
      </p>
      <p>
        This notice describes the beta data flow. It does not replace any
        applicable service terms.
      </p>
    </main>
  );
}
