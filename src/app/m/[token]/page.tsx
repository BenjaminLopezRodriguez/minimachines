import { redirect } from "next/navigation";

import { resolveReplyToken, submitReply } from "~/server/data/pager";

type Props = {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ sent?: string }>;
};

const wrap: React.CSSProperties = {
  maxWidth: 480,
  margin: "0 auto",
  padding: 20,
  fontFamily: "system-ui, sans-serif",
};

export default async function ReplyPage({ params, searchParams }: Props) {
  const { token } = await params;
  const { sent } = await searchParams;

  if (sent === "1") {
    return (
      <main style={wrap}>
        <h2>Sent ✓</h2>
        <p>Your agent has your reply. You can close this.</p>
      </main>
    );
  }

  const event = await resolveReplyToken(token);
  if (!event) {
    return (
      <main style={wrap}>
        <h2>Link expired</h2>
        <p>This reply link was already used or has expired.</p>
      </main>
    );
  }

  async function reply(formData: FormData) {
    "use server";
    const bodyVal = formData.get("body");
    const text = (typeof bodyVal === "string" ? bodyVal : "").trim();
    if (!text) redirect(`/m/${token}`);
    const modelVal = formData.get("model");
    const model =
      (typeof modelVal === "string" ? modelVal.trim() : "") || undefined;
    const ok = await submitReply({ token, body: text, model });
    redirect(ok ? `/m/${token}?sent=1` : `/m/${token}`);
  }

  return (
    <main style={wrap}>
      <p style={{ opacity: 0.6, textTransform: "uppercase", fontSize: 12 }}>
        Agent {event.kind}
      </p>
      <blockquote
        style={{
          margin: "0 0 16px",
          padding: "12px 14px",
          background: "#f4f4f5",
          borderRadius: 8,
          whiteSpace: "pre-wrap",
        }}
      >
        {event.text}
      </blockquote>
      <form action={reply}>
        <textarea
          name="body"
          required
          autoFocus
          rows={5}
          placeholder="Reply to your agent…"
          style={{
            width: "100%",
            padding: 12,
            fontSize: 16,
            borderRadius: 8,
            border: "1px solid #d4d4d8",
            boxSizing: "border-box",
          }}
        />
        <button
          type="submit"
          style={{
            marginTop: 12,
            width: "100%",
            padding: 14,
            fontSize: 16,
            fontWeight: 600,
            color: "#fff",
            background: "#111",
            border: 0,
            borderRadius: 8,
          }}
        >
          Send
        </button>
      </form>
    </main>
  );
}
