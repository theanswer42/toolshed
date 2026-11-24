# #3 Sandbox stage 1: dev container, egress proxy, and task shell

## Context

Builds stage 1 of `sandbox/PROJECT_SPEC.md` on the user's machine (rootless Docker 28.5, Compose 2.40). toolshed is the test repo. It was made public for rulesets, given `.github/CODEOWNERS` in #5, and has both Apps installed.

## Decisions

- Bootstrap PRs (#5 and the stage 1 PR) are authored and pushed by the implementer App. The alternative was a "pull requests only" bypass for the owner, which the spec rules out. The owner can't approve a PR when they authored it or made its last push. #4 failed for this reason: the checkout's `origin` is SSH, so the first push used the owner's key. Pushes from the host go to the `https://` URL with the token helper.
- Token files are per-task copies, mode 0444, in a 0700 directory under `$XDG_RUNTIME_DIR`. Compose ignores secret `uid` and `mode` outside swarm, and rootless Docker shows bind mounts as root-owned. The alternatives were running as container root (breaks INV-6) and mounting the secrets directory (breaks INV-1 and INV-7).
- `dns: [127.0.0.1]` stays, plus a static proxy address. Docker 28.5 already refuses external names on internal networks, so this is a second layer. It is recorded so nobody expects the "remove only the dns line" mutation to fail.
- The rules and CODEOWNERS checks moved to `lib/`, so `verify` can test them against fixtures offline instead of needing a misconfigured repo.
- `task` runs `compose run` in the background and waits on it, so SIGTERM cleans up at once. stdin is passed through explicitly. Tested under a real pseudo-terminal.
- Caches are in a second per-task volume, not tmpfs, so they don't count against the memory limit.
- `storage.googleapis.com` is not allowlisted (the user's decision). betterleaks runs as pre-commit's `system` hook.
- `release-assets.githubusercontent.com` is added to the allowlist. It is GitHub's read-only release download host, needed by shellcheck-py.
- The reviewer App has contents read at the App level. That turned out to be a second layer for INV-8, so the `reviewer-write` mutation mints with the implementer App to show the check itself bites.

## Found by the mutations and checks

- The allowlist renderer stripped inner whitespace (`a b.com` became `ab.com`).
- The INV-14 check accepted `<nil>` as a limit. The host's systemd TasksMax (57020) hid the missing PID limit.
- The plain-HTTP denial check couldn't fail, because curl exits 0 on a 403 without `-f`.
- A login shell lost Go from `PATH`, because `/etc/profile` resets it.

## Open questions

- Raised in the PR: new wording for INV-18, and a Repo setup note about the reviewer App's permissions.
- Not covered in stage 1: Go modules that redirect to Cloud Storage fail. That's acceptable until a Go project needs them.

## Promoted

- README Decisions: token copies, `~/.claude` split, Claude token in the environment, DNS, caches, native Claude binary, allowlist rendering, GCS, uv downloads, exit code.
- `sandbox/CLAUDE.md`: rootless Docker quirk; don't read the secrets.
- PR description: the INV-18 wording proposal and the allowlist additions.
