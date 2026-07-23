import { withAuth } from "@workos-inc/authkit-nextjs";

const codeClass =
  "mt-2 overflow-x-auto rounded-md border border-border bg-background px-3 py-2 font-mono text-[12px] leading-relaxed";

const panelClass = "rounded-md border border-border p-4";

const mcpConfig = `{
  "mcpServers": {
    "minimachine": {
      "command": "npx",
      "args": ["-y", "@minimachines/mcp"]
    }
  }
}`;

export default async function DashboardDocsPage() {
  const { user } = await withAuth();
  const greeting = user?.firstName ? `, ${user.firstName}` : "";

  return (
    <div className="mx-auto max-w-2xl space-y-6 pb-20">
      <div>
        <h1 className="text-lg font-medium tracking-tight">Docs</h1>
        <p className="mt-1 max-w-xl text-sm text-muted-foreground">
          Welcome{greeting}. Install the CLI, log in, and drive machines from
          your terminal or an agent.
        </p>
      </div>

      {/* Install */}
      <section className={panelClass}>
        <h2 className="text-sm font-medium text-foreground">Install</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Run once with <code className="font-mono text-[13px]">pnpm</code>, or
          install globally.
        </p>
        <pre className={codeClass}>
          <code>pnpm dlx @minimachines/cli@latest</code>
        </pre>
        <pre className={codeClass}>
          <code>npm i -g @minimachines/cli</code>
        </pre>
      </section>

      {/* Login */}
      <section className={panelClass}>
        <h2 className="text-sm font-medium text-foreground">Login</h2>
        <pre className={codeClass}>
          <code>minimachines login</code>
        </pre>
        <p className="mt-2 text-sm text-muted-foreground">
          Opens your browser, you approve the request, and the key is saved to{" "}
          <code className="font-mono text-[13px]">
            ~/.config/minimachines/credentials.json
          </code>
          .
        </p>
      </section>

      {/* Use */}
      <section className={panelClass}>
        <h2 className="text-sm font-medium text-foreground">Use</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Create a machine from the dashboard{" "}
          <span className="font-medium text-foreground">New machine</span>{" "}
          action, or over the API:
        </p>
        <pre className={codeClass}>
          <code>{`curl -X POST https://www.minimachin.es/api/v1/machines \\
  -H "Authorization: Bearer mm_…"`}</code>
        </pre>
        <p className="mt-2 text-sm text-muted-foreground">
          Then open an interactive console:
        </p>
        <pre className={codeClass}>
          <code>minimachines run &lt;id&gt;</code>
        </pre>
        <p className="mt-2 text-sm text-muted-foreground">
          For non-interactive work, use the{" "}
          <code className="font-mono text-[13px]">exec</code> and file APIs under{" "}
          <code className="font-mono text-[13px]">
            /api/v1/machines/&lt;id&gt;
          </code>
          .
        </p>
      </section>

      {/* Skill */}
      <section className={panelClass}>
        <h2 className="text-sm font-medium text-foreground">Agent skill</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Agents can install the minimachine skill to provision and drive
          machines on their own. It teaches the device-flow login and the{" "}
          <code className="font-mono text-[13px]">/api/v1</code> endpoints.
        </p>
        <p className="mt-2 text-sm">
          <a
            href="/skills/minimachine/SKILL.md"
            download
            className="font-medium text-foreground underline underline-offset-4 hover:text-muted-foreground"
          >
            Download SKILL.md
          </a>
        </p>
      </section>

      {/* MCP */}
      <section className={panelClass}>
        <h2 className="text-sm font-medium text-foreground">MCP</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Add the minimachine MCP server to Cursor or Claude Desktop:
        </p>
        <pre className={codeClass}>
          <code>{mcpConfig}</code>
        </pre>
        <p className="mt-2 text-sm text-muted-foreground">
          The server reads your CLI credentials, so run{" "}
          <code className="font-mono text-[13px]">minimachines login</code>{" "}
          first.
        </p>
      </section>
    </div>
  );
}
