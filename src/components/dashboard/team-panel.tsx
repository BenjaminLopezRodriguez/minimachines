"use client";

import { useState } from "react";
import { FolderGit2, Mail, Phone, Trash2, UserPlus, Users } from "lucide-react";

import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { api, type RouterOutputs } from "~/trpc/react";

import { PageSwitcher } from "./page-switcher";

type Team = RouterOutputs["orgs"]["list"][number];

const select =
  "border-border bg-background h-9 rounded-md border px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

/** "ana@acme.dev, +14155550123" → contacts; anything else is reported back, not dropped. */
function parseContacts(raw: string) {
  const contacts: ({ email: string } | { phone: string })[] = [];
  const bad: string[] = [];
  for (const part of raw.split(/[\s,;]+/).filter(Boolean)) {
    if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(part)) contacts.push({ email: part });
    else if (/^\+[1-9]\d{6,14}$/.test(part.replace(/[\s().-]/g, ""))) contacts.push({ phone: part.replace(/[\s().-]/g, "") });
    else bad.push(part);
  }
  return { contacts, bad };
}

function CreateTeam({ first }: { first: boolean }) {
  const utils = api.useUtils();
  const [name, setName] = useState("");
  const create = api.orgs.create.useMutation({
    onSuccess: () => {
      setName("");
      void utils.orgs.list.invalidate();
    },
  });
  return (
    <form
      className="flex flex-col gap-2 sm:flex-row"
      onSubmit={(e) => {
        e.preventDefault();
        create.mutate({ name });
      }}
    >
      <Input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder={first ? "Team name, e.g. Acme" : "Another team"}
        aria-label="Team name"
        className="sm:max-w-xs"
        maxLength={80}
        required
      />
      <Button type="submit" variant={first ? "default" : "outline"} disabled={create.isPending}>
        <Users className="size-3.5" aria-hidden />
        {create.isPending ? "Creating…" : "Create team"}
      </Button>
      {create.error && <p role="alert" className="text-destructive text-sm">{create.error.message}</p>}
    </form>
  );
}

function InviteForm({ team }: { team: Team }) {
  const utils = api.useUtils();
  const [raw, setRaw] = useState("");
  const [role, setRole] = useState<"member" | "admin">("member");
  const [note, setNote] = useState<string | null>(null);
  const invite = api.orgs.invite.useMutation({
    onSuccess: (results) => {
      setRaw("");
      const handoffs = results.filter((r) => r.status === "handoff");
      const failed = results.filter((r) => r.status === "failed");
      setNote(
        [
          `${results.length - handoffs.length - failed.length} sent.`,
          handoffs.length ? `Text messages aren't set up here — send ${handoffs.map((h) => h.contact).join(", ")} the link from mm people instead.` : "",
          failed.length ? `Couldn't reach ${failed.map((f) => f.contact).join(", ")}.` : "",
        ]
          .filter(Boolean)
          .join(" "),
      );
      void utils.orgs.list.invalidate();
    },
  });
  return (
    <form
      className="space-y-2"
      onSubmit={(e) => {
        e.preventDefault();
        const { contacts, bad } = parseContacts(raw);
        if (bad.length || !contacts.length) {
          setNote(bad.length ? `Not an email or phone (with +country code): ${bad.join(", ")}` : "Add an email or phone number.");
          return;
        }
        setNote(null);
        invite.mutate({ orgId: team.id, contacts, role });
      }}
    >
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          placeholder="Emails or phones, e.g. ana@acme.dev, +14155550123"
          aria-label="Emails or phone numbers to invite"
        />
        {team.role === "owner" && (
          <select className={select} value={role} onChange={(e) => setRole(e.target.value as "member" | "admin")} aria-label="Role">
            <option value="member">Member</option>
            <option value="admin">Admin</option>
          </select>
        )}
        <Button type="submit" disabled={invite.isPending}>
          <UserPlus className="size-3.5" aria-hidden />
          {invite.isPending ? "Inviting…" : "Invite"}
        </Button>
      </div>
      {(note ?? invite.error) && (
        <p role="status" className={invite.error ? "text-destructive text-sm" : "text-muted-foreground text-sm"}>
          {invite.error?.message ?? note}
        </p>
      )}
    </form>
  );
}

function TeamCard({ team }: { team: Team }) {
  const utils = api.useUtils();
  const refresh = { onSuccess: () => void utils.orgs.invalidate() };
  const setRole = api.orgs.setRole.useMutation(refresh);
  const remove = api.orgs.remove.useMutation(refresh);
  const revoke = api.orgs.revokeInvite.useMutation(refresh);
  const admin = team.role === "owner" || team.role === "admin";
  const error = setRole.error ?? remove.error ?? revoke.error;

  return (
    <section className="border-border space-y-4 rounded-md border p-4" aria-label={team.name}>
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-base font-medium tracking-tight">{team.name}</h2>
        <span className="text-muted-foreground text-xs">
          {team.members.length} {team.members.length === 1 ? "person" : "people"} · you’re {team.role === "admin" ? "an" : "the"} {team.role}
        </span>
      </div>

      {admin && <InviteForm team={team} />}

      <ul className="divide-border divide-y">
        {team.members.map((m) => (
          <li key={m.userId} className="flex items-center justify-between gap-3 py-2">
            <div className="min-w-0">
              <p className="truncate text-sm">
                {m.name}
                {m.you && <span className="text-muted-foreground"> (you)</span>}
              </p>
              {m.email && m.email !== m.name && <p className="text-muted-foreground truncate text-xs">{m.email}</p>}
            </div>
            <div className="flex items-center gap-1">
              {m.role === "owner" || !admin || m.you ? (
                <span className="text-muted-foreground text-xs capitalize">{m.role}</span>
              ) : (
                <select
                  className={select}
                  value={m.role}
                  disabled={setRole.isPending || (team.role !== "owner" && m.role === "admin")}
                  onChange={(e) => setRole.mutate({ orgId: team.id, userId: m.userId, role: e.target.value as "admin" | "member" })}
                  aria-label={`Role for ${m.name}`}
                >
                  <option value="member">Member</option>
                  <option value="admin">Admin</option>
                </select>
              )}
              {m.role !== "owner" && (m.you || (admin && (team.role === "owner" || m.role !== "admin"))) && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground hover:text-destructive"
                  disabled={remove.isPending}
                  onClick={() => remove.mutate({ orgId: team.id, userId: m.userId })}
                  aria-label={m.you ? "Leave team" : `Remove ${m.name}`}
                >
                  <Trash2 className="size-3.5" aria-hidden />
                  {m.you ? "Leave" : "Remove"}
                </Button>
              )}
            </div>
          </li>
        ))}
        {team.pending.map((i) => (
          <li key={i.id} className="flex items-center justify-between gap-3 py-2">
            <p className="text-muted-foreground flex min-w-0 items-center gap-2 truncate text-sm">
              {i.channel === "email" ? <Mail className="size-3.5 shrink-0" aria-hidden /> : <Phone className="size-3.5 shrink-0" aria-hidden />}
              {i.contact} <span className="text-xs">· invited as {i.role}</span>
            </p>
            {admin && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-muted-foreground"
                disabled={revoke.isPending}
                onClick={() => revoke.mutate({ orgId: team.id, inviteId: i.id })}
              >
                Cancel invite
              </Button>
            )}
          </li>
        ))}
      </ul>
      {error && <p role="alert" className="text-destructive text-sm">{error.message}</p>}
    </section>
  );
}

function ProjectAccess({ teams }: { teams: Team[] }) {
  const utils = api.useUtils();
  const { data: projects = [] } = api.orgs.projects.useQuery();
  const [pick, setPick] = useState<Record<string, string>>({});
  const add = api.orgs.addToProject.useMutation({ onSuccess: () => void utils.orgs.projects.invalidate() });

  const people = new Map<string, string>();
  for (const t of teams) for (const m of t.members) if (!m.you) people.set(m.userId, m.name);
  if (!projects.length) return null;

  return (
    <section className="space-y-3" aria-labelledby="projects-heading">
      <div>
        <h2 id="projects-heading" className="text-base font-medium tracking-tight">Your projects</h2>
        <p className="text-muted-foreground mt-1 text-sm">
          Add teammates straight in — no invite link. They get an email with the project link. In a terminal,{" "}
          <code className="font-mono text-[12px]">mm people</code> does the same.
        </p>
      </div>
      <ul className="divide-border border-border divide-y rounded-md border">
        {projects.map((p) => {
          const inside = new Set(p.members.map((m) => m.principal));
          const options = [...people].filter(([id]) => !inside.has(id));
          const chosen = pick[p.id] ?? options[0]?.[0] ?? "";
          return (
            <li key={p.id} className="flex flex-col gap-2 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="flex items-center gap-2 truncate text-sm">
                  <FolderGit2 className="size-3.5 shrink-0" aria-hidden /> {p.name}
                </p>
                <p className="text-muted-foreground truncate text-xs">
                  {p.repoKey ? `${p.repoKey} · ` : ""}
                  {p.members.length} {p.members.length === 1 ? "member" : "members"}
                </p>
              </div>
              {options.length > 0 ? (
                <div className="flex gap-2">
                  <select
                    className={select}
                    value={chosen}
                    onChange={(e) => setPick({ ...pick, [p.id]: e.target.value })}
                    aria-label={`Teammate to add to ${p.name}`}
                  >
                    {options.map(([id, name]) => (
                      <option key={id} value={id}>{name}</option>
                    ))}
                  </select>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={add.isPending}
                    onClick={() => add.mutate({ projectId: p.id, userId: chosen })}
                  >
                    Add
                  </Button>
                </div>
              ) : (
                <span className="text-muted-foreground text-xs">{people.size ? "Whole team is in" : ""}</span>
              )}
            </li>
          );
        })}
      </ul>
      {add.error && <p role="alert" className="text-destructive text-sm">{add.error.message}</p>}
    </section>
  );
}

export function TeamPanel() {
  const { data: teams, isLoading } = api.orgs.list.useQuery();
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-lg font-medium tracking-tight">
          <PageSwitcher title="Team" />
        </h1>
        <p className="text-muted-foreground mt-1 max-w-xl text-sm">
          Invite people once by email or phone. After they join, you can add them to any project in one click — or with{" "}
          <code className="font-mono text-[13px]">+</code> in <code className="font-mono text-[13px]">mm people</code>.
        </p>
      </div>
      {isLoading ? (
        <p className="text-muted-foreground text-sm">Loading…</p>
      ) : !teams?.length ? (
        <div className="border-border space-y-3 rounded-md border p-4">
          <p className="text-sm font-medium">Start a team</p>
          <CreateTeam first />
        </div>
      ) : (
        <>
          {teams.map((t) => (
            <TeamCard key={t.id} team={t} />
          ))}
          <ProjectAccess teams={teams} />
          <details className="text-sm">
            <summary className="text-muted-foreground cursor-pointer">Create another team</summary>
            <div className="mt-3">
              <CreateTeam first={false} />
            </div>
          </details>
        </>
      )}
    </div>
  );
}
