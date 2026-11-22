# Project spec: sandbox

## Purpose

Runs a coding agent on one task inside an ephemeral container, so it can work in auto mode without access to the host. A task is a GitHub issue to implement, a pull request whose review comments need addressing, or an interactive session. The user starts each task by hand and stays attached to the agent's terminal. Work leaves the sandbox only as commits pushed to a branch and a pull request.

This is the first piece of a future orchestrator that will watch several repos and start tasks itself. That orchestrator is out of scope here.

## Entities

| Entity | Description | Key fields | Relations |
| --- | --- | --- | --- |
| Task | One run of the agent against one repo | repo (`owner/name`), mode, ref, branch, keep | Has one task container and one task volume |
| Mode | What the task is for | `issue`, `pr`, `interactive` | Decides the branch and the agent's starting prompt |
| Dev image | Shared image with the toolchains and the agent | tag | Used by every task container |
| Egress proxy | Long-lived container that forwards allowlisted traffic | allowlist | Shared by all task containers |
| Task container | Ephemeral container where the agent runs | name, limits | Joins the internal network only |
| Task volume | Ephemeral volume holding the task's clone | name | Mounted only into its task container |
| Secrets | Bot GitHub token, Claude Code token | file paths on the host | Mounted read-only into task containers |

## State machines

| Entity | From | Event | To | Condition |
| --- | --- | --- | --- | --- |
| Task | — | `task` invoked | starting | Repo given; secret files exist and are readable |
| Task | starting | proxy and container up, repo cloned | ready | Clone and branch setup succeeded |
| Task | starting | any setup step fails | failed | — |
| Task | ready | agent started | running | — |
| Task | running | agent exits | finished | — |
| Task | finished / failed | cleanup | removed | `keep` not set |
| Task | finished / failed | cleanup | kept | `keep` set: container stopped, volume kept |

Branch and starting prompt by mode:

| Mode | Branch | Agent starts with |
| --- | --- | --- |
| `issue` | New branch `issue-<n>-<slug>` from the default branch | The issue's title, body, and comments, and the instruction to work it per the repo's `CLAUDE.md` and open a PR |
| `pr` | The PR's head branch | The PR's description and unresolved review comments, and the instruction to address them and push to the same branch |
| `interactive` | Default branch | No prompt. The user drives |

## Invariants

| ID | Statement | Tier | Enforced in | Property |
| --- | --- | --- | --- | --- |
| INV-1 | No host path is mounted into a task container, except the secret files, read-only | T1 | `compose.yaml`, `task` | `verify`: mounts check |
| INV-2 | The Docker socket is never mounted into or reachable from a task container | T1 | `compose.yaml` | `verify`: socket check |
| INV-3 | A task container has no route to the internet except through the egress proxy | T1 | internal network in `compose.yaml` | `verify`: direct connection fails |
| INV-4 | The proxy forwards only to domains on the allowlist | T1 | proxy config | `verify`: allowlisted host succeeds, other host fails |
| INV-5 | Secrets are never written into an image layer, the task's clone, a commit, or logs | T1 | `Dockerfile`, `task`, git config | `verify`: image history and clone scan with betterleaks |
| INV-6 | The agent runs as a non-root user with no capabilities and `no-new-privileges` | T1 | `Dockerfile`, `compose.yaml` | `verify`: uid and `CapEff` check |
| INV-7 | The agent never pushes to the repo's default branch | T1 | branch protection where available, pre-push hook, instructions | `verify`: push to default branch is rejected |
| INV-8 | Every task gets its own container and volume; nothing is shared between tasks except the image and the proxy | T2 | `task` naming | `verify`: two tasks see separate volumes |
| INV-9 | A task container always runs with CPU, memory, and PID limits | T2 | `compose.yaml` | `verify`: limits present |
| INV-10 | When a task ends without `keep`, its container and volume are removed | T2 | `task` cleanup trap | `verify`: nothing left after exit |
| INV-11 | `task` refuses to start if a secret file is missing, empty, or readable by other host users | T2 | `task` | `verify`: start fails with each bad secret |

Notes:

- INV-7 is fully enforced only with branch protection, which may need GitHub Pro for private repos. Without it, the pre-push hook and instructions are the only guard, and the hook can be bypassed by the agent. The project spec records which is in effect.
- In `pr` mode, the agent may push only to that PR's head branch, and only for PRs whose branch lives in the same repo. Fork PRs are rejected.

## Risk tiers

| Concept or module | Tier | Reason |
| --- | --- | --- |
| Mounts, privileges, network, and limits in `compose.yaml` | T1 | A mistake silently removes the isolation the whole project exists for |
| Proxy allowlist | T1 | A widened allowlist opens an exfiltration path nobody would notice |
| Secret handling in `task` | T1 | A leaked token is irreversible |
| Mode handling, branch selection, prompt building | T2 | Mistakes are visible and recoverable: wrong branch, bad prompt |
| Dev image tool installs | T3 | Failures are loud: a missing tool breaks the task immediately |
| Messages and help output | T3 | Cosmetic |

## Reference models

None. The project's correctness is about isolation, which is checked against real containers by `verify`, not modeled.

## Runtime

- Network tier: the egress proxy is `open`, because it is the one component that must reach the internet. Task containers are on an internal network with no other route out.
- Egress allowlist (starting point, to be finalized by running real tasks):
  - Anthropic: `api.anthropic.com`
  - GitHub: `github.com`, `api.github.com`, `codeload.github.com`, `objects.githubusercontent.com`
  - Python: `pypi.org`, `files.pythonhosted.org`
  - Go: `proxy.golang.org`, `sum.golang.org`
- Ports: none. Nothing listens.
- Secrets:
  - `bot_github_token`: fine-grained personal access token for the agent's GitHub identity, scoped to selected repos with contents and pull-request permissions only. Used for git over HTTPS and for `gh`.
  - `claude_token`: long-lived Claude Code token from `claude setup-token`.

## External consumers

| Consumer | Interface | Docs |
| --- | --- | --- |
| The future orchestrator | The `task` command and its exit codes | `--help` output, generated into `docs/cli.md` |

## Deviations from the base spec

- **Not a Python app.** Part 2 of `python/working-with-agents.md` does not apply. The project is a Dockerfile, a compose file, a proxy config, and a `task` shell script. Shell is chosen because nearly every step is a `docker` or `git` invocation, and a Python wrapper would add a dependency without adding checks.
- **Shell checks instead of Python checks.** `shellcheck` and `shfmt` replace ruff and ty. betterleaks and pre-commit apply as specified.
- **Properties are a `verify` script, not Hypothesis.** Each invariant gets an assertion run inside a real task container. `verify` needs Docker, so it runs on the host by hand and in CI, per the decision to keep Docker builds out of the sandbox.
- **No container contract.** The sandbox is not an app the runner deploys, so principle 15 and the Container contract do not apply.

## Open questions

- Should `interactive` mode also run in auto mode, or use Claude Code's default permission prompts? Isolation is the same either way.
- Is branch protection available on the target repos' plan? Decides how INV-7 is enforced.
- Proxy choice: tinyproxy (smaller, simple domain filter) or Squid (more mature, heavier).
- Which Claude Code endpoints besides `api.anthropic.com` are needed, and can non-essential traffic be turned off so they are not?

## Change log

| Date | Change | Approved by |
| --- | --- | --- |
