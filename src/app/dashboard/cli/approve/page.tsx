import { withAuth } from "@workos-inc/authkit-nextjs";
import { redirect } from "next/navigation";
import {
  ArrowRight,
  CheckCircle2,
  Clock,
  ShieldCheck,
  Terminal,
  XCircle,
} from "lucide-react";

import { Button } from "~/components/ui/button";
import {
  approveDeviceCode,
  denyDeviceCode,
  getByUserCode,
} from "~/server/data/device-codes";

const BASE = "/dashboard/cli/approve";

// Human-readable reasons for a failed approve.
const ERROR_COPY: Record<string, string> = {
  not_found: "That code doesn't exist. Start login again in your terminal.",
  expired: "That code has expired. Start login again in your terminal.",
  already: "That code was already approved or denied.",
};

// --- server actions -------------------------------------------------------

async function approveAction(formData: FormData) {
  "use server";
  const raw = formData.get("user_code");
  const userCode = (typeof raw === "string" ? raw : "").trim();
  // Re-check auth inside the action — never trust the render-time user.
  const { user } = await withAuth();
  if (!user?.id) redirect(BASE);
  if (!userCode) redirect(BASE);

  const result = await approveDeviceCode({ userCode, userId: user.id });
  if (result.ok) {
    redirect(`${BASE}?user_code=${encodeURIComponent(userCode)}&result=approved`);
  }
  redirect(
    `${BASE}?user_code=${encodeURIComponent(userCode)}&result=error&reason=${result.error}`,
  );
}

async function denyAction(formData: FormData) {
  "use server";
  const raw = formData.get("user_code");
  const userCode = (typeof raw === "string" ? raw : "").trim();
  if (!userCode) redirect(BASE);
  await denyDeviceCode(userCode);
  redirect(`${BASE}?user_code=${encodeURIComponent(userCode)}&result=denied`);
}

// --- presentational helpers ----------------------------------------------

function Panel({ children }: { children: React.ReactNode }) {
  return (
    <div className="mm-cursor-panel rounded-lg border p-6 sm:p-8">{children}</div>
  );
}

function CodeBadge({ code }: { code: string }) {
  return (
    <div className="mm-cursor-inset rounded-md px-4 py-3 text-center">
      <span className="font-mono text-2xl font-semibold tracking-[0.2em] text-foreground">
        {code}
      </span>
    </div>
  );
}

// --- page -----------------------------------------------------------------

export default async function CliApprovePage({
  searchParams,
}: {
  searchParams: Promise<{
    user_code?: string;
    result?: string;
    reason?: string;
  }>;
}) {
  // Gate lives in middleware — read-only withAuth here (never ensureSignedIn
  // in an RSC: it writes a cookie → 500).
  const { user } = await withAuth();
  const { user_code, result, reason } = await searchParams;
  const userCode = user_code?.trim() ?? "";

  const heading = (
    <div className="flex items-center gap-2 text-sm text-muted-foreground">
      <Terminal className="size-4" aria-hidden />
      <span>Terminal login</span>
    </div>
  );

  // 1. Terminal outcome after an action ------------------------------------
  if (result === "approved") {
    return (
      <div className="mx-auto max-w-md pb-20 pt-10">
        <Panel>
          {heading}
          <div className="mt-6 flex flex-col items-center gap-3 text-center">
            <CheckCircle2 className="size-8 text-emerald-500" aria-hidden />
            <h1 className="text-lg font-medium tracking-tight">Approved</h1>
            <p className="text-sm text-muted-foreground">
              Return to your terminal — it will finish signing in automatically.
              You can close this tab.
            </p>
          </div>
        </Panel>
      </div>
    );
  }

  if (result === "denied") {
    return (
      <div className="mx-auto max-w-md pb-20 pt-10">
        <Panel>
          {heading}
          <div className="mt-6 flex flex-col items-center gap-3 text-center">
            <XCircle className="size-8 text-muted-foreground" aria-hidden />
            <h1 className="text-lg font-medium tracking-tight">Denied</h1>
            <p className="text-sm text-muted-foreground">
              This login request was rejected. Nothing was authorized.
            </p>
          </div>
        </Panel>
      </div>
    );
  }

  if (result === "error") {
    return (
      <div className="mx-auto max-w-md pb-20 pt-10">
        <Panel>
          {heading}
          <div className="mt-6 flex flex-col items-center gap-3 text-center">
            <XCircle className="size-8 text-destructive" aria-hidden />
            <h1 className="text-lg font-medium tracking-tight">
              Couldn&apos;t approve
            </h1>
            <p className="text-sm text-muted-foreground">
              {ERROR_COPY[reason ?? ""] ??
                "Something went wrong. Start login again in your terminal."}
            </p>
          </div>
        </Panel>
      </div>
    );
  }

  // 2. No code yet — prompt for one ----------------------------------------
  if (!userCode) {
    return (
      <div className="mx-auto max-w-md pb-20 pt-10">
        <Panel>
          {heading}
          <h1 className="mt-4 text-lg font-medium tracking-tight">
            Authorize a device
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Enter the code shown in your terminal to approve it.
          </p>
          <form action={BASE} method="get" className="mt-6 flex flex-col gap-2 sm:flex-row">
            <input
              name="user_code"
              required
              autoFocus
              maxLength={9}
              placeholder="XXXX-XXXX"
              autoComplete="off"
              spellCheck={false}
              className="border-input flex h-10 w-full min-w-0 rounded-md border bg-transparent px-3 py-1 text-center font-mono text-base uppercase tracking-[0.2em] shadow-xs outline-none transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]"
            />
            <Button type="submit" className="h-10">
              Continue
              <ArrowRight className="size-4" aria-hidden />
            </Button>
          </form>
        </Panel>
      </div>
    );
  }

  // 3. Look up the code and show its state ---------------------------------
  const row = await getByUserCode(userCode);

  const restartHint = (
    <p className="text-sm text-muted-foreground">
      Start login again in your terminal to get a fresh code.
    </p>
  );

  if (!row || row.expired || row.consumed) {
    const title = !row
      ? "Code not found"
      : row.expired
        ? "Code expired"
        : "Code already used";
    const Icon = row?.expired ? Clock : XCircle;
    return (
      <div className="mx-auto max-w-md pb-20 pt-10">
        <Panel>
          {heading}
          <div className="mt-6 flex flex-col items-center gap-3 text-center">
            <Icon className="size-8 text-muted-foreground" aria-hidden />
            <h1 className="text-lg font-medium tracking-tight">{title}</h1>
            {restartHint}
          </div>
        </Panel>
      </div>
    );
  }

  // Approved but the CLI hasn't polled yet.
  if (row.approved) {
    return (
      <div className="mx-auto max-w-md pb-20 pt-10">
        <Panel>
          {heading}
          <div className="mt-6 flex flex-col items-center gap-3 text-center">
            <CheckCircle2 className="size-8 text-emerald-500" aria-hidden />
            <h1 className="text-lg font-medium tracking-tight">
              Already approved
            </h1>
            <p className="text-sm text-muted-foreground">
              Return to your terminal — it will finish signing in automatically.
            </p>
          </div>
        </Panel>
      </div>
    );
  }

  // 4. Pending — the real approval decision --------------------------------
  return (
    <div className="mx-auto max-w-md pb-20 pt-10">
      <Panel>
        {heading}
        <h1 className="mt-4 text-lg font-medium tracking-tight">
          Approve terminal login?
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          A device is requesting access to your minimachines account. Approve
          only if this code matches the one in your terminal.
        </p>

        <div className="mt-5">
          <CodeBadge code={row.userCode} />
        </div>

        <div className="mt-5 flex items-start gap-2 rounded-md border border-border p-3 text-xs text-muted-foreground">
          <ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>
            Approving grants the device a key scoped to{" "}
            <span className="text-foreground">
              {user?.email ?? "your account"}
            </span>
            . You can revoke it any time in Settings.
          </span>
        </div>

        <div className="mt-6 flex flex-col gap-2 sm:flex-row">
          <form action={approveAction} className="sm:flex-1">
            <input type="hidden" name="user_code" value={row.userCode} />
            <Button type="submit" className="w-full">
              <CheckCircle2 className="size-4" aria-hidden />
              Approve
            </Button>
          </form>
          <form action={denyAction} className="sm:flex-1">
            <input type="hidden" name="user_code" value={row.userCode} />
            <Button type="submit" variant="outline" className="w-full">
              <XCircle className="size-4" aria-hidden />
              Deny
            </Button>
          </form>
        </div>
      </Panel>
    </div>
  );
}
