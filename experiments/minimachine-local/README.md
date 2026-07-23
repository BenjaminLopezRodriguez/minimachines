# minimachine — local experiment

Proves the core mission end to end on one laptop:

> A prompt is executed by an agent running **inside** a throwaway machine, over
> SSH, on **that machine's** CPU. The calling session gets back **one line** —
> not a transcript.

```
mm run "build X"
   │
   ├─ docker build (once)        alpine + node + openssh + claude code
   ├─ docker run -d              ephemeral machine, ed25519 key, random port
   ├─ ssh agent@127.0.0.1        ← real SSH, key-only, no password
   │     └─ claude -p            ← the agent runs HERE, burns THIS cpu
   ├─ docker stop                machine parked, /workspace volume kept
   └─ prints: ✓ mm-… — <summary> · view: … · sync: …
```

## Use

```bash
export CLAUDE_CODE_OAUTH_TOKEN=$(claude setup-token)   # or ANTHROPIC_API_KEY
./mm run "Create a FizzBuzz module and test it"
./mm view <id>          # what got built
./mm cat  <id> ./f.py   # read one artifact
./mm sync <id>          # copy out to ./minimachine-out/<id>/
./mm ssh  <id>          # interactive shell on the machine
./mm emulator <id>      # browser terminal on the machine (opens a tab)
./mm logs <id>          # full inner-agent transcript (normally hidden)
./mm rm   <id>          # destroy machine + volume
./mm smoke              # same loop, plain shell instead of the LLM
```

## The emulator

`mm emulator <id>` starts [ttyd](https://github.com/tsl0922/ttyd) inside the
machine and opens `http://127.0.0.1:<port>`. Production shape would be
`https://mm-<id>.minimachin.es/emulator`.

This is the "the agent is stuck / something needs a human" escape hatch: hand
the URL over, the human drives a real shell on the real machine, the agent
carries on.

ttyd is already exactly what's wanted — xterm.js with the **WebGL2** renderer
(`webglAddon` is in the shipped bundle), a C/libwebsockets server, and the
flags a per-machine subdomain needs:

| Flag | Why |
|---|---|
| `-p 7681 -i 0.0.0.0` | bind inside the container; the host side is pinned to `127.0.0.1` by the `-p` mapping |
| `-W` | writable (ttyd is read-only by default) |
| `-b /emulator` | base path when behind a reverse proxy — not used locally |
| `-H` | delegate auth to reverse-proxy headers, so the subdomain gates access, not ttyd |

Started on demand, runs as `agent` (never root), and machines created before
this feature are rejected with a clear message rather than failing oddly.

**WebAssembly was considered and rejected.** Wasm SSH clients
([sshterm](https://github.com/c2FmZQ/sshterm),
[ssheasy](https://github.com/hullarb/ssheasy)) put a real SSH client in the
browser, which buys end-to-end encryption a proxy can't read. But browsers
can't open raw TCP, so a WebSocket→TCP proxy is still required, and client-side
private-key handling is discouraged. Since we own both ends, it is cost without
benefit. WebGL here is about *rendering throughput*, not connectivity — those
are unrelated concerns that the phrase "WebGL/Wasm terminal" tends to conflate.

**This does not solve Anthropic sign-in.** Claude Code OAuth in a headless
container is [closed as *not planned*](https://github.com/anthropics/claude-code/issues/34917)
(`Redirect URI ... is not supported by client`), and copying `~/.claude.json`
from an authenticated host fails because tokens are session-bound. Use
`claude setup-token` on the host → `CLAUDE_CODE_OAUTH_TOKEN`. The emulator is
still worth having for `gh auth login`, cloud CLI logins, and live debugging.

## Design notes

**Lightest OS that can still host the agent.** Alpine userland is ~8MB, but
Claude Code needs Node, so the base is `node:22-alpine`. The image lands ~640MB,
almost entirely the `@anthropic-ai/claude-code` package — the OS is noise.

**Credentials never touch this script.** `docker run -e VAR` with no value
forwards the host's value by reference; `mm` never reads, echoes, or writes the
secret. Inside the machine it goes to `~/.ssh/environment` (mode 600) rather
than a command line, because `ssh host cmd` is non-login and non-interactive —
`~/.profile` is not sourced, and putting a token in the command would expose it
in `ps`.

**`--dangerously-skip-permissions` is deliberate.** The container *is* the
sandbox; that is the entire premise. Do not run this harness outside a
container.

**Ports bind to `127.0.0.1` only.** The machine is never exposed to the LAN.

## Gotchas found while building this

| Symptom | Cause |
|---|---|
| `User agent not allowed because account is locked` | Alpine `adduser -D` writes `!` to `/etc/shadow`; sshd refuses key auth for locked accounts. Fixed with `sed 's/^agent:!/agent:*/'`. |
| sshd stops answering during boot | OpenSSH ≥9.8 `PerSourcePenalties` blackholes the polling loop. Disabled in `sshd_config`. |
| Run reports ✓ but produced nothing | `sh -s` lets a trailing successful `echo` mask an earlier failure. Now `sh -es`. |
| ttyd got `-t` `titleFixed` `<id>` as separate argv | `docker exec` mangles `k=v` passthrough args. Dropped the option; it was a cosmetic tab title. |

## Status

- ✅ boot, SSH, in-container compute, artifact capture, one-line return — verified
- ✅ `view` / `cat` / `sync` / `logs` / `ssh` / `rm`
- ✅ emulator: HTTP 200, `/token` 200, `/ws` **101 Switching Protocols**,
  interactive bash verified in-browser as `agent` on `Linux aarch64`, 11 cpu
- ✅ `mm run` — full agent loop verified end to end in **13.4s**:

  ```
  ✓ mm-1784805452-9584 — The tests pass — pytest wasn't available, so they ran
    directly and confirmed correct fizzbuzz output
    3 file(s) built · view: mm view … · sync: mm sync …
  ```

  The inner agent wrote `fizzbuzz.py` + `test_fizzbuzz.py`, discovered pytest
  was missing, adapted to running the tests directly, and reported back in one
  sentence. Artifacts independently re-verified by re-running the tests over
  SSH — `all tests passed`, `EXIT=0`. A `__pycache__/fizzbuzz.cpython-314.pyc`
  in the volume confirms Python really executed on the machine.

**Auth note.** `ANTHROPIC_API_KEY` (funded) is the simplest path and needs no
setup. `CLAUDE_CODE_OAUTH_TOKEN` from `claude setup-token` rides a Pro/Max
subscription instead — but note `setup-token` is interactive, so it cannot be
wrapped in `$( )`; command substitution swallows the browser-authorization
prompt and silently produces nothing.

## Relationship to the product

This is the local stand-in for what `packages/minimachine` does against the
hosted API — same shape (`create machine → run prompt → return handle`), no
network, no billing, no control plane.
