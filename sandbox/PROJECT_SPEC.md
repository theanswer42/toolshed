# Project spec: sandbox

## Purpose

Runs a coding agent on one task inside an ephemeral container, so it can work in auto mode without access to the host. A task has a target (a GitHub issue or pull request) and a role (implementer or reviewer). It runs without human input and always ends with exactly one outcome recorded on GitHub: a pull request, a question, a review, or a reported failure.

The user starts tasks by hand and can watch their output. A future orchestrator will start tasks automatically; it is a separate project and out of scope here.

## Entities

| Entity | Description | Key fields | Relations |
| --- | --- | --- | --- |
| Task | One run of the agent on one target in one role | repo (`owner/name`), target, role, keep | Has one task container and one task volume |
| Target | What the task works on | kind (`issue` or `pr`), number | Belongs to one repo |
| Role | What the agent does to the target | `implementer` or `reviewer` | Decides the GitHub identity and the token's permissions |
| Outcome | The single result a task ends with | kind, link | Recorded on the target and as the exit code |
| Dev image | Shared image with the toolchains, the agent, and the task runner | tag | Used by every task container |
| Egress proxy | Long-lived container that forwards allowlisted traffic | allowlist | Shared by all task containers |
| Task container | Ephemeral container where the task runner and agent run | name, limits | Joins the internal network only |
| Task volume | Ephemeral volume holding the task's clone | name | Mounted only into its task container |
| GitHub App | One per role, installed on the user's account for selected repos | app ID, private key on the host | Mints the task's installation token |
| Trusted authors | GitHub logins whose words the agent may act on | the user, both Apps | Filters what enters the prompt |

## Tasks

| Target | Role | Allowed outcomes | Branch |
| --- | --- | --- | --- |
| Issue | Implementer | PR opened, or question posted on the issue | New branch `issue-<n>-<slug>` from the default branch |
| PR | Implementer | Commits pushed with replies to the review threads, or question posted on the PR | The PR's head branch |
| PR | Reviewer | Review posted | The PR's head branch, read only |

Every role can also end with a failure, reported as a comment on the target.

Rules:

- **Ask before building.** An implementer that is blocked before writing code posts its questions on the issue and stops. Once it has pushed a branch, it opens a draft PR, and all later questions go on that PR. Work is never left only in the container.
- **PR scope.** Only PRs whose head branch is in the same repo are eligible. An implementer works only on PRs opened by the implementer App. A reviewer may review any eligible PR.
- **What a reviewer checks.** The PR against the repo's project spec and agent spec, per the reviewing-agent rules in `python/working-with-agents.md`. Verdicts are posted as one review: a comment review, or request changes when a principle fails.

## State machines

Task:

| From | Event | To | Condition |
| --- | --- | --- | --- |
| — | `task` invoked on the host | preparing | Arguments valid; secret files present and private |
| preparing | Target fetched and eligible, token minted, container started, repo cloned, branch checked out | running | Target author is trusted; target is not labeled `agent:working` |
| preparing | Any step fails | failed | — |
| running | Agent exits and reports a valid outcome | done | The outcome is one the role allows, and it can be seen on GitHub |
| running | Agent exits without a valid outcome, or times out | failed | — |
| done / failed | Cleanup | removed | `keep` not set |
| done / failed | Cleanup | kept | `keep` set: container stopped, volume kept |

Target labels, set only by the task runner, never by the agent:

| Label | Meaning | Set when |
| --- | --- | --- |
| `agent:working` | A task is running on this target | Task enters running |
| `agent:needs-input` | Waiting on the user | Outcome is a question or a failure |
| `agent:review-ready` | A PR is ready for review | Outcome is PR opened or commits pushed |
| `agent:reviewed` | A reviewer has posted a review | Outcome is review posted |

Starting a new task on a target removes its previous `agent:` labels.

Outcomes and exit codes:

| Outcome | Exit code |
| --- | --- |
| PR opened, commits pushed, or review posted | 0 |
| Question posted | 2 |
| Failure, reported on the target | 1 |
| Failure before the target could be reached, such as bad arguments or missing secrets | 64 |

## Invariants

| ID | Statement | Tier | Enforced in | Check |
| --- | --- | --- | --- | --- |
| INV-1 | No host path is mounted into a task container, except the task's token and the Claude Code token, read-only | T1 | `compose.yaml`, `task` | `verify`: mounts check |
| INV-2 | The Docker socket is never mounted into or reachable from a task container | T1 | `compose.yaml` | `verify`: socket check |
| INV-3 | A task container has no route to the internet except through the egress proxy | T1 | Internal network in `compose.yaml` | `verify`: direct connection fails |
| INV-4 | The proxy forwards only to domains on the allowlist | T1 | Proxy config | `verify`: an allowlisted host succeeds, another fails |
| INV-5 | Secrets are never written into an image layer, the task's clone, a commit, or logs | T1 | `Dockerfile`, `task`, git credential config | `verify`: image history and clone scanned with betterleaks |
| INV-6 | The agent runs as a non-root user with no capabilities and `no-new-privileges` | T1 | `Dockerfile`, `compose.yaml` | `verify`: uid and `CapEff` check |
| INV-7 | A GitHub App private key never enters a task container. A container receives only one installation token, minted for its task's repo alone, with its role's permissions | T1 | `task` | `verify`: no key file in the container; token's repos and permissions match the role |
| INV-8 | A reviewer task cannot change repository contents | T1 | Reviewer token: contents read only | `verify`: push with a reviewer token is rejected |
| INV-9 | The agent never pushes to the default branch and never merges | T1 | Branch protection where available, plus a pre-push hook | `verify`: push to the default branch is rejected |
| INV-10 | Only text written by trusted authors enters the task prompt, and a task refuses a target opened by anyone else | T1 | Task runner | Runner tests with untrusted comments and targets |
| INV-11 | Every task ends with exactly one outcome, and that outcome is visible on the target | T2 | Task runner wraps the agent and checks GitHub | Runner tests for each outcome and for an agent that exits without one |
| INV-12 | Only the task runner changes `agent:` labels | T2 | Task runner; agent instructions | Runner tests |
| INV-13 | Every task gets its own container and volume; tasks share only the image and the proxy | T2 | `task` naming | `verify`: two tasks see separate volumes |
| INV-14 | A task container always runs with CPU, memory, and PID limits, and a task has a time limit | T2 | `compose.yaml`, task runner | `verify`: limits present |
| INV-15 | When a task ends without `keep`, its container and volume are removed | T2 | `task` cleanup trap | `verify`: nothing left after exit |
| INV-16 | `task` refuses to start if a secret file is missing, empty, or readable by other host users | T2 | `task` | `verify`: start fails for each bad secret |

Notes:

- INV-9 is fully enforced only with branch protection, which needs GitHub Pro for private repos on a personal account. Without it, the implementer token's contents permission is enough to merge, and only the pre-push hook and instructions stand in the way. This spec records which applies once it is known.
- INV-10 is enforced on what the runner puts in the prompt. The agent could still fetch untrusted text itself with `gh`; its instructions forbid that, and a reviewer checks for it. It is not fully mechanical.

## Risk tiers

| Concept or module | Tier | Reason |
| --- | --- | --- |
| Mounts, privileges, network, and limits in `compose.yaml` | T1 | A mistake silently removes the isolation the project exists for |
| Proxy allowlist | T1 | A widened allowlist opens an exfiltration path nobody would notice |
| Token minting and secret handling in `task` | T1 | A leaked or over-scoped credential is irreversible |
| Trusted-author filtering | T1 | It is the main defense against prompt injection |
| Outcome checking, labels, and failure reporting | T2 | Mistakes are visible on GitHub and recoverable |
| Prompt building, branch selection | T2 | Mistakes are visible and recoverable |
| Dev image tool installs | T3 | Failures are loud: a missing tool breaks the task at once |
| Messages and help output | T3 | Cosmetic |

## Reference models

None. Correctness is about isolation and GitHub side effects, which `verify` and the runner tests check against real containers and recorded GitHub responses.

## Runtime

- **Network.** The egress proxy is `open`, as the one component that must reach the internet. Task containers sit on an internal network with no other route out.
- **Egress allowlist** (starting point, finalized in stage 1):
  - Anthropic: `api.anthropic.com`
  - GitHub: `github.com`, `api.github.com`, `codeload.github.com`, `objects.githubusercontent.com`
  - Python: `pypi.org`, `files.pythonhosted.org`
  - Go: `proxy.golang.org`, `sum.golang.org`
- **Ports.** None. Nothing listens.
- **Watching.** The agent runs headless, and its output streams to the terminal that started the task. Ctrl-C ends the task, which then reports a failure.
- **GitHub identity.** Two GitHub Apps, one per role, owned by and installed on the user's account for selected repos. Commits, PRs, and comments then show as `<implementer-app>[bot]` or `<reviewer-app>[bot]`, separate from the user and from each other. Fine-grained personal access tokens are not used, because they cannot reach repos where the account is only a collaborator, so a separate bot account's token could not reach the user's repos.
- **Token permissions**, narrowed when the token is minted:

| Role | Contents | Pull requests | Issues | Metadata |
| --- | --- | --- | --- | --- |
| Implementer | write | write | write | read |
| Reviewer | read | write | write | read |

- **Secrets on the host:**
  - `implementer_app_key`, `reviewer_app_key`: the Apps' private keys. Read only by `task` on the host to mint a token; never mounted.
  - `claude_token`: a long-lived Claude Code token from `claude setup-token`.
- **Secrets in the container**, as read-only files under `/run/secrets`: `github_token` (the task's installation token) and `claude_token`.

## Implementation stages

Each stage ends with its exit criteria met and the user's sign-off before the next starts.

1. **Dev container.** The dev image, egress proxy, compose file, token minting, and a `task` command that starts a container with a cloned repo and drops the user into a shell. The user runs Claude Code by hand inside it; this is also the debugging path from then on. Covers INV-1 to INV-9 and INV-13 to INV-16.
   Exit criteria: `verify` passes. By hand, Claude Code starts in auto mode, the implementer token can clone, push a branch, and open a PR, the reviewer token cannot push, and a request to a domain off the allowlist fails.
2. **Task runner.** The in-image entry point that takes a target and a role, builds the prompt from trusted content, runs the agent headless, checks the outcome, sets labels, and reports failures. The host `task` command only passes arguments through. Covers INV-10 to INV-12.
   Exit criteria: runner tests pass. By hand, each target and role combination has produced its expected outcome on a real repo, including a question and a failure.
3. **Automation.** Out of scope: the orchestrator is its own project with its own spec. This project's interface to it is the `task` command, its arguments, and its exit codes.

## External consumers

| Consumer | Interface | Docs |
| --- | --- | --- |
| The future orchestrator | The `task` command, its arguments, and its exit codes | `--help` output, generated into `docs/cli.md` |

## Deviations from the base spec

- **Not a Python app.** Part 2 of `python/working-with-agents.md` does not apply. The project is a Dockerfile, a compose file, a proxy config, a host-side `task` script, and an in-image task runner.
- **Language.** `task` is shell, because nearly every step is a `docker`, `git`, or `gh` call. The task runner's language is decided at the start of stage 2: shell if it stays small, Python with the base spec's Part 2 if it grows logic worth testing.
- **Shell checks.** `shellcheck` and `shfmt` replace ruff and ty for shell code. betterleaks and pre-commit apply as specified.
- **Properties are a `verify` script.** Each isolation invariant gets an assertion run against a real task container. `verify` needs Docker, so it runs on the host by hand and in CI, per the decision to keep Docker builds out of the sandbox.
- **No container contract.** The sandbox is not an app the runner deploys, so principle 15 and the Container contract do not apply.

## Open questions

- Is branch protection available on the target repos' plan? Decides how INV-9 is enforced.
- Installation tokens expire after one hour. Is a one-hour task limit acceptable at first, or is a token broker needed so long tasks can refresh?
- Proxy choice: tinyproxy (smaller, simple domain filter) or Squid (more mature, heavier).
- Which Claude Code endpoints besides `api.anthropic.com` are needed, and can non-essential traffic be turned off so they are not?
- The time limit for a task.

## Change log

| Date | Change | Approved by |
| --- | --- | --- |
