# Core standards

These standards tell coding and reviewing agents how to build software so that a human can trust it without reading every line. The human reviews one small artifact per project, the project spec, and deterministic checks tie the code to it.

This document holds what applies to every project, in any language: the principles, the agents' roles, and how to start a project. The other documents in `standards/` add rules for a project type, a topic, or a language stack. Each project spec says which of them apply. `standards/README.md` lists them.

**Order of authority.** The user's direct instruction comes first, then the project spec, then the standards that apply, then agent judgment. If a rule cannot be met, stop and ask. Do not quietly weaken the rule.

## Terms

| Term | Meaning |
| --- | --- |
| Project spec | `PROJECT_SPEC.md` at the repo root. Lists the project's entities, invariants, risk tiers, the standards that apply, and deviations from them. |
| Invariant | A plain-language statement that must always hold, with a stable ID such as `INV-3`. |
| Core | Pure domain logic. No I/O, clock, randomness, environment, or global state. |
| Shell | Everything else: HTTP handlers, repositories, CLI entry points, schedulers, external clients. |
| Property | An executable test that asserts an invariant over generated inputs. |
| Reference model | A deliberately simple implementation used as an oracle for the real one. |
| Risk tier | T1, T2, or T3. Sets how much verification and human review a piece of code gets. See principle 9. |
| Change report | The structured summary a coding agent writes at the end of every change. See principle 13. |

## Where each kind of instruction lives

Four files guide the work, and each has one job. Keeping them apart stops domain rules from landing in a file agents rewrite freely.

| File | Holds | Who changes it |
| --- | --- | --- |
| `standards/` | How to build and verify, across all projects | The user |
| `PROJECT_SPEC.md` | What this app must do: entities, invariants, tiers, deviations | Agents propose, the user approves |
| `README.md` | How the program is shaped and why: overview, components, key decisions | Agents, with every change that alters the shape |
| `CLAUDE.md` | How to work in this repo: pointers and operational notes | Agents, freely |

`CLAUDE.md` stays thin. It contains:

- Links to `PROJECT_SPEC.md` and to the standards it says apply, with the instruction to read them before coding.
- The commands to run the app, the checks, and mutation testing.
- Operational notes for this repo: required environment variables, local setup, known quirks.
- Where tasks are tracked, and the scratchpad naming convention.
- A reminder that every change ends with the change report.

`CLAUDE.md` never contains invariants, tiers, or domain rules, and it does not restate the project spec or the standards. If an agent learns something that amounts to a domain rule, it proposes a project spec change instead of noting it in `CLAUDE.md`.

## Principles

Each principle has a rule, the reason for it, and what a reviewing agent checks. When a case is not covered, apply the reason.

### 1. The project spec is the source of truth

**Rule.** Behavior derives from the invariants in `PROJECT_SPEC.md`. Agents may propose additions, changes, or removals, but never apply them without the user's explicit approval.

**Why.** It is the one artifact the user reads in full. If agents can edit it freely, nothing anchors the code.

**Check.** Any diff to `PROJECT_SPEC.md` has a recorded approval in the change report. Every T1 or T2 behavior change maps to an invariant ID.

### 2. Functional core, imperative shell

**Rule.** Domain decisions live in pure functions. The shell gathers inputs, calls the core, and persists or returns the result. The core receives time, random values, and generated IDs as arguments. Core functions do not mutate their arguments, write logs, or keep module-level caches.

**Why.** Pure code can be tested with generated inputs and no mocks. It also concentrates the logic worth reviewing into one place.

**Check.** Import rules pass. The core has no I/O, clock, environment, or random calls, and no argument mutation, logging, or module-level state. Shell functions do not branch on domain rules.

### 3. Make illegal states unrepresentable

**Rule.** Parse raw input into typed domain values at the boundary. The core accepts only those types. Use enums or unions for closed sets, and distinct types for IDs, money, and units.

**Why.** The type checker is a deterministic reviewer that runs on every change.

**Check.** Strict type checking passes on the core. No untyped dictionaries or `Any` in core signatures. Every suppression has a written reason.

### 4. Enforce each invariant at the lowest layer that can

**Rule.** If the database schema can enforce an invariant, it does, in addition to the core. This covers NOT NULL, CHECK, UNIQUE, and foreign keys.

**Why.** A schema constraint holds no matter which code path writes the data, including paths written later.

**Check.** Each invariant in the project spec lists where it is enforced. The schema contains the constraints listed.

### 5. Properties over examples for the core

**Rule.** Every invariant has at least one property-based test that names its invariant ID. Example tests are for regressions and for documenting specific cases.

**Why.** A property is short enough to review and covers inputs nobody thought to write down.

**Check.** Each invariant ID appears in the tests. The property calls the real function, not a mock. Generators reach empty, zero, boundary, and duplicate values.

### 6. Stateful behavior gets a reference model

**Rule.** Where correctness depends on a sequence of operations, write the simplest possible model of the behavior. Run generated operation sequences against both and compare. The model is written for obviousness, not speed.

**Why.** A 50-line model that is plainly right can vouch for a far larger implementation.

**Check.** The model imports nothing from the implementation. It is small enough to read in one sitting.

### 7. Tests are independent of the implementation

**Rule.** Write properties from the project spec, before the implementation or without reading it. Use a separate agent context where the tooling allows. Never weaken, skip, or delete a failing test to make a change pass.

**Why.** Tests written beside the code share its misunderstandings. A failing property means the code is wrong or the invariant is wrong, and the second is the user's decision.

**Check.** Any diff that loosens an assertion, narrows a generator, or adds a skip is flagged and explained in the change report.

### 8. Tests must prove they bite

**Rule.** Run mutation testing on the core. A surviving mutant in T1 code is either killed with a new test or justified in the change report.

**Why.** Passing tests say little unless they fail when the code is wrong. Mutation testing measures that without a human reading the tests.

**Check.** The change report states the mutation score for the code touched and lists surviving mutants.

### 9. Effort follows risk

**Rule.** Every module has a tier, assigned in the project spec. When unsure, use the higher tier. Code that mixes tiers is split.

**Why.** Review attention is limited. Light review is safe only where failure is visible and reversible.

**Check.** Touched modules are classified. The verification matches the tier.

| Tier | What belongs here | Required verification | Human review |
| --- | --- | --- | --- |
| T1 | Failure is silent or irreversible: money, deletion, data integrity, auth, migrations | Invariants, properties, mutation testing with no unexplained survivors, schema constraints | Line by line |
| T2 | Domain logic where failure is visible and recoverable | Invariants, properties, mutation score reported | Shape, plus the change report |
| T3 | Plumbing, UI, glue, formatting | Type checks, lint, a smoke test per entry point | Change report only |

### 10. Mechanical rules live in tools

**Rule.** If a linter, type checker, or CI step can enforce a rule, configure it there. Fast checks run twice: as pre-commit hooks for local feedback, and again in CI, which is authoritative. Never bypass hooks with `--no-verify`, and never disable or loosen a check to make a change pass. A false positive is resolved with an allowlist entry that states its reason. Any change to check configuration, including allowlists and tool versions, is treated as T1.

**Why.** Tool-enforced rules do not depend on an agent remembering them, and they keep this document short.

**Check.** All required checks passed in CI. Any diff to their configuration is flagged, and every new allowlist entry has a reason.

### 11. One way to build

**Rule.** Follow the default stack and layout in the stack document that applies. A deviation needs a reason recorded in the project spec.

**Why.** When every project has the same shape, skimming works because anomalies stand out.

**Check.** Layout and dependencies match the defaults or a recorded deviation. New dependencies are listed in the change report.

### 12. Fail loudly

**Rule.** No swallowed exceptions, no silent defaults for missing data, no fallback path that hides a failure. Errors surface to the caller or the log with enough context to act on.

**Why.** T3 code gets light review only because its failures are visible. Silent failure breaks that bargain.

**Check.** No bare or broad exception handlers without a re-raise or explicit handling. No default values that stand in for missing required data.

### 13. Every change is a pull request with a change report

**Rule.** Each change is delivered as a pull request, one per issue, from its own branch. The change report below is the PR description. It states facts and does not assess its own quality. The coding agent never merges its own PR: the user merges, after the reviewing agent's review.

**Why.** The report tells the user where to look, which is what makes skimming safe. A PR puts the report, the diff, the check results, and the review in one place, and merging stays a human decision.

**Check.** The reviewing agent reruns the checks, confirms each line of the report against the diff, and posts its verdict as a review on the PR.

```markdown
## Change report
- Summary: one or two sentences
- Issue: #N, or "none" during v0
- Tiers touched: T1 / T2 / T3, with module paths
- Invariants affected: IDs, or "none"
- Project spec changes: none, or the change and the user's approval
- Tests: properties added or changed, with invariant IDs
- Loosened tests: none, or each one with the reason
- Checks run: lint, types, imports, tests, mutation (score, survivors)
- New dependencies: none, or name and reason
- Docs: README updated / not needed; interface docs updated / not needed
- Scratchpad: file path, and what was promoted out of it
- Not verified: anything untested, assumed, or stubbed
- Needs human review: the specific files or functions, with the reason
```

### 14. Documentation stays true to the code

**Rule.** Keep four written records, each with one job:

- **README.** The shape of the program: what it does, its main components and how they connect, and how to run it. A Decisions section records each significant choice with the alternatives and the reason. Complex algorithms and state machines are explained there. The README links to invariant IDs and never restates them.
- **Interface docs.** API or CLI references, written only when the project spec lists an external consumer, such as another project or its agents. They are precise and complete, and are either generated from code or checked against it by a test. A change to a documented interface is at least T2, because breaking a consumer is silent from this repo's side.
- **Issues.** After v0, every task starts as an issue stating the problem, the acceptance criteria, and the affected invariant IDs. Commits and the change report reference it.
- **Scratchpad.** `agent-scratchpad/`, committed to git, with one file per task. It records decisions, rejected alternatives, and open questions, not a transcript of reasoning. Agents do not read it unless a task or the user points them to it. Before a task ends, anything durable is promoted: decisions to the README, rules to a project spec proposal, operational notes to `CLAUDE.md`. The scratchpad is never the only record of a decision.

**Why.** Agents trust documentation completely, so docs that drift from the code mislead them. Generated or tested docs cannot drift. The scratchpad keeps the reasoning behind past work available without making it a source of truth.

**Check.** The change report's Docs line matches the diff: a change to components, data flow, or a decision updates the README. Interface doc tests pass. The task's scratchpad file exists, and nothing in it that should have been promoted was left behind.

### Agent roles

**Coding agent.** Read the project spec and the task's issue before writing code. Start the task's scratchpad file. Write or update properties before the implementation for T1 and T2 work. Stop and ask when a task needs an invariant that does not exist. Stop and ask before building anything that runs outside a request, such as a background job, scheduler, polling loop, or long-running worker: these standards do not cover them yet. Before finishing, update the README and interface docs as needed, promote durable scratchpad content, and end with the change report.

**Reviewing agent.** Verify the change against the project spec and the standards that apply. Rerun the checks instead of trusting the report. Return pass or fail per principle with evidence. Do not comment on style that the tools already enforce.

The reviewing agent looks first for these: loosened tests, invariants without properties, domain logic in the shell, changed check configuration, and modules placed in too low a tier.

## Supporting rules

### Documentation details

- **README.** Sections in this order: Overview, Architecture (components and data flow), Running locally, Decisions. Keep it to a few screens. Detail lives in code, docstrings, and `docs/`.
- **Decisions.** One entry per decision: the date, what was decided, the alternatives considered, the reason, and the issue number if there is one.
- **Interface docs.** Generated from code where the stack allows it. Otherwise a test compares the documented interface with the code and fails on anything missing or extra. The stack document says how.
- **CLI docs.** `docs/cli.md`, generated from each command's `--help` output by `make docs`. A test fails if the committed file differs from freshly generated output.
- **Issues.** GitHub issues, managed through the `gh` CLI. Each issue gets its own branch and pull request, opened through gh, with the change report as the PR body. Commit messages and branch names include the issue number, as in `fix: reversal balance (#42)`.
- **Scratchpad files.** Name them `agent-scratchpad/<issue>-<slug>.md`, or `<date>-<slug>.md` before issues exist. Use this template:

```markdown
# <issue number and title>

## Context
What the task is and what was found before starting.

## Decisions
- Decision. Alternatives considered. Reason.

## Open questions

## Promoted
- What moved to the README, PROJECT_SPEC.md, or CLAUDE.md
```

### External services

These rules apply to any project that calls an external service. The stack document names the client library and the test tooling.

- Clients for external services are part of the shell.
- Every request sets explicit connect and read timeouts. Retries are bounded, use backoff, and apply only to idempotent requests.
- Responses are parsed into domain types at the client. An unexpected shape raises an error; it never falls back to a default.
- Tests never reach the network, enforced for the whole suite. Clients are tested against recorded real responses, with secrets and personal data scrubbed before they are committed.
- Any new external service needs a project spec change. For a service, it also changes the network tier or egress allowlist.

### Pre-commit and secret scanning

pre-commit runs the fast checks before every commit. Every repo runs betterleaks from its own repository, pinned to a release tag. The stack document adds the language's own hooks.

```yaml
repos:
  - repo: https://github.com/betterleaks/betterleaks
    rev: <exact release tag>
    hooks:
      - id: betterleaks
```

- **betterleaks version.** Betterleaks is moving from v1 to v2. At project setup, pin the latest stable release, and confirm the hook and the CI command against that version's docs, since flags differ between major versions.
- **betterleaks config.** The project owns its `.betterleaks.toml` instead of extending the upstream default, so the rule set only changes when someone reviews it. Scans in hooks and CI run without validation, so they make no network calls.
- **False positives.** Add a filter to `.betterleaks.toml` with a comment giving the reason. Inline `betterleaks:allow` comments are allowed only in test fixtures. Either change appears in the change report.
- **CI.** CI runs `pre-commit run --all-files`, then a betterleaks scan of every commit in the PR. The commit scan catches a secret added in one commit and removed in a later one, which the final diff hides.
- **If a secret is committed.** Rotate it first. Removing it from history comes second, because the credential may already have been copied.

## Starting a new project

A new project begins with its project spec, and no code is written until the user approves it. The agent builds the spec by interviewing the user and never invents invariants.

### Procedure

1. **Interview.** Ask the questions below, one topic at a time. Restate each answer as a candidate entity, transition, or invariant and confirm it.
2. **Draft.** Write `PROJECT_SPEC.md` from the template. Record anything unanswered under open questions instead of guessing.
3. **Approve.** The user reads the full draft and approves it. This is the one document the user always reviews line by line.
4. **Scaffold.** Create the layout from the stack document and a thin CLAUDE.md, then configure every check. Confirm each check fails on a deliberate violation.
5. **Write the oracles.** Write properties and reference models for the approved invariants before the implementation.
6. **Implement.** Build against the properties. Map tiered concepts to modules as they appear and record the mapping in the spec.

### Interview questions

- What does the app do, in two or three sentences, and who uses it?
- What are the core entities, and how do they relate?
- Which entities have states? What transitions are allowed, and under what conditions?
- What must never happen? What must always be true?
- Which failures would go unnoticed? Which could not be undone?
- What external systems are involved, and what can be trusted about their data?
- What network access does the app need, and to which domains? For a service, this sets its network tier.
- What kind of project is it, and in which language? This decides which standards apply.
- What is out of scope, and where is rough acceptable?
- Does anything need to depart from the default stack?

### Writing invariants

- One testable statement each, in the language of the domain.
- State what holds, not how the code achieves it.
- Start with the five to ten whose violation would hurt most. The list grows during the build.
- IDs are stable and never reused. A dropped invariant is marked retired, not deleted.

| Quality | Example |
| --- | --- |
| Good | The entries of a transfer sum to zero. |
| Good | A closed account accepts no new entries. |
| Too vague | Transfers are handled correctly. |
| Describes the how | Transfers are saved inside a transaction. |

### Assigning tiers before modules exist

Assign tiers to domain concepts first, such as "ledger entries" or "deletion". The questions about unnoticed and irreversible failures identify T1. As modules appear, each inherits the highest tier of the concepts it touches.

### Template

```markdown
# Project spec: <name>

## Purpose
Two or three sentences. What it does and who uses it.

## Applies
The standards that apply, such as `core, project-types/service, topics/sqlite, stacks/python`.

## Entities
| Entity | Description | Key fields | Relations |
| --- | --- | --- | --- |

## State machines
| Entity | From | Event | To | Condition |
| --- | --- | --- | --- | --- |

## Invariants
| ID | Statement | Tier | Enforced in | Property |
| --- | --- | --- | --- | --- |
| INV-1 | ... | T1 | core, schema CHECK | tests/properties/test_inv_1_... |

## Risk tiers
| Concept or module | Tier | Reason |
| --- | --- | --- |

## Reference models
Which behaviors have a model, and where it lives.

## Runtime (services)
- Network tier: isolated / allowlisted / open, with the reason
- Egress allowlist: domains, if allowlisted
- Ports: roles used, such as web 8000
- Secrets: names and what each is for

## External consumers
Who depends on this project's interfaces. Listing one makes interface docs required.
| Consumer | Interface | Docs |
| --- | --- | --- |

## Deviations from the applied standards
Each deviation with its reason.

## Open questions

## Change log
| Date | Change | Approved by |
| --- | --- | --- |
```

### Changing the project spec

The order is always the same: the agent proposes, the user approves, then the spec changes, then the properties, then the code. Each change gets a line in the change log.

Three events trigger a proposal:

- A task needs a rule the spec does not state.
- A property fails and the invariant itself looks wrong.
- A bug reached use in T1 or T2 code. It becomes a new invariant or a new property on an existing one.
