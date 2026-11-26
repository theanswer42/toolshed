# Project spec: sandbox

## Purpose

Runs a coding agent on one task inside an ephemeral container, so it can work in auto mode without access to the host. A task has a target (a GitHub issue or pull request) and a role (implementer or reviewer). It runs without human input and always ends with exactly one outcome recorded on GitHub: a pull request, a question, a review, or a reported failure.

The user starts tasks by hand and can watch their output. A future orchestrator will start tasks automatically; it is a separate project and out of scope here.

## Applies

`core`, `stacks/shell`. See `standards/README.md`.

## Entities

| Entity | Description | Key fields | Relations |
| --- | --- | --- | --- |
| Task | One run of the agent on one target in one role | repo (`owner/name`), target, role, data directory (optional), keep | Has one task container, one clone volume, and an optional data volume |
| Target | What the task works on | kind (`issue` or `pr`), number | Belongs to one repo |
| Role | What the agent does to the target | `implementer` or `reviewer` | Decides the GitHub identity and the token's permissions |
| Outcome | The single result a task ends with | kind, link | Recorded on the target and as the exit code |
| Dev image | Shared image with the toolchains, the agent, and the task runner | tag | Used by every task container |
| Egress proxy | Long-lived container that forwards allowlisted traffic | allowlist | Shared by all task containers |
| Task container | Ephemeral container where the task runner and agent run | name, limits | Joins the internal network only |
| Task volume | Ephemeral volume holding the task's clone | name | Mounted only into its task container |
| Data volume | Ephemeral, read-only volume holding sample data for one task | name | Filled from the host directory given with `--data`; mounted at `/task/data` |
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
- **What a reviewer checks.** The PR against the repo's project spec and agent spec, per the reviewing-agent rules in `standards/core.md`. Verdicts are posted as one review: a comment review, or request changes when a principle fails.

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
| INV-5 | Secrets are never written into an image layer, the task's clone, a commit, or logs | T1 | `Dockerfile`, `task`, git credential config, GitHub push protection | `verify`: image history and clone scanned with betterleaks |
| INV-6 | The agent runs as a non-root user with no capabilities and `no-new-privileges` | T1 | `Dockerfile`, `compose.yaml` | `verify`: uid and `CapEff` check |
| INV-7 | A GitHub App private key never enters a task container. A container receives only one installation token, minted for its task's repo alone, with its role's permissions. Task tokens never carry `workflows`, so a task cannot change CI | T1 | `task`; App permissions (neither App has Workflows) | `verify`: no key file in the container; token's repos and permissions match the role exactly |
| INV-8 | A reviewer task cannot change repository contents | T1 | Reviewer token: contents read only | `verify`: push with a reviewer token is rejected |
| INV-9 | No commit reaches the default branch without the user's approval of the PR's latest push | T1 | Repo ruleset (see Repo setup); `task` refuses repos without it, or where the task's App can bypass a ruleset on the default branch | `verify`: push to the default branch is rejected; `task` refuses a repo missing a required rule; `task` refuses a ruleset the App can bypass |
| INV-10 | Only text written by trusted authors enters the task prompt, and a task refuses a target opened by anyone else | T1 | Task runner | Runner tests with untrusted comments and targets |
| INV-11 | Every task ends with exactly one outcome, and that outcome is visible on the target | T2 | Task runner wraps the agent and checks GitHub | Runner tests for each outcome and for an agent that exits without one |
| INV-12 | Only the task runner changes `agent:` labels | T2 | Task runner; agent instructions | Runner tests |
| INV-13 | Every task gets its own container and volume; tasks share only the image and the proxy | T2 | `task` naming | `verify`: two tasks see separate volumes |
| INV-14 | A task container always runs with CPU, memory, and PID limits. The agent is stopped after 50 minutes, so the runner can still record the outcome before the task's token expires at 60 | T2 | `compose.yaml`, task runner | `verify`: limits present; runner test for the time limit |
| INV-15 | When a task ends without `keep`, its container and volumes are removed | T2 | `task` cleanup trap | `verify`: nothing left after exit |
| INV-16 | `task` refuses to start if a secret file is missing, empty, or readable by other host users | T2 | `task` | `verify`: start fails for each bad secret |
| INV-17 | A task container cannot resolve external domain names. Only the proxy resolves names, so DNS queries cannot carry data out | T1 | Network and DNS settings in `compose.yaml` | `verify`: resolving an external name from a task container fails |
| INV-18 | The agent's user-level Claude Code config comes only from the image. Settings are enforced through a root-owned managed settings file the agent cannot change. The other config files are copied from the image into a fresh `~/.claude` on tmpfs at start. Nothing persists from one task to the next | T1 | `Dockerfile`; entry point; tmpfs home; no shared writable volumes | `verify`: managed settings are root-owned, not writable, and match `claude/settings.json`; `~/.claude` files match the image; no volume is reused across tasks |
| INV-19 | The sandbox holds nothing private except the task's tokens. Everything else a task can see, including sample data, is treated as public | T1 | User sanitizes sample data before passing it; `task` copies only the directory named by `--data` | Process rule, owned by the user; not mechanically checked |

Notes:

- INV-9 relies on rulesets, which are free for public repos. Target repos are assumed to be public. A private repo on a plan without rulesets is refused by `task`, so INV-9 holds for every repo the sandbox runs on.
- After the user approves, the implementer token could technically merge the PR. That is accepted: it can only merge what the user approved, because a new push dismisses the approval.
- The user is a bypass actor (Repository admin role, pull requests only), so they can merge their own PRs. GitHub never counts an approval from a PR's author or last pusher. The bypass also lets the user merge any PR, including an agent's, without approving it. For agent PRs, approving before merging is a discipline the user holds to, not a rule GitHub enforces.
- Without the Workflows permission, GitHub rejects any App push that creates or changes a file under `.github/workflows/`. The cost: a task that needs a workflow change describes it in its PR, and the user commits it in their own PR.
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

## Sample data

Some tasks need example inputs, such as CSV exports for an ingest tool.

- `task --data <dir>` copies a host directory into a new data volume for that task alone, mounted read only at `/task/data`. A short-lived helper container does the copy, so the task container still has no host mounts.
- **Everything passed with `--data` is assumed to be published**, because the agent may commit it, quote it, or send it to the model. The user sanitizes it first. This is the user's responsibility, recorded as INV-19, and no mechanical check backs it up.
- Because the data is public by definition, the agent may use it directly, including as committed test fixtures.
- The task's prompt says the data exists and where it is.
- A conventional place to keep a repo's sample data on the host is a gitignored directory in the local checkout, but `task` always takes the path explicitly.

## Agent configuration

- **User-level config** lives in this repo under `sandbox/claude/`: `CLAUDE.md`, `skills/`, `agents/`, and `settings.json`. `settings.json` becomes the root-owned managed settings file; the rest is copied into a fresh tmpfs `~/.claude` at start (INV-18). Changes go through PRs: `settings.json` and any hooks are T1, because they control permissions and run code; instruction files and skills are T2.
- **The host's `~/.claude` is never mounted or copied.** It holds credentials, transcripts from other projects, and hooks and plugins that run code.
- **Project config** comes with the clone: the repo's own `CLAUDE.md` and `.claude/` directory.
- **Automatic memory is off** in tasks. Anything worth keeping goes into the repo through a PR: the scratchpad, `CLAUDE.md`, or a project spec proposal.
- **Session state**, such as transcripts and caches, is written to a writable directory inside the task container and is deleted with it.

## Repo setup

Each target repo is prepared once by the user. `task` checks the ruleset before every task, through the public rules endpoint, and refuses the repo if a rule is missing.

- **Ruleset on the default branch**, whose only bypass actor is the Repository admin role, in pull-requests-only mode. `task` checks with the task's own token that the App cannot bypass it. A copy is in `github/ta_default_ruleset.json`:
  - Require a pull request before merging, with one approval.
  - Require review from code owners. `CODEOWNERS` contains only `* @<user>`, so only the user's approval counts. An approval from the reviewer App does not.
  - Dismiss stale approvals when new commits are pushed, and require approval of the most recent push.
  - Block force pushes and deletion.
- **`CODEOWNERS`** at `.github/CODEOWNERS`. Changes to it need the user's approval like any other file.
- **GitHub secret scanning and push protection** turned on. Both are free for public repos and back up INV-5: a secret the agent tries to push is blocked by GitHub as well as by betterleaks.
- **Labels** `agent:working`, `agent:needs-input`, `agent:review-ready`, and `agent:reviewed` exist. `task` creates any that are missing.
- **Both Apps installed** on the repo. The implementer has contents, pull requests and issues read and write. The reviewer has contents read only, and pull requests and issues read and write. Both have metadata read and neither has Workflows.

## Reference models

None. Correctness is about isolation and GitHub side effects, which `verify` and the runner tests check against real containers and recorded GitHub responses.

## Runtime

- **Network.** The egress proxy is `open`, as the one component that must reach the internet. Task containers sit on an internal network with no other route out.
- **Egress allowlist** (starting point, finalized in stage 1 from the proxy's denial log):
  - Anthropic: `api.anthropic.com` for the API, and `platform.claude.com` for Claude Code's token exchange and refresh
  - GitHub: `github.com`, `api.github.com`, `codeload.github.com`, `objects.githubusercontent.com`
  - Python: `pypi.org`, `files.pythonhosted.org`
  - Go: `proxy.golang.org`, `sum.golang.org`
  - GitHub release downloads: `release-assets.githubusercontent.com`, for tools such as pre-commit hooks that fetch release binaries. Uploads go to `uploads.github.com`, which is not allowed.
  - Deliberately excluded: `storage.googleapis.com`. `proxy.golang.org` redirects some module downloads there, but allowing it would allow every Cloud Storage bucket, including writable ones. Those Go builds fail closed.
- **Claude Code settings in the image**, so it needs only the Anthropic hosts above:
  - `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1`: turns off optional telemetry and error reporting.
  - `DISABLE_AUTOUPDATER=1`: the version is pinned in the image and changes only with the image.
  - `ENABLE_CLAUDEAI_MCP_SERVERS=false` and `CLAUDE_CODE_DISABLE_ARTIFACT=1`: no claude.ai connectors or artifacts in tasks.
- **Egress proxy contract.** Task containers depend only on this contract, so the proxy can be replaced without changing anything else:
  - An HTTP forward proxy reachable as `egress:3128` on the internal network. Containers find it through `HTTPS_PROXY` and `HTTP_PROXY`.
  - It tunnels HTTPS with `CONNECT` and does not inspect TLS, so containers need no extra CA certificate.
  - Its allowlist is `egress/allowlist.txt`: one domain per line, where a leading dot also allows subdomains. The file is the same whatever proxy is used; a small script renders it into that proxy's own config.
  - It logs every allowed and denied request to stdout, one line each, with the domain.
  - It is the only component that resolves external names.
  - `verify` tests the contract's behavior, never the proxy's internals, so a replacement passes or fails the same checks.
- **Proxy choice.** Squid, in `egress/`. Its `dstdomain` rules match `CONNECT` targets directly, it logs denials clearly, and it is widely packaged. Replacing it means replacing `egress/` with anything that meets the contract.
- **Tools that ignore the proxy** fail, because task containers have no other route out. The sandbox fails closed.
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

## Deviations from the applied standards

- **Not a service.** The sandbox is not an app the runner deploys, so `project-types/service.md` does not apply. The project is a Dockerfile, a compose file, a proxy config, a host-side `task` script, and an in-image task runner.
- **Language.** `task` is shell, because nearly every step is a `docker`, `git`, or `gh` call. The task runner's language is decided at the start of stage 2: shell if it stays small, Python with `standards/stacks/python.md` if it grows logic worth testing.
- **`verify` needs Docker**, so it runs on the host by hand and in CI, per the decision to keep Docker builds out of the sandbox.

## Open questions

None. The task runner's language is decided at the start of stage 2, as noted under Deviations.

Decided:

- Target repos are public, so rulesets are available. `task` refuses repos without the required rules.
- Tasks run for at most one hour, matching the installation token's lifetime. The agent stops at 50 minutes. A token broker for longer tasks can be added later without changing the task contract.
- Claude Code needs only the Anthropic API and token hosts, with nonessential traffic turned off.
- Squid is the egress proxy, behind a contract that lets it be replaced.

## Change log

| Date | Change | Approved by |
| --- | --- | --- |
| 2026-11-25 | Stage 1 (#3, PR #6): INV-18 reworded for managed settings and a tmpfs `~/.claude`; INV-7 adds that task tokens never carry `workflows`; INV-9 and Repo setup allow only the admin role's pull-requests-only bypass, checked by `task`; allowlist adds `release-assets.githubusercontent.com` and records `storage.googleapis.com` as excluded; Repo setup lists the App permissions | @theanswer42, by approving PR #6 |
| 2026-11-26 | Applies section added; Deviations reworded for `standards/` (#11). No change to invariants | @theanswer42, by approving the PR |
