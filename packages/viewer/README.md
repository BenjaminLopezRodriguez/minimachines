# minimachines viewer

A single-window desktop viewport for web apps in development. It's Electron's
Chromium with a thin toolbar (back, reload, address, open in browser, devtools)
and nothing else.

```bash
mm view            # http://localhost:3000
mm view :5173      # a local port
mm view vm_ab12    # a minimachine's app URL
mm view https://…  # any http(s) URL
```

A second `mm view` hands its URL to the open window instead of opening another.
Pop-ups and `target=_blank` links open in your default browser. Only http(s)
loads, and the app runs sandboxed with no Node access.

## Develop

```bash
pnpm install
pnpm start                  # from this folder: opens localhost:3000
mm view <url>               # the CLI finds this checkout when the app isn't installed
```

## Package

```bash
pnpm dist        # installers for the current OS: dmg+zip (macOS), nsis (Windows), AppImage+deb (Linux)
pnpm dist:dir    # unpacked app only, for a quick check
```

Signing is off unless the usual electron-builder variables are set
(`CSC_LINK`, `CSC_KEY_PASSWORD`, and `APPLE_ID` etc. for notarization).
The app code is about 16 KB; the installer size is the Electron runtime.

The CLI looks for the viewer in this order: `$MM_VIEWER`, the installed app
(`/Applications`, `%LOCALAPPDATA%\Programs`, `/usr/bin/mm-viewer`), then this
checkout. If none is found, it opens your browser.
