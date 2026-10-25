"use client";

import {
  Bot,
  Check,
  Copy,
  LogOut,
  Menu,
  MessageSquare,
  Plus,
  RotateCcw,
  Settings,
  SquarePen,
  Trash2,
  X,
} from "lucide-react";
import Link from "next/link";
import { createPortal } from "react-dom";
import { AgentConnection } from "./agent-connection";
import { FeedbackButton } from "~/components/beta/feedback-button";
import { signOutAction } from "~/components/dashboard/actions";
import { pages } from "~/components/dashboard/page-switcher";
import { trackProduct } from "~/lib/analytics";
import { ChatWelcome, ChatComposer, ChatSuggestions } from "./chat-surface";
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
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { BotInput } from "~/lib/bots";
import type { RouterOutputs } from "~/trpc/react";
import { api } from "~/trpc/react";

type BotProfile = RouterOutputs["bots"]["list"][number];
type AssistantMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  designPrompt?: string | null;
};

function DesignPrompt({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="mm-design-prompt">
      <div>
        <span>Design prompt</span>
        <button
          type="button"
          onClick={() =>
            void navigator.clipboard.writeText(text).then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 1600);
            })
          }
        >
          {copied ? <Check size={14} /> : <Copy size={14} />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <p>{text}</p>
    </div>
  );
}
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
  const [connectionReady, setConnectionReady] = useState(false);
  const [name, setName] = useState(bot?.name ?? "My bot");
  const [instructions, setInstructions] = useState(
    bot?.instructions ??
      "Be a thoughtful, practical assistant. Infer sensible defaults and offer a useful first draft. Ask one question only when it blocks progress. Keep answers clear and concise.",
  );
  const [machineId, setMachineId] = useState(
    bot?.machineId ?? machines.find((m) => m.status === "running")?.id ?? "",
  );
  const [provider, setProvider] = useState<BotInput["provider"]>(
    bot?.provider === "codex" ? "codex" : "claude",
  );
  return (
    <div className="mm-bot-editor">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSave({ name, instructions, machineId, provider });
        }}
      >
        <label htmlFor="bot-provider">Your coding agent</label>
        <select
          id="bot-provider"
          value={provider}
          onChange={(e) => setProvider(e.target.value as BotInput["provider"])}
        >
          <option value="claude">Claude Code</option>
          <option value="codex">Codex</option>
        </select>
        <AgentConnection
          key={`${machineId}:${provider}`}
          machine={machines.find((m) => m.id === machineId)}
          provider={provider}
          onMachine={setMachineId}
          onReadyChange={setConnectionReady}
        />
        <details className="mm-agent-options">
          <summary>Personalize & workspace options</summary>
          <label htmlFor="bot-name">Name</label>
          <input
            id="bot-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            maxLength={80}
          />
          <label htmlFor="bot-instructions">Preferences</label>
          <textarea
            id="bot-instructions"
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            rows={3}
            required
            maxLength={3000}
          />
          <label htmlFor="bot-machine">Workspace</label>
          <select
            id="bot-machine"
            value={machineId}
            onChange={(e) => setMachineId(e.target.value)}
          >
            <option value="">New workspace</option>
            {machines.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name} · {m.status}
              </option>
            ))}
          </select>
        </details>
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
              busy ||
              !machineId ||
              !name.trim() ||
              !instructions.trim() ||
              (!bot && !connectionReady)
            }
          >
            {busy ? "Saving…" : bot ? "Save" : "Continue"}
          </button>
        </div>
      </form>
    </div>
  );
}

/** Renders into a slot owned by the messenger header, once it exists. */
function HeaderSlot({ id, children }: { id: string; children: ReactNode }) {
  const [target, setTarget] = useState<HTMLElement | null>(null);
  useEffect(() => setTarget(document.getElementById(id)), [id]);
  return target ? createPortal(children, target) : null;
}

export function BotsWorkspace({
  variant = "page",
  active = true,
  onMessageCount,
}: {
  variant?: "page" | "messenger";
  active?: boolean;
  onMessageCount?: (count: number) => void;
} = {}) {
  const messenger = variant === "messenger";
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
  const [thread, setThread] = useState<AssistantMessage[]>([]);
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
  const shownCount =
    thread.length +
    messages.length +
    (optimistic && !messages.some((m) => m.id === optimistic.id) ? 1 : 0);
  useEffect(() => {
    onMessageCount?.(shownCount);
  }, [shownCount, onMessageCount]);
  const assist = api.bots.assist.useMutation();
  const ready = !!bot && botMachine?.status === "running";
  const resetChat = () => {
    setConversationId(null);
    setDraft("");
    setOptimistic(null);
    setThread([]);
    setConfirmDelete(null);
    setLocalError("");
    send.reset();
  };
  const askAssistant = async (history: AssistantMessage[]) => {
    setSending(true);
    setLocalError("");
    try {
      const answer = await assist.mutateAsync({
        messages: history
          .slice(-20)
          .map(({ role, content }) => ({ role, content })),
      });
      setThread((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: answer.reply,
          designPrompt: answer.designPrompt,
        },
      ]);
    } catch (error) {
      setLocalError(
        error instanceof Error ? error.message : "The assistant couldn't reply.",
      );
    } finally {
      setSending(false);
    }
  };
  const submit = async (content: string, requestId = crypto.randomUUID()) => {
    if (sending || !content.trim()) return;
    if (messenger && !ready && !conversationId) {
      trackProduct("bot_message_submitted", "bot");
      const history = [
        ...thread,
        { id: requestId, role: "user" as const, content },
      ];
      setThread(history);
      setDraft("");
      await askAssistant(history);
      return;
    }
    if (!bot) {
      setLocalError(
        "Connect your agent in settings to send this message. Your draft is saved here.",
      );
      setEditing("new");
      return;
    }
    if (botMachine?.status !== "running") return;
    trackProduct("bot_message_submitted", "bot");
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
      trackProduct("bot_reply_received", "bot");
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
  const retryLast = () => {
    if (thread.at(-1)?.role === "user") return void askAssistant(thread);
    if (retry) void submit(retry.content, retry.id);
  };
  const canRetry = thread.length
    ? thread.at(-1)?.role === "user"
    : !!retry;
  const saveProfile = async (input: BotInput) => {
    try {
      const saved = await save.mutateAsync({
        ...input,
        id: editing === "edit" ? bot?.id : undefined,
      });
      await utils.bots.list.invalidate();
      setSelectedBot(saved.id);
      if (editing === "new" && !thread.length) {
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
    </aside>
  );

  const openSettings = () => {
    setLibraryOpen(false);
    setEditing(bot ? "edit" : "new");
    save.reset();
  };
  const startNewChat = () => {
    setLibraryOpen(false);
    resetChat();
    setEditing(null);
  };

  const messengerLibrary = (
    <aside className="mm-bots-sidebar mm-chat-sidebar">
      <button
        className="mm-chat-sidebar-new"
        onClick={startNewChat}
        disabled={busy}
      >
        <SquarePen size={18} aria-hidden="true" />
        New chat
      </button>
      {(bots.data?.length ?? 0) > 1 && (
        <div className="mm-chat-sidebar-bots" aria-label="Bots">
          {bots.data?.map((profile) => (
            <button
              key={profile.id}
              aria-pressed={profile.id === activeBotId}
              disabled={busy}
              onClick={() => {
                setLibraryOpen(false);
                setSelectedBot(profile.id);
                setEditing(null);
                resetChat();
              }}
            >
              <Bot size={16} aria-hidden="true" />
              <span>{profile.name}</span>
            </button>
          ))}
        </div>
      )}
      {bots.error ? (
        <p className="mm-bot-error" role="alert">
          {bots.error.message}
        </p>
      ) : conversations.error ? (
        <p className="mm-bot-error" role="alert">
          {conversations.error.message}
        </p>
      ) : conversations.data?.length ? (
        <nav className="mm-chat-sidebar-list" aria-label="Chats">
          <h2>Chats</h2>
          {conversations.data.map((c) => {
            const current = conversationId === c.id;
            return (
              <div key={c.id} className="mm-chat-sidebar-row">
                <button
                  aria-current={current ? "page" : undefined}
                  disabled={busy}
                  onClick={() => {
                    setLibraryOpen(false);
                    setConversationId(c.id);
                    setThread([]);
                    setEditing(null);
                    setOptimistic(null);
                    setLocalError("");
                    setConfirmDelete(null);
                    setDraft("");
                    send.reset();
                  }}
                >
                  {c.title}
                </button>
                {current && (
                  <button
                    className="mm-chat-sidebar-delete"
                    aria-label={`Delete ${c.title}`}
                    title="Delete chat"
                    disabled={busy || serverBusy}
                    onClick={() => {
                      setLibraryOpen(false);
                      setConfirmDelete("conversation");
                    }}
                  >
                    <Trash2 size={15} aria-hidden="true" />
                  </button>
                )}
              </div>
            );
          })}
        </nav>
      ) : null}
      <div className="mm-chat-sidebar-footer">
        <button onClick={openSettings} disabled={busy}>
          <Settings size={17} aria-hidden="true" />
          {bot ? "Bot settings" : "Connect your agent"}
        </button>
        <FeedbackButton surface="bot" label="Send feedback" />
      </div>
      <nav className="mm-chat-sidebar-pages" aria-label="Pages">
        {pages
          .filter(({ href }) => !href.startsWith("/dashboard?") && href !== "/dashboard")
          .map(({ href, label, icon: Icon }) => (
            <Link key={href} href={href} prefetch={false}>
              <Icon size={17} aria-hidden="true" />
              {label}
            </Link>
          ))}
        <button onClick={() => void signOutAction()}>
          <LogOut size={17} aria-hidden="true" />
          Sign out
        </button>
      </nav>
    </aside>
  );

  if (messenger) {
    const hasMessages = thread.length > 0 || messages.length > 0 || !!optimistic;
    return (
      <div className="mm-bots-workspace mm-chat-workspace">
        {active && (
          <>
            <HeaderSlot id="mm-header-leading">
              <Dialog open={libraryOpen} onOpenChange={setLibraryOpen}>
                <DialogTrigger asChild>
                  <button
                    className="mm-icon-control mm-chat-menu-trigger"
                    aria-label="Open chats"
                  >
                    <Menu size={20} aria-hidden="true" />
                  </button>
                </DialogTrigger>
                <DialogContent
                  className="mm-chat-drawer"
                  showCloseButton={false}
                >
                  <DialogTitle className="sr-only">Chats</DialogTitle>
                  <DialogDescription className="sr-only">
                    Start a new chat or pick up where you left off.
                  </DialogDescription>
                  {messengerLibrary}
                </DialogContent>
              </Dialog>
            </HeaderSlot>
            <HeaderSlot id="mm-header-trailing">
              <button
                className="mm-icon-control"
                aria-label="New chat"
                title="New chat"
                disabled={busy || !hasMessages}
                onClick={startNewChat}
              >
                <SquarePen size={19} aria-hidden="true" />
              </button>
            </HeaderSlot>
          </>
        )}
        {messengerLibrary}

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
                <div className="mm-settings-links">
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
                  <button
                    className="mm-settings-new-bot mm-settings-delete-bot"
                    disabled={busy || serverBusy}
                    onClick={() => {
                      setEditing(null);
                      setConversationId(null);
                      setConfirmDelete("bot");
                    }}
                  >
                    Delete this bot
                  </button>
                </div>
              )}
            </DialogContent>
          </Dialog>
          <div
            className="mm-bot-messages"
            aria-label="Conversation messages"
            aria-busy={sending}
          >
            {bots.isPending ? (
              <p className="mm-bot-loading" role="status">
                Loading…
              </p>
            ) : conversation.isPending && conversationId ? (
              <p className="mm-bot-loading" role="status">
                Loading chat…
              </p>
            ) : conversation.error ? (
              <p className="mm-bot-error" role="alert">
                {conversation.error.message}
              </p>
            ) : !hasMessages ? null : (
              <div className="mm-bot-message-list">
                {thread.map((message) => (
                  <article
                    className={`mm-bot-message mm-bot-message-${message.role}`}
                    key={message.id}
                  >
                    <span className="mm-bot-message-author">
                      {message.role === "user" ? "You" : "Assistant"}
                    </span>
                    <div>{message.content}</div>
                    {message.designPrompt && (
                      <DesignPrompt text={message.designPrompt} />
                    )}
                  </article>
                ))}
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
                    Thinking…
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
                    ? "bot and all its saved chats"
                    : "chat"}
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
            {!sending && !serverBusy && canRetry && (
              <button className="mm-bot-retry" onClick={retryLast}>
                <RotateCcw size={13} />
                Retry last message
              </button>
            )}
            <ChatComposer
              draft={draft}
              onChange={setDraft}
              onSubmit={() => void submit(draft)}
              sending={sending || serverBusy}
              label={bot ? `Message ${bot.name}` : "Message your bot"}
              placeholder="Ask anything"
            />
          </div>
        </main>
      </div>
    );
  }

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
                      `${botMachine?.status === "running" ? "Ready" : "Offline"}`}
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
                <ChatWelcome>
                  <ChatSuggestions onChoose={choosePrompt} layout="list" />
                </ChatWelcome>
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
