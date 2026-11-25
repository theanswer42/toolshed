# sandbox

## Overview

Runs a coding agent on one task inside an ephemeral container, so it can work in auto mode without access to the host. The rules it must obey are in [`PROJECT_SPEC.md`](PROJECT_SPEC.md). This README describes how it is built.

Stage 1 is done: `task <owner/repo> --role implementer|reviewer` starts a hardened container with the repo cloned at `/work` and opens a shell. You run Claude Code by hand inside it. The in-image task runner (stage 2) is not built yet.

## Architecture

```text
 host                                    docker (rootless)
 ─────────────────────────────────────   ─────────────────────────────────────────────
 task                                     sandbox-internal (internal: true, 172.31.250.0/24)
  ├ preflight: config, secrets, rules        ┌──────────────────────┐
  ├ mint App JWT (openssl, key on host)      │ task container        │  no DNS (127.0.0.1)
  ├ mint installation token ─► GitHub        │  /work  (task volume) │  egress → 172.31.250.2
  ├ stage token files (0700 dir, tmpfs)      │  /cache (task volume) │
  └ docker compose run ─────────────────────►│  /run/secrets/*  (ro)  │
                                             └──────────┬───────────┘
                                                        │ CONNECT :443
                                             ┌──────────▼───────────┐ sandbox-egress
                                             │ egress (Squid)       ├──────────────► internet
                                             │ allowlist.txt only   │   (allowlisted domains)
                                             └──────────────────────┘
```

| Component | Path | Role |
| --- | --- | --- |
| Egress proxy | `egress/` | Squid behind the egress proxy contract. `render-squid.sh` turns `allowlist.txt` into Squid's `dstdomain` list at build time |
| Dev image | `image/` | Toolchains, Claude Code, `gh` and `git` wrappers, entry point |
| Agent config | `claude/` | `settings.json` becomes the managed settings file; the rest is copied into `~/.claude` |
| Compose file | `compose.yaml` | Networks, limits, hardening, secrets. One file, used by two kinds of project (below) |
| `task` | `task` | Host-side command: preflight, token minting, container start, cleanup |
| `verify` | `verify` | One check per invariant, against real containers |
| Preflight rules | `lib/` | The ruleset and CODEOWNERS checks, separate so `verify` can test them against fixtures |
| Mutations | `tests/mutate` | Shows each `verify` check fails when its protection is removed |

**Compose projects.** The proxy runs as project `sandbox-egress`. Each task is its own project, `sandbox-task-<id>`, started with `docker compose run`. Both networks have fixed names, so every project shares them. Volumes are scoped to the project, so each task gets fresh `work` and `cache` volumes (INV-13). Compose prints a warning that `sandbox-internal` "was not created for project …". That is expected.

**A task, start to finish.**

1. `task` checks its arguments, the config file, and the secret files (INV-16).
2. It signs an App JWT with `openssl`, finds the App's installation on the repo, and mints an installation token for that one repo, with the role's permissions (INV-7). If the token GitHub returns has other permissions, `task` stops.
3. It checks the default branch's rules and `.github/CODEOWNERS`, and asks GitHub whether the task's own App can bypass any ruleset that applies. It refuses the repo unless the answer is `never` (INV-9).
4. It writes the token and a copy of the Claude token to `$XDG_RUNTIME_DIR/sandbox/<id>/`, a 0700 directory on tmpfs.
5. It starts the proxy if needed, then runs the task container. The entry point copies `~/.claude` from the image, sets the git identity to the App's bot, clones the repo, exports `CLAUDE_CODE_OAUTH_TOKEN`, and opens a shell.
6. When the shell exits, or `task` gets a signal, cleanup revokes the GitHub token on GitHub (`DELETE /installation/token`), deletes the token directory, then removes the container and volumes (INV-15). This also happens when preflight fails after minting. With `--keep`, the container is stopped and the volumes are kept, but the tokens are still revoked and deleted.

**Inside the container.** `git` gets the token from a credential helper that reads `/run/secrets/github_token` on each use. `gh` is a wrapper that sets `GH_TOKEN` for that one call. Neither writes the token anywhere (INV-5). They are conveniences, not a boundary: the file is readable by the agent. Commits are made as `<app-slug>[bot]`.

## Running locally

### One-time setup

1. **GitHub Apps.** Create two Apps under your account, an implementer and a reviewer, with no webhook. Install each only on selected repos.
   - **Implementer:** contents, pull requests and issues **read and write**; metadata read.
   - **Reviewer:** contents **read only**; pull requests and issues **read and write**; metadata read. With contents read only at the App level, GitHub refuses a write token for it even if `task` asked for one: a second layer behind INV-8.
   - **Neither App gets Workflows.** Without it, GitHub rejects any App push that touches `.github/workflows/`, so agents can't change CI. A task that needs a workflow change describes it in its PR, and you commit it in your own PR.
2. **Keys.** Download each App's private key into a directory only you can read:
   ```sh
   mkdir -p ~/.config/sandbox/secrets && chmod 700 ~/.config/sandbox ~/.config/sandbox/secrets
   mv ~/Downloads/<implementer>.private-key.pem ~/.config/sandbox/secrets/implementer_app_key
   mv ~/Downloads/<reviewer>.private-key.pem    ~/.config/sandbox/secrets/reviewer_app_key
   chmod 600 ~/.config/sandbox/secrets/*
   ```
3. **Claude token.** Run `claude setup-token`, then save the token without putting it in your shell history:
   ```sh
   umask 077; cat > ~/.config/sandbox/secrets/claude_token   # paste, then Ctrl-D
   ```
4. **Config.** Create `~/.config/sandbox/config` with mode 0600. It holds only values that aren't secret:
   ```sh
   IMPLEMENTER_APP_ID=123456     # from each App's settings page
   REVIEWER_APP_ID=234567
   GITHUB_USER=your-login        # the only login CODEOWNERS may name
   # optional: SECRETS_DIR, SANDBOX_CPUS (4), SANDBOX_MEMORY (8g), SANDBOX_PIDS (1024)
   ```
5. **Each target repo**, which must be public (see `PROJECT_SPEC.md`, Repo setup):
   - A ruleset on the default branch. It requires a pull request with one approval and code-owner review, dismisses stale approvals, requires approval of the latest push, and blocks force pushes and deletion. Its only bypass actor is the **Repository admin** role, in **pull requests only** mode, so you can merge your own PRs (never push directly) and the Apps can't. [`github/ta_default_ruleset.json`](../github/ta_default_ruleset.json) holds a copy. Import it under Settings → Rules → Rulesets → New ruleset → Import a ruleset, or run `gh api -X POST repos/<owner>/<repo>/rulesets --input github/ta_default_ruleset.json`.
   - `.github/CODEOWNERS` containing only `* @your-login`.
   - Secret scanning and push protection turned on.
   - Both Apps installed.
6. **Images.** Build them on the host, which has normal network access:
   ```sh
   docker compose -f sandbox/compose.yaml --profile task build
   ```
   Rebuild after changing anything under `image/`, `claude/` or `egress/`.
7. **Hooks.** For this repo, install pre-commit and the pinned betterleaks binary, then install the hooks:
   ```sh
   uv tool install pre-commit==4.7.0
   curl -fsSL -o /tmp/bl.tgz https://github.com/betterleaks/betterleaks/releases/download/v1.10.1/betterleaks_1.10.1_linux_x64.tar.gz
   echo "c174b42d7aa60caf58c0c3e555c0e4bed01fe6b0d99a412bce777b5af4ce913e  /tmp/bl.tgz" | sha256sum -c
   tar -C ~/.local/bin -xzf /tmp/bl.tgz betterleaks
   pre-commit install
   ```

Use a throwaway public repo for the first runs.

### Usage

```sh
sandbox/task owner/repo --role implementer           # shell in /work, as the implementer bot
sandbox/task owner/repo --role reviewer --keep       # keep the volumes afterwards
sandbox/task owner/repo --role implementer --data ./sample   # read-only copy at /task/data
```

Inside the shell, run `claude`. It starts in auto mode. If stdin is not a terminal, `task` runs without a TTY, so commands can be piped in. The full reference is in [`docs/cli.md`](docs/cli.md).

To watch the proxy: `docker logs -f sandbox-egress-egress-1`. Each request is one line, either `TCP_TUNNEL/200 CONNECT host:443` or `TCP_DENIED/403 …`.

### Checks

```sh
sandbox/verify                                  # offline: no secrets (CI runs this)
sandbox/verify --online owner/repo              # also INV-5, 7, 8, 9, 15 with real tokens
sandbox/tests/mutate                            # each check fails without its protection
sandbox/tests/mutate --online owner/repo        # plus the token mutations
```

`verify --online` pushes a branch named `verify-implementer-<id>` and then deletes it. It also tries to push an empty commit to the default branch, which the ruleset must reject.

## Decisions

- **2026-11-24: per-task token copies, mode 0444 in a 0700 directory** (#3). Rootless Docker shows a bind-mounted host file to the container as owned by root. Compose ignores `uid` and `mode` for file secrets outside swarm, so a 0600 file can't be read by the agent (uid 10001). The 0700 directory on `$XDG_RUNTIME_DIR` keeps the copies away from other host users. The alternatives were running the agent as container root (breaks INV-6) and mounting the secrets directory itself (breaks INV-1 and INV-7).
- **2026-11-24: `~/.claude` is a tmpfs filled at start; settings are managed** (#3). Claude Code writes session state under `~/.claude`, so it can't be read only. `claude/settings.json` becomes `/etc/claude-code/managed-settings.json`, root-owned, which the agent can't override. The other files are copied fresh on each start. This needs a change to INV-18's wording, proposed in the PR.
- **2026-11-24: the Claude token is in the agent's environment** (#3). Claude Code reads `CLAUDE_CODE_OAUTH_TOKEN`, so every process the agent starts can read it. The agent can read the GitHub token too, since `/run/secrets/github_token` is mode 0444. The difference is reach and lifetime. The GitHub token reaches one repo and is revoked when the task ends, an hour at most. The Claude token is long-lived and works for the whole account. Accepted for stage 1, because the agent needs the Claude token to run. Keeping it out of the container is #7.
- **2026-11-24: DNS (INV-17).** On Docker 28.5 (rootless), the embedded resolver does not answer external names on an internal network. Task containers still get `dns: [127.0.0.1]`, and reach the proxy by a static address through `extra_hosts`, so INV-17 doesn't depend on that Docker behavior. `verify` tests the outcome. Removing only the `dns` line does not make it fail, because the internal network blocks resolution on its own.
- **2026-11-24: caches in a second per-task volume.** uv, Go and pre-commit caches go to `/cache`, a task volume removed with the task, instead of a size-limited tmpfs that counts against the memory limit. Home and `/tmp` are 1 GB tmpfs mounts, mounted `exec` because test runners execute from `/tmp`.
- **2026-11-24: Claude Code's native binary, pinned and checksummed.** It is downloaded from `downloads.claude.ai` at build time and checked against the release manifest's SHA-256. That avoids piping the installer into a shell, and means no Node in the image.
- **2026-11-24: the allowlist is rendered at build time.** `render-squid.sh` runs in the egress Dockerfile and rejects any entry that isn't a plain domain. A change to `allowlist.txt` takes effect after `docker compose build egress`. Changing it at runtime would need a writable config.
- **2026-11-24: `storage.googleapis.com` stays off the allowlist** (#3). `proxy.golang.org` redirects many module downloads to signed Cloud Storage URLs. The proxy can't tell buckets apart without inspecting TLS, so allowing them would open uploads to any public-writable bucket. Go builds that need redirected modules fail loudly. betterleaks runs as pre-commit's `system` hook from the pinned binary, rather than being built from Go source.
- **2026-11-24: uv doesn't download interpreters.** `UV_PYTHON_DOWNLOADS=never`. Python 3.13 (the default) and 3.14 are baked into the image. Other versions would need GitHub release-asset hosts and a writable install directory.
- **2026-11-25: the owner can bypass, the Apps can't** (#3). With you as the only code owner and no bypass list, you could never merge a PR of your own: GitHub never counts an approval on a PR you authored or last pushed. You are now a bypass actor (Repository admin role, pull requests only). App tokens can't see the bypass list, so `task` checks `current_user_can_bypass` with the task's token instead, which tests exactly what matters: that this App can't bypass. The alternatives were a second human account as code owner, or making your own edits as the App, which blurs who wrote what.
- **2026-11-25: tasks default to Opus.** `"model": "opus"` in the managed settings. Without it, Claude Code 2.1.331 used `claude-sonnet-5-5`, its default for this plan; with it, tasks run `claude-opus-5-5`. The alias follows whatever the pinned Claude Code version maps `opus` to, so a newer Opus arrives with an image update. It sets a default, not a lock: `--model` still overrides it. `availableModels: ["opus"]` didn't stop `--model sonnet` either, so it isn't set.
- **2026-11-24: one stage 1 exit code.** Every failure before the shell starts exits 64. After that, `task` exits with the shell's status. Stage 2 adds the outcome codes.
