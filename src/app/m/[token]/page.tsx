import Link from "next/link";
import { resolveReplyToken } from "~/server/data/pager";
import { ReplyForm } from "./reply-form";
import { StatusFeed } from "./status-feed";

type Props = {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ sent?: string }>;
};
export default async function ReplyPage({ params, searchParams }: Props) {
  const { token } = await params;
  const { sent } = await searchParams;
  if (sent === "1")
    return (
      <main className="mm-baton-page">
        <span className="mm-baton-label">Baton</span>
        <h1>Reply sent.</h1>
        <p className="mm-baton-lead">
          Your answer is saved. The waiting agent can pick up where it left off.
        </p>
        <StatusFeed token={token} />
      </main>
    );
  const event = await resolveReplyToken(token);
  if (!event)
    return (
      <main className="mm-baton-page">
        <span className="mm-baton-label">Baton</span>
        <h1>This link is no longer active.</h1>
        <p className="mm-baton-lead">
          It was already answered or expired. Check your latest email for a new
          request.
        </p>
        <Link href="/dashboard" className="mm-bot-button">
          Open your workspace
        </Link>
      </main>
    );
  return (
    <main className="mm-baton-page">
      <span className="mm-baton-label">
        Baton · {event.kind === "question" ? "Decision needed" : "Agent update"}
      </span>
      <h1>
        {event.kind === "question"
          ? "Your agent needs a hand."
          : "An update from your agent."}
      </h1>
      <blockquote className="mm-baton-question">{event.text}</blockquote>
      <ReplyForm token={token} />
    </main>
  );
}
