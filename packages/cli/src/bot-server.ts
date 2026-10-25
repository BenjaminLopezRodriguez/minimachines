/**
 * The bot's desktop face: a tiny localhost server the TUI starts in bot mode,
 * opened in the viewer's "bot" window. It streams the brain's state (Server-
 * Sent Events) and takes messages back, so typing in either place talks to
 * the same pet. Bound to 127.0.0.1, every request needs the random token in
 * the URL, and the Host header must be ours (no DNS-rebinding tricks).
 */
import { randomBytes, timingSafeEqual } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";

import type { BotBrain } from "./bot-brain.js";
import { PALETTE, spriteSheet } from "./pet-sprite.js";

export async function startBotServer(brain: BotBrain): Promise<{ url: string; close: () => void }> {
  const token = randomBytes(18).toString("base64url");
  const clients = new Set<ServerResponse>();
  let port = 0;

  const authorized = (req: IncomingMessage, url: URL) => {
    if (req.headers.host !== `127.0.0.1:${port}`) return false;
    const got = Buffer.from(url.searchParams.get("t") ?? "");
    const want = Buffer.from(token);
    return got.length === want.length && timingSafeEqual(got, want);
  };

  const server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", `http://127.0.0.1:${port}`);
    if (!authorized(req, url)) return void res.writeHead(403).end("forbidden");
    if (req.method === "GET" && url.pathname === "/") {
      res.writeHead(200, {
        "content-type": "text/html; charset=utf-8",
        "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'",
        "cache-control": "no-store",
      });
      return void res.end(page(token));
    }
    if (req.method === "GET" && url.pathname === "/events") {
      res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-store", connection: "keep-alive" });
      clients.add(res);
      res.write(`data: ${JSON.stringify(brain.state)}\n\n`);
      req.on("close", () => clients.delete(res));
      return;
    }
    if (req.method === "POST" && (url.pathname === "/send" || url.pathname === "/stop" || url.pathname === "/touch")) {
      let body = "";
      req.on("data", (c: Buffer) => {
        body += c;
        if (body.length > 20_000) req.destroy(); // a message, not an upload
      });
      req.on("end", () => {
        if (url.pathname === "/stop") brain.stop();
        else if (url.pathname === "/touch") brain.touch();
        else {
          try {
            void brain.send(String((JSON.parse(body) as { text?: unknown }).text ?? ""));
          } catch {
            return void res.writeHead(400).end("bad json");
          }
        }
        res.writeHead(204).end();
      });
      return;
    }
    res.writeHead(404).end("not found");
  });

  const unsubscribe = brain.subscribe((s) => {
    const data = `data: ${JSON.stringify(s)}\n\n`;
    for (const c of clients) c.write(data);
  });
  const heartbeat = setInterval(() => {
    for (const c of clients) c.write(": ping\n\n");
  }, 15_000);

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  port = (server.address() as AddressInfo).port;
  return {
    url: `http://127.0.0.1:${port}/?t=${token}`,
    close: () => {
      clearInterval(heartbeat);
      unsubscribe();
      for (const c of clients) c.end();
      server.close();
    },
  };
}

function page(token: string): string {
  const sheet = JSON.stringify(spriteSheet());
  const palette = JSON.stringify(PALETTE);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Byte · minimachines</title>
<style>
  :root { --bg:#0d0f14; --panel:#151821; --line:#262a35; --text:#e6e8ec; --muted:#8a90a0; --brand:#6f8cff; --pink:#ff8fb1; --gold:#facc15; --bad:#ff6b6b; }
  @media (prefers-color-scheme: light) { :root { --bg:#f6f5f2; --panel:#ffffff; --line:#e1e0dc; --text:#15110c; --muted:#6b6860; --brand:#3558f5; --bad:#c62828; } }
  * { box-sizing: border-box; margin: 0; }
  html, body { height: 100%; background: var(--bg); color: var(--text); font: 15px/1.45 -apple-system, "Segoe UI", system-ui, sans-serif; }
  body { display: flex; flex-direction: column; max-width: 720px; margin: 0 auto; padding: 16px; gap: 14px; }
  .home { display: flex; align-items: center; gap: 24px; padding: 18px 22px; border: 1px solid var(--line); border-radius: 18px; background: var(--panel); }
  .pet { position: relative; width: 192px; height: 168px; flex: none; }
  canvas { width: 192px; height: 168px; image-rendering: pixelated; transition: transform .45s ease; }
  .bob canvas { transform: translateY(6px); }
  .fx { position: absolute; right: -6px; top: -4px; font-size: 22px; pointer-events: none; }
  .fx span { position: absolute; animation: float 1.6s ease-out forwards; }
  @keyframes float { from { opacity: 1; transform: translateY(0) } to { opacity: 0; transform: translateY(-40px) } }
  @media (prefers-reduced-motion: reduce) { canvas { transition: none } .bob canvas { transform: none } .fx span { animation: none } }
  .name { font-weight: 700; font-size: 20px; color: var(--brand); }
  .meta { color: var(--muted); font-size: 13px; margin-bottom: 8px; }
  .stat { display: flex; align-items: center; gap: 10px; font-size: 13px; color: var(--muted); }
  .stat b { font-weight: 400; width: 52px; }
  .dots { letter-spacing: 3px; font-size: 14px; }
  .status { margin-top: 10px; font-size: 14px; }
  .chat { flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: 8px; padding: 2px; }
  .msg { max-width: 82%; padding: 9px 13px; border-radius: 16px; white-space: pre-wrap; word-wrap: break-word; }
  .you { align-self: flex-end; background: var(--brand); color: #fff; border-bottom-right-radius: 5px; }
  .pet-msg { align-self: flex-start; background: var(--panel); border: 1px solid var(--line); border-bottom-left-radius: 5px; }
  .pet-msg::before { content: attr(data-name); display: block; font-size: 12px; font-weight: 700; color: var(--brand); margin-bottom: 2px; }
  .step { align-self: flex-start; color: var(--muted); font: 12px/1.3 ui-monospace, Menlo, monospace; padding-left: 14px; }
  .note { align-self: center; color: var(--gold); font-size: 13px; text-align: center; max-width: 90%; }
  code { font: 13px ui-monospace, Menlo, monospace; background: rgba(127,127,127,.18); padding: 0 4px; border-radius: 5px; }
  form { display: flex; gap: 8px; }
  input { flex: 1; font: inherit; color: inherit; background: var(--panel); border: 1px solid var(--line); border-radius: 999px; padding: 12px 18px; outline: none; }
  input:focus { border-color: var(--brand); }
  button { font: inherit; font-weight: 600; border: 0; border-radius: 999px; padding: 0 20px; background: var(--brand); color: #fff; cursor: pointer; min-height: 44px; }
  button.stop { background: transparent; color: var(--bad); border: 1px solid var(--bad); }
  button:focus-visible, input:focus-visible { outline: 2px solid var(--brand); outline-offset: 2px; }
  .gone { position: fixed; inset: 0; display: none; align-items: center; justify-content: center; text-align: center; background: color-mix(in srgb, var(--bg) 88%, transparent); color: var(--muted); padding: 24px; }
  .gone.on { display: flex; }
  .hint { color: var(--muted); font-size: 12px; text-align: center; }
</style>
</head>
<body>
  <section class="home" aria-label="Your pet">
    <div class="pet" id="petbox"><canvas id="pet" width="16" height="14" role="img" aria-label="Byte, a pixel robot"></canvas><div class="fx" id="fx" aria-hidden="true"></div></div>
    <div>
      <div class="name" id="name">Byte</div>
      <div class="meta" id="meta"></div>
      <div class="stat"><b>mood</b><span class="dots" id="mood" style="color:var(--pink)"></span></div>
      <div class="stat"><b>energy</b><span class="dots" id="energy" style="color:var(--gold)"></span></div>
      <div class="stat"><b>xp</b><span id="xp"></span></div>
      <div class="status" id="status" role="status" aria-live="polite"></div>
    </div>
  </section>
  <div class="chat" id="chat" aria-live="polite"></div>
  <form id="form">
    <input id="text" autocomplete="off" placeholder="Tell Byte what to do…" aria-label="Message">
    <button id="btn" type="submit">Send</button>
  </form>
  <div class="hint">Edits files in the folder the terminal is in · /task adds a card to the whiteboard · /help</div>
  <div class="gone" id="gone"><div><div style="font-size:42px">💤</div>Byte went to sleep — the terminal closed.<br>Run <code>mm bot</code> to wake it up.</div></div>
<script>
  const T = ${JSON.stringify(token)};
  const SHEET = ${sheet};
  const PAL = ${palette};
  const $ = (id) => document.getElementById(id);
  const ctx = $("pet").getContext("2d");
  let state = null, frame = 0, blink = false, lastHappy = false;

  function draw() {
    if (!state) return;
    const mood = state.mood === "idle" && blink ? "blink" : state.mood;
    const rows = SHEET[mood][0];
    ctx.clearRect(0, 0, 16, 14);
    rows.forEach((row, y) => [...row].forEach((ch, x) => { if (PAL[ch]) { ctx.fillStyle = PAL[ch]; ctx.fillRect(x, y, 1, 1); } }));
    if (state.mood === "think" && frame % 2) { ctx.fillStyle = PAL.a; ctx.fillRect(7, 0, 2, 1); }
    $("petbox").classList.toggle("bob", state.mood !== "sleep" && frame % 2 === 1);
  }
  setInterval(() => { frame++; blink = Math.random() < 0.12; draw(); }, 450);

  const esc = (s) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const fmt = (s) => esc(s).replace(/\`([^\`]+)\`/g, "<code>$1</code>");
  const dots = (n) => "●".repeat(n) + "○".repeat(5 - n);
  const level = (xp) => 1 + Math.floor(Math.sqrt(xp / 20));

  function render() {
    const p = state.pet, lv = level(p.xp);
    $("name").textContent = p.name;
    document.title = p.name + " · minimachines";
    $("text").placeholder = "Tell " + p.name + " what to do…";
    $("meta").textContent = "lv " + lv + " · " + p.tasks + " task" + (p.tasks === 1 ? "" : "s") + " done";
    $("mood").textContent = dots(p.mood);
    $("energy").textContent = dots(p.energy);
    $("xp").textContent = p.xp + " / " + 20 * lv * lv;
    $("status").textContent = { think: p.name + " is on it…", happy: "♥ done!", sad: "hmm, that didn't go well", sleep: "z z z" }[state.mood] || p.name + " is ready";
    const chat = $("chat");
    const atBottom = chat.scrollHeight - chat.scrollTop - chat.clientHeight < 40;
    chat.innerHTML = state.msgs.map((m) =>
      m.from === "you" ? '<div class="msg you">' + fmt(m.text) + "</div>"
      : m.from === "pet" ? '<div class="msg pet-msg" data-name="' + esc(p.name) + '">' + fmt(m.text) + "</div>"
      : m.from === "step" ? '<div class="step">→ ' + esc(m.text) + "</div>"
      : '<div class="note">' + fmt(m.text) + "</div>").join("");
    if (atBottom) chat.scrollTop = chat.scrollHeight;
    $("btn").textContent = state.busy ? "Stop" : "Send";
    $("btn").className = state.busy ? "stop" : "";
    $("text").disabled = state.busy;
    if (state.mood === "happy" && !lastHappy) hearts();
    lastHappy = state.mood === "happy";
    draw();
  }
  function hearts() {
    for (let i = 0; i < 3; i++) setTimeout(() => {
      const h = document.createElement("span");
      h.textContent = "♥"; h.style.color = "var(--pink)"; h.style.right = (i * 14) + "px";
      $("fx").appendChild(h); setTimeout(() => h.remove(), 1700);
    }, i * 220);
  }

  const post = (path, body) => fetch(path + "?t=" + encodeURIComponent(T), { method: "POST", headers: { "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  $("form").addEventListener("submit", (e) => {
    e.preventDefault();
    if (state && state.busy) return void post("/stop");
    const text = $("text").value.trim();
    if (!text) return;
    $("text").value = "";
    post("/send", { text });
  });
  let touched = 0;
  $("text").addEventListener("input", () => { if (Date.now() - touched > 5000) { touched = Date.now(); post("/touch"); } });

  const es = new EventSource("/events?t=" + encodeURIComponent(T));
  es.onmessage = (e) => { state = JSON.parse(e.data); $("gone").classList.remove("on"); render(); };
  es.onerror = () => { if (es.readyState === EventSource.CLOSED || state) $("gone").classList.add("on"); };
  $("text").focus();
</script>
</body>
</html>`;
}
