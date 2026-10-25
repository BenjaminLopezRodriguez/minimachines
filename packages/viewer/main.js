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

// The URL rides along as additionalData, so a second launch never depends on argv order.
if (!app.requestSingleInstanceLock({ url: urlFromArgv(process.argv) })) {
  app.quit();
} else {
  let win, bar, page;

  const layout = () => {
    const { width, height } = win.getContentBounds();
    bar.setBounds({ x: 0, y: 0, width, height: BAR });
    page.setBounds({ x: 0, y: BAR, width, height: Math.max(0, height - BAR) });
  };
  const sync = () => {
    const wc = page.webContents;
    bar.webContents.send("state", {
      url: wc.getURL(),
      title: wc.getTitle(),
      canGoBack: wc.navigationHistory.canGoBack(),
      loading: wc.isLoading(),
    });
    win.setTitle(wc.getTitle() || "minimachines viewer");
  };
  const open = (url) => {
    if (!url) return;
    page.webContents.loadURL(url).catch(() => {}); // failures surface via did-fail-load
  };

  app.on("second-instance", (_e, argv, _cwd, data) => {
    open(normalize(data?.url) ?? urlFromArgv(argv));
    if (win.isMinimized()) win.restore();
    win.focus();
  });

  app.whenReady().then(() => {
    Menu.setApplicationMenu(
      Menu.buildFromTemplate([
        ...(process.platform === "darwin" ? [{ role: "appMenu" }] : []),
        { role: "editMenu" },
        {
          label: "View",
          submenu: [
            { label: "Reload", accelerator: "CmdOrCtrl+R", click: () => page.webContents.reload() },
            { label: "Back", accelerator: "CmdOrCtrl+[", click: () => page.webContents.navigationHistory.goBack() },
            { label: "Focus address", accelerator: "CmdOrCtrl+L", click: () => bar.webContents.send("focus-address") },
            { label: "Developer tools", accelerator: "Alt+CmdOrCtrl+I", click: () => page.webContents.toggleDevTools() },
            { type: "separator" },
            { role: "resetZoom" }, { role: "zoomIn" }, { role: "zoomOut" }, { role: "togglefullscreen" },
          ],
        },
        { role: "windowMenu" },
      ]),
    );

    win = new BaseWindow({
      width: 1280, height: 860, minWidth: 360, minHeight: 300, backgroundColor: "#0d0f14", title: "minimachines viewer",
      // macOS: the toolbar is the title bar (traffic lights inset into it); elsewhere keep the native frame.
      ...(process.platform === "darwin" ? { titleBarStyle: "hiddenInset", trafficLightPosition: { x: 14, y: 15 } } : {}),
    });
    // The toolbar is our own page: isolated, sandboxed, and talks to us only through its preload.
    bar = new WebContentsView({
      webPreferences: { preload: path.join(__dirname, "toolbar-preload.js"), contextIsolation: true, sandbox: true, nodeIntegration: false },
    });
    // The app under development is untrusted remote content: no preload, no Node, sandboxed.
    page = new WebContentsView({ webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false } });
    win.contentView.addChildView(bar);
    win.contentView.addChildView(page);
    layout();
    win.on("resize", layout);
    win.on("closed", () => app.quit());

    const wc = page.webContents;
    // Pop-ups and target=_blank go to the user's browser, never a new Electron window.
    wc.setWindowOpenHandler(({ url }) => {
      if (normalize(url)) shell.openExternal(url);
      return { action: "deny" };
    });
    wc.on("will-navigate", (e, url) => { if (!normalize(url)) e.preventDefault(); });
    for (const ev of ["did-navigate", "did-navigate-in-page", "page-title-updated", "did-start-loading", "did-stop-loading"]) wc.on(ev, sync);
    wc.on("did-fail-load", (_e, code, desc, url, isMain) => {
      if (!isMain || code === -3) return; // -3 = aborted by a newer navigation
      bar.webContents.send("error", { url, message: `${desc} (${code}) — is the dev server running?` });
    });

    ipcMain.on("navigate", (_e, raw) => open(normalize(raw)));
    ipcMain.on("back", () => wc.navigationHistory.goBack());
    ipcMain.on("reload", () => wc.reload());
    ipcMain.on("devtools", () => wc.toggleDevTools());
    ipcMain.on("external", () => { const u = normalize(wc.getURL()); if (u) shell.openExternal(u); });

    // ponytail: dev/test hook — MM_VIEWER_SHOT=<prefix> saves <prefix>-bar.png / -page.png after the first load.
    if (process.env.MM_VIEWER_SHOT) {
      wc.once("did-stop-loading", () => setTimeout(async () => {
        const fs = require("node:fs");
        const [b, p] = await Promise.all([bar.webContents.capturePage(), wc.capturePage()]);
        fs.writeFileSync(`${process.env.MM_VIEWER_SHOT}-bar.png`, b.toPNG());
        fs.writeFileSync(`${process.env.MM_VIEWER_SHOT}-page.png`, p.toPNG());
      }, 1500));
    }

    bar.webContents.loadFile(path.join(__dirname, "toolbar.html"));
    bar.webContents.once("did-finish-load", sync);
    open(urlFromArgv(process.argv) ?? DEFAULT_URL);
  });

  app.on("window-all-closed", () => app.quit());
}
