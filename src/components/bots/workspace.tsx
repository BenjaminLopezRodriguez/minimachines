"use client";

import {
  Bot,
  Check,
  ChevronRight,
  MessageSquare,
  Plus,
  RotateCcw,
  Settings,
  Trash2,
  X,
} from "lucide-react";
import Link from "next/link";
import { ChatWelcome, ChatComposer } from "./chat-surface";
import { MobileDisclosure } from "~/components/mobile-disclosure";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "~/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import { useEffect, useRef, useState } from "react";
import type { BotInput } from "~/lib/bots";
import type { RouterOutputs } from "~/trpc/react";
import { api } from "~/trpc/react";

type BotProfile = RouterOutputs["bots"]["list"][number];
type Machine = RouterOutputs["machines"]["list"][number];

function BotEditor({
  bot,
  machines,
  busy,
  error,
  onSave,
  onCancel,
}: {
  bot?: BotProfile;
  machines: Machine[];
  busy: boolean;
  error?: string;
  onSave: (input: BotInput) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(bot?.name ?? "");
  const [instructions, setInstructions] = useState(
    bot?.instructions ??
      "Be a thoughtful, practical assistant. Ask a useful question when context is missing. Keep answers clear and concise.",
  );
  const [machineId, setMachineId] = useState(
    bot?.machineId ?? machines.find((m) => m.status === "running")?.id ?? "",
  );
  const [provider, setProvider] = useState<BotInput["provider"]>(
    bot?.provider === "codex" ? "codex" : "claude",
  );
  return (
    <div className="mm-bot-editor">
      <div className="mm-bot-editor-intro">
        <span className="mm-bot-mark">
          <Bot size={25} />
        </span>
        <h1>{bot ? "Shape your bot" : "A bot of your own"}</h1>
        <p>Give it a purpose. Connect an agent. Start a conversation.</p>
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSave({ name, instructions, machineId, provider });
        }}
      >
        <label htmlFor="bot-name">Name</label>
        <input
          id="bot-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Product thinking partner"
          required
          maxLength={80}
        />
        <label htmlFor="bot-instructions">How should it help?</label>
        <textarea
          id="bot-instructions"
          value={instructions}
          onChange={(e) => setInstructions(e.target.value)}
          rows={5}
          required
          maxLength={3000}
        />
        <p className="mm-bot-field-hint">
          Its role, tone and preferences. You can change these anytime.
        </p>
        <MobileDisclosure
          title="Agent & connection"
          description={`${provider === "claude" ? "Claude Code" : "Codex"} · ${machines.find((m) => m.id === machineId)?.name ?? "Choose a machine"}`}
        >
          <div className="mm-bot-form-row">
            <div>
              <label htmlFor="bot-provider">Coding agent</label>
              <select
                id="bot-provider"
                value={provider}
                onChange={(e) =>
                  setProvider(e.target.value as BotInput["provider"])
                }
              >
                <option value="claude">Claude Code</option>
                <option value="codex">Codex</option>
              </select>
            </div>
            <div>
              <label htmlFor="bot-machine">Connected machine</label>
              <select
                id="bot-machine"
                value={machineId}
                onChange={(e) => setMachineId(e.target.value)}
                required
              >
                <option value="" disabled>
                  Select a machine
                </option>
                {machines.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} · {m.status}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="mm-bot-account-note">
            <Check size={16} />
            <p>
              Uses the agent account signed in on this machine. Install the
              current CLI and sign in through the{" "}
              <Link href="/dashboard/machines">machine console</Link> before
              chatting.
            </p>
          </div>
        </MobileDisclosure>
        {!machines.length && (
          <p className="mm-bot-error">
            Create a machine in{" "}
            <Link href="/dashboard/machines">Mini Machines</Link> to connect
            your first bot.
          </p>
        )}
        {error && (
          <p className="mm-bot-error" role="alert">
            {error}
          </p>
        )}
        <div className="mm-bot-form-actions">
          <button
            type="button"
            className="mm-bot-button mm-bot-button-secondary"
            onClick={onCancel}
            disabled={busy}
          >
            Cancel
          </button>
          <button
            className="mm-bot-button"
            disabled={
              busy || !machineId || !name.trim() || !instructions.trim()
            }
          >
            {busy ? "Saving…" : bot ? "Save bot" : "Create bot"}
            <ChevronRight size={15} />
          </button>
        </div>
      </form>
    </div>
  );
}

export function BotsWorkspace() {
  const bots = api.bots.list.useQuery();
  const machines = api.machines.list.useQuery();
  const utils = api.useUtils();
  const [selectedBot, setSelectedBot] = useState<string | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [editing, setEditing] = useState<"new" | "edit" | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [optimistic, setOptimistic] = useState<{
    id: string;
    content: string;
  } | null>(null);
  const [localError, setLocalError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<
    "bot" | "conversation" | null
  >(null);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const activeBotId = selectedBot ?? bots.data?.[0]?.id ?? "";
  const bot = bots.data?.find((b) => b.id === activeBotId);
  const conversations = api.bots.conversations.useQuery(
    { id: activeBotId },
    { enabled: !!bot },
  );
  const conversation = api.bots.conversation.useQuery(
    { id: conversationId ?? "" },
    {
      enabled: !!conversationId,
      refetchInterval: (query) =>
        sending ||
        (!!query.state.data?.generationId &&
          !!query.state.data.generationStartedAt &&
          Date.now() - query.state.data.generationStartedAt.getTime() < 180000)
          ? 1500
          : false,
    },
  );
  const save = api.bots.save.useMutation();
  const createConversation = api.bots.newConversation.useMutation();
  const send = api.bots.send.useMutation();
  const removeBot = api.bots.delete.useMutation();
  const removeConversation = api.bots.deleteConversation.useMutation();
  const messages = conversation.data?.messages ?? [];
  const botMachine = machines.data?.find((m) => m.id === bot?.machineId);
  const busy =
    sending ||
    save.isPending ||
    removeBot.isPending ||
    removeConversation.isPending;
  const serverBusy =
    !!conversation.data?.generationId &&
    !!conversation.data.generationStartedAt &&
    Date.now() - conversation.data.generationStartedAt.getTime() < 180000;
  const showEditor = editing !== null;
  const composerRef = useRef<HTMLDivElement>(null);
  const choosePrompt = (prompt: string) => {
    setDraft(prompt);
    composerRef.current?.querySelector("textarea")?.focus();
  };
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "instant", block: "end" });
  }, [messages.length, sending, optimistic]);
  const resetChat = () => {
    setConversationId(null);
    setDraft("");
    setOptimistic(null);
    setConfirmDelete(null);
    setLocalError("");
    send.reset();
  };
  const submit = async (content: string, requestId = crypto.randomUUID()) => {
    if (sending || !content.trim()) return;
    if (!bot) {
      setLocalError(
        "Connect your agent in settings to send this message. Your draft is saved here.",
      );
      setEditing("new");
      return;
    }
    if (botMachine?.status !== "running") return;
    setSending(true);
    setLocalError("");
    setOptimistic({ id: requestId, content });
    setDraft("");
    let activeConversation = conversationId;
    try {
      let id = activeConversation;
      if (!id) {
        const created = await createConversation.mutateAsync({ id: bot.id });
        id = created.id;
        setConversationId(id);
      }
      activeConversation = id;
      await send.mutateAsync({ conversationId: id, requestId, content });
      await Promise.all([
        utils.bots.conversation.invalidate({ id }),
        utils.bots.conversations.invalidate({ id: bot.id }),
      ]);
      setOptimistic(null);
    } catch (error) {
      setLocalError(
        error instanceof Error ? error.message : "The agent could not reply.",
      );
      if (!activeConversation) setDraft(content);
    } finally {
      setSending(false);
      if (activeConversation)
        await utils.bots.conversation.invalidate({ id: activeConversation });
    }
  };
  const lastUser =
    messages.at(-1)?.role === "user" ? messages.at(-1) : undefined;
  const retry = optimistic ?? lastUser;
  const saveProfile = async (input: BotInput) => {
    try {
      const saved = await save.mutateAsync({
        ...input,
        id: editing === "edit" ? bot?.id : undefined,
      });
      await utils.bots.list.invalidate();
      setSelectedBot(saved.id);
      if (editing === "new") {
        setConversationId(null);
        setOptimistic(null);
      }
      setEditing(null);
      setLocalError("");
    } catch {
      /* mutation error is shown in the form */
    }
  };
  const deleteSelection = async () => {
    try {
      if (confirmDelete === "bot" && bot) {
        await removeBot.mutateAsync({ id: bot.id });
        setSelectedBot(null);
        await utils.bots.list.invalidate();
      }
      if (confirmDelete === "conversation" && conversationId) {
        await removeConversation.mutateAsync({ id: conversationId });
        await conversations.refetch();
      }
      resetChat();
    } catch (error) {
      setLocalError(
        error instanceof Error ? error.message : "Could not delete.",
      );
    }
  };

  const library = (
    <aside className="mm-bots-sidebar">
      <div className="mm-bots-sidebar-heading">
        <span>Your bots</span>
        <button
          aria-label="Bot settings"
          title="Bot settings"
          disabled={busy}
          onClick={() => {
            setLibraryOpen(false);
            setEditing(bot ? "edit" : "new");
            save.reset();
          }}
        >
          <Settings size={18} />
        </button>
      </div>
      {bots.isPending ? (
        <p className="mm-bot-sidebar-hint" role="status">
          Loading bots…
        </p>
      ) : bots.error ? (
        <p className="mm-bot-error" role="alert">
          {bots.error.message}
        </p>
      ) : (
        <div className="mm-bot-profiles">
          {bots.data?.map((profile) => (
            <button
              key={profile.id}
              aria-pressed={profile.id === activeBotId}
              disabled={busy}
              onClick={() => {
                setLibraryOpen(false);
                setSelectedBot(profile.id);
                setEditing(null);
                setLibraryOpen(false);
                resetChat();
              }}
            >
              <Bot size={17} />
              <span>
                {profile.name}
                <small>
                  {profile.provider === "claude" ? "Claude Code" : "Codex"}
                </small>
              </span>
            </button>
          ))}
        </div>
      )}
      <div className="mm-bots-sidebar-heading mm-bots-chat-heading">
        <span>Conversations</span>
      </div>
      <button
        className="mm-bot-new-chat"
        onClick={() => {
          resetChat();
          setEditing(null);
        }}
        disabled={busy || !bot}
      >
        <Plus size={15} />
        New conversation
      </button>
      {conversations.isFetching && !conversations.data && bot ? (
        <p className="mm-bot-sidebar-hint">Loading conversations…</p>
      ) : conversations.error ? (
        <p className="mm-bot-error" role="alert">
          {conversations.error.message}
        </p>
      ) : (
        <div className="mm-bot-conversations">
          {conversations.data?.map((c) => (
            <button
              key={c.id}
              aria-current={conversationId === c.id ? "page" : undefined}
              disabled={busy}
              onClick={() => {
                setLibraryOpen(false);
                setConversationId(c.id);
                setEditing(null);
                setOptimistic(null);
                setLocalError("");
                setConfirmDelete(null);
                setDraft("");
                send.reset();
              }}
            >
              <MessageSquare size={14} />
              <span>{c.title}</span>
            </button>
          ))}
          {!conversations.data?.length && (
            <p className="mm-bot-sidebar-hint">
              Your conversations will be saved here.
            </p>
          )}
        </div>
      )}
      <div className="mm-bots-sidebar-footer">
        <span className="mm-bot-connection-dot" />
        Your agents. Your conversations.
        <p>Powered by the account on your machine.</p>
      </div>
    </aside>
  );

  return (
    <div className="mm-bots-workspace">
      <div className="mm-bots-mobile-toolbar">
        <Dialog open={libraryOpen} onOpenChange={setLibraryOpen}>
          <DialogTrigger asChild>
            <button className="mm-icon-control" aria-label="Open conversations">
              <MessageSquare size={20} />
            </button>
          </DialogTrigger>
          <DialogContent className="mm-mobile-sheet mm-bots-library">
            <DialogTitle>Your conversations</DialogTitle>
            <DialogDescription>
              Switch bots or pick up a conversation.
            </DialogDescription>
            {library}
          </DialogContent>
        </Dialog>
        <strong>
          {showEditor ? "Bot settings" : (bot?.name ?? "Your bots")}
        </strong>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className="mm-icon-control"
              aria-label="Bot settings and conversation options"
            >
              <Settings size={21} />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              disabled={busy}
              onSelect={() => {
                setEditing("new");
                save.reset();
              }}
            >
              Create a bot
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={busy || !bot}
              onSelect={() => {
                resetChat();
                setEditing(null);
              }}
            >
              New conversation
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={busy}
              onSelect={() => {
                setEditing(bot ? "edit" : "new");
                save.reset();
              }}
            >
              Bot settings
            </DropdownMenuItem>
            <DropdownMenuItem
              variant="destructive"
              disabled={busy || serverBusy || !bot}
              onSelect={() => {
                setEditing(null);
                setConfirmDelete(conversationId ? "conversation" : "bot");
              }}
            >
              Delete {conversationId ? "conversation" : "bot"}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {library}

      <main className="mm-bots-main" id="bots-content">
        <Dialog
          open={showEditor}
          onOpenChange={(open) => {
            if (!open && !save.isPending) {
              setEditing(null);
              save.reset();
            }
          }}
        >
          <DialogContent className="mm-bot-settings-dialog">
            <DialogTitle>Bot settings</DialogTitle>
            <DialogDescription>
              Personalize your bot and connect the agent account on your
              machine.
            </DialogDescription>
            <BotEditor
              key={editing === "edit" ? bot?.id : "new"}
              bot={editing === "edit" ? bot : undefined}
              machines={machines.data ?? []}
              busy={save.isPending}
              error={save.error?.message}
              onSave={(input) => void saveProfile(input)}
              onCancel={() => {
                setEditing(null);
                save.reset();
              }}
            />
            {editing === "edit" && (
              <button
                className="mm-settings-new-bot"
                disabled={busy}
                onClick={() => {
                  setEditing("new");
                  save.reset();
                }}
              >
                Create another bot
              </button>
            )}
          </DialogContent>
        </Dialog>
        {bots.isPending ? (
          <div className="mm-bot-loading" role="status">
            Loading your workspace…
          </div>
        ) : bots.error ? (
          <div className="mm-bot-error" role="alert">
            {bots.error.message}
            <button onClick={() => void bots.refetch()}>Try again</button>
          </div>
        ) : (
          <>
            <header className="mm-bot-chat-header">
              <div>
                <Bot size={18} />
                <span>
                  <strong>{bot?.name ?? "New conversation"}</strong>
                  <small>
                    {bot
                      ? bot.provider === "claude"
                        ? "Claude Code"
                        : "Codex"
                      : "Your space to think"}
                    {bot && " · "}
                    {bot &&
                      `${botMachine?.name ?? "Machine unavailable"} · ${botMachine?.status ?? "offline"}`}
                  </small>
                </span>
              </div>
              <div>
                <button
                  aria-label="Bot settings"
                  title="Bot settings"
                  disabled={busy}
                  onClick={() => {
                    setEditing(bot ? "edit" : "new");
                    save.reset();
                  }}
                >
                  <Settings size={17} />
                </button>
                {bot && (
                  <button
                    aria-label={
                      conversationId ? "Delete conversation" : "Delete bot"
                    }
                    title={
                      conversationId ? "Delete conversation" : "Delete bot"
                    }
                    disabled={busy || serverBusy || !bot}
                    onClick={() =>
                      setConfirmDelete(conversationId ? "conversation" : "bot")
                    }
                  >
                    <Trash2 size={16} />
                  </button>
                )}
              </div>
            </header>
            <div
              className="mm-bot-messages"
              aria-label="Conversation messages"
              aria-busy={sending}
            >
              {conversation.isPending && conversationId ? (
                <p className="mm-bot-loading" role="status">
                  Loading conversation…
                </p>
              ) : conversation.error ? (
                <p className="mm-bot-error" role="alert">
                  {conversation.error.message}
                </p>
              ) : !messages.length && !optimistic ? (
                <ChatWelcome onChoose={choosePrompt} />
              ) : (
                <div className="mm-bot-message-list">
                  {messages.map((message) => (
                    <article
                      className={`mm-bot-message mm-bot-message-${message.role}`}
                      key={message.id}
                    >
                      <span className="mm-bot-message-author">
                        {message.role === "user"
                          ? "You"
                          : (bot?.name ?? "Assistant")}
                      </span>
                      <div>{message.content}</div>
                    </article>
                  ))}
                  {optimistic &&
                    !messages.some((m) => m.id === optimistic.id) && (
                      <article className="mm-bot-message mm-bot-message-user">
                        <span className="mm-bot-message-author">You</span>
                        <div>{optimistic.content}</div>
                      </article>
                    )}
                  {(sending || serverBusy) && (
                    <div className="mm-bot-thinking" role="status">
                      <span />
                      {bot?.name ?? "Your bot"} is thinking…
                      <small>This can take up to two minutes.</small>
                    </div>
                  )}
                  <div ref={endRef} />
                </div>
              )}
            </div>
            <div className="mm-bot-composer-wrap" ref={composerRef}>
              {confirmDelete && (
                <div
                  className="mm-bot-confirm"
                  role="region"
                  aria-label="Confirm deletion"
                >
                  <p>
                    Delete this{" "}
                    {confirmDelete === "bot"
                      ? "bot and all its saved conversations"
                      : "conversation and its saved messages"}
                    ?
                  </p>
                  <button
                    className="mm-bot-button mm-bot-button-secondary"
                    disabled={busy}
                    onClick={() => setConfirmDelete(null)}
                  >
                    Cancel
                  </button>
                  <button
                    className="mm-bot-button"
                    disabled={busy}
                    onClick={() => void deleteSelection()}
                  >
                    Delete
                  </button>
                </div>
              )}
              {localError && (
                <div className="mm-bot-error" role="alert">
                  {localError}
                  <button
                    aria-label="Dismiss error"
                    onClick={() => setLocalError("")}
                  >
                    <X size={14} />
                  </button>
                </div>
              )}
              {!sending && !serverBusy && retry && (
                <button
                  className="mm-bot-retry"
                  onClick={() => void submit(retry.content, retry.id)}
                >
                  <RotateCcw size={13} />
                  Retry last message
                </button>
              )}
              {bot && botMachine?.status !== "running" && (
                <p className="mm-bot-offline">
                  Start this bot’s machine in{" "}
                  <Link href="/dashboard/machines">Mini Machines</Link> to chat.
                </p>
              )}
              <ChatComposer
                draft={draft}
                onChange={setDraft}
                onSubmit={() => void submit(draft)}
                sending={sending || serverBusy}
                disabled={!!bot && botMachine?.status !== "running"}
                label={bot ? `Message ${bot.name}` : "Message your bot"}
              />
              <p className="mm-bot-composer-note">
                Replies may be inaccurate. Check anything important.
              </p>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
