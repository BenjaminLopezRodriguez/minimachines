// minimachines viewer: one window, a thin toolbar, and the dev app underneath.
// `mm view <url>` launches it; a second launch hands its URL to the open window
// (single-instance lock) instead of stacking windows.
const { app, BaseWindow, WebContentsView, ipcMain, shell, Menu } = require("electron");
const path = require("node:path");

const BAR = 44; // toolbar height, px
const DEFAULT_URL = "http://localhost:3000";

/** Only http(s) ever loads in the app view; anything else is refused. */
function normalize(raw) {
  if (!raw) return null;
  let s = String(raw).trim();
  if (s.startsWith("-")) return null; // a command-line switch, never an address
  if (/^:?\d{2,5}$/.test(s)) s = `http://localhost:${s.replace(":", "")}`;
  else if (!/^[a-z]+:\/\//i.test(s)) s = `http://${s}`;
  try {
    const u = new URL(s);
    return u.protocol === "http:" || u.protocol === "https:" ? u.toString() : null;
  } catch {
    return null;
  }
}

/** `--url=<url>` as one token: Chromium may insert its own switches between separate args. */
function urlFromArgv(argv) {
  const flag = argv.find((a) => a.startsWith("--url="));
  return flag ? normalize(flag.slice("--url=".length)) : null;
}

/** `--window=<name>`: one window per name (app, whiteboard, bot…); default "app". */
function windowFrom(raw) {
  const name = String(raw ?? "").trim().toLowerCase();
  return /^[a-z0-9-]{1,32}$/.test(name) ? name : "app";
}
const windowFromArgv = (argv) => windowFrom(argv.find((a) => a.startsWith("--window="))?.slice("--window=".length));

// URL and window ride along as additionalData, so a second launch never depends on argv order.
if (!app.requestSingleInstanceLock({ url: urlFromArgv(process.argv), window: windowFromArgv(process.argv) })) {
  app.quit();
} else {
  /** name → { win, bar, page } */
  const windows = new Map();
  /** toolbar webContents id → window record, so toolbar buttons act on their own window */
  const byToolbar = new Map();

  function createWindow(name) {
    const win = new BaseWindow({
      width: name === "bot" ? 760 : 1280,
      height: name === "bot" ? 860 : 860,
      minWidth: 360,
      minHeight: 300,
      backgroundColor: "#0d0f14",
      title: `minimachines · ${name}`,
      // macOS: the toolbar is the title bar (traffic lights inset into it); elsewhere keep the native frame.
      ...(process.platform === "darwin" ? { titleBarStyle: "hiddenInset", trafficLightPosition: { x: 14, y: 15 } } : {}),
    });
    // The toolbar is our own page: isolated, sandboxed, and talks to us only through its preload.
    const bar = new WebContentsView({
      webPreferences: { preload: path.join(__dirname, "toolbar-preload.js"), contextIsolation: true, sandbox: true, nodeIntegration: false },
    });
    // What it shows is untrusted remote content: no preload, no Node, sandboxed.
    const page = new WebContentsView({ webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false } });
    win.contentView.addChildView(bar);
    win.contentView.addChildView(page);
    const rec = { name, win, bar, page };
    windows.set(name, rec);
    byToolbar.set(bar.webContents.id, rec);

    const layout = () => {
      const { width, height } = win.getContentBounds();
      bar.setBounds({ x: 0, y: 0, width, height: BAR });
      page.setBounds({ x: 0, y: BAR, width, height: Math.max(0, height - BAR) });
    };
    layout();
    win.on("resize", layout);
    win.on("closed", () => {
      windows.delete(name);
      byToolbar.delete(bar.webContents.id);
      if (!windows.size) app.quit();
    });

    const wc = page.webContents;
    const sync = () => {
      bar.webContents.send("state", { url: wc.getURL(), title: wc.getTitle(), canGoBack: wc.navigationHistory.canGoBack(), loading: wc.isLoading() });
      win.setTitle(wc.getTitle() || `minimachines · ${name}`);
    };
    // Pop-ups and target=_blank go to the user's browser, never a new Electron window.
    wc.setWindowOpenHandler(({ url }) => {
      if (normalize(url)) shell.openExternal(url);
      return { action: "deny" };
    });
    wc.on("will-navigate", (e, url) => { if (!normalize(url)) e.preventDefault(); });
    for (const ev of ["did-navigate", "did-navigate-in-page", "page-title-updated", "did-start-loading", "did-stop-loading"]) wc.on(ev, sync);
    wc.on("did-fail-load", (_e, code, desc, url, isMain) => {
      if (!isMain || code === -3) return; // -3 = aborted by a newer navigation
      bar.webContents.send("error", { url, message: `${desc} (${code}) — is the server running?` });
    });

    // ponytail: dev/test hook — MM_VIEWER_SHOT=<prefix> saves <prefix>-<window>-bar.png / -page.png after the first load.
    if (process.env.MM_VIEWER_SHOT) {
      wc.once("did-stop-loading", () => setTimeout(async () => {
        const fs = require("node:fs");
        const [b, p] = await Promise.all([bar.webContents.capturePage(), wc.capturePage()]);
        fs.writeFileSync(`${process.env.MM_VIEWER_SHOT}-${name}-bar.png`, b.toPNG());
        fs.writeFileSync(`${process.env.MM_VIEWER_SHOT}-${name}-page.png`, p.toPNG());
      }, 2500));
    }

    bar.webContents.loadFile(path.join(__dirname, "toolbar.html"));
    bar.webContents.once("did-finish-load", sync);
    return rec;
  }

  /** Show `url` in window `name`, creating the window the first time. */
  function show(name, url) {
    const rec = windows.get(name) ?? createWindow(name);
    if (url) rec.page.webContents.loadURL(url).catch(() => {}); // failures surface via did-fail-load
    if (rec.win.isMinimized()) rec.win.restore();
    rec.win.focus();
  }

  const focused = () => [...windows.values()].find((r) => r.win.isFocused()) ?? [...windows.values()][0];

  app.on("second-instance", (_e, argv, _cwd, data) => {
    show(windowFrom(data?.window ?? windowFromArgv(argv)), normalize(data?.url) ?? urlFromArgv(argv));
  });

  app.whenReady().then(() => {
    Menu.setApplicationMenu(
      Menu.buildFromTemplate([
        ...(process.platform === "darwin" ? [{ role: "appMenu" }] : []),
        { role: "editMenu" },
        {
          label: "View",
          submenu: [
            { label: "Reload", accelerator: "CmdOrCtrl+R", click: () => focused()?.page.webContents.reload() },
            { label: "Back", accelerator: "CmdOrCtrl+[", click: () => focused()?.page.webContents.navigationHistory.goBack() },
            { label: "Focus address", accelerator: "CmdOrCtrl+L", click: () => focused()?.bar.webContents.send("focus-address") },
            { label: "Developer tools", accelerator: "Alt+CmdOrCtrl+I", click: () => focused()?.page.webContents.toggleDevTools() },
            { type: "separator" },
            { role: "resetZoom" }, { role: "zoomIn" }, { role: "zoomOut" }, { role: "togglefullscreen" },
          ],
        },
        { role: "windowMenu" },
      ]),
    );

    const fromBar = (e) => byToolbar.get(e.sender.id);
    ipcMain.on("navigate", (e, raw) => { const u = normalize(raw); if (u) fromBar(e)?.page.webContents.loadURL(u).catch(() => {}); });
    ipcMain.on("back", (e) => fromBar(e)?.page.webContents.navigationHistory.goBack());
    ipcMain.on("reload", (e) => fromBar(e)?.page.webContents.reload());
    ipcMain.on("devtools", (e) => fromBar(e)?.page.webContents.toggleDevTools());
    ipcMain.on("external", (e) => { const u = normalize(fromBar(e)?.page.webContents.getURL()); if (u) shell.openExternal(u); });

    show(windowFromArgv(process.argv), urlFromArgv(process.argv) ?? DEFAULT_URL);
  });

  app.on("window-all-closed", () => app.quit());
}
