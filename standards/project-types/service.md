# Project type: service

A service is an app that runs as a long-lived server in a container, deployed by the runner. These rules apply in addition to `core.md`. The stack document gives the image build and the language-specific details.

## Principle

### S1. Production means the container

**Rule.** A build produces a container image, and running the app with real data means running that image, never running the code on the host. The image meets the container contract below: configuration from environment variables, secrets from files, state only in one data volume, logs to stdout, a health endpoint, and fixed ports. Each project ships a `compose.yaml` that declares everything the app needs from its environment, including its network tier. Supplying values, storage, and host ports is the runner's job, a separate project outside these standards. Changes to the network tier, container privileges, or secrets are T1.

**Why.** Containers isolate apps from each other and from the host, and the artifact that is tested is the one that runs. Because the app only declares its needs, the runner can change, or move to the cloud, without changing the app.

**Check.** The image builds, and smoke tests pass against the running container. Every setting the app reads is declared in `compose.yaml`. The network tier matches the project spec, and the open tier has a recorded reason.

## Container contract

This section defines what an app's image must do. How containers are started, where configuration and secrets come from, and how host ports are assigned belong to the runner, a separate project. Development and tests still run on the host; the container is for real data and for the final smoke test.

**Image.**

- Base images and build tools are pinned by digest or exact version. Image tags are the git commit SHA.
- The app runs as a fixed non-root user. `/data` is created and owned by that user in the image, so a new named volume mounted there starts with the same ownership and is writable without host-side fixes.
- `.dockerignore` excludes `.git`, `.data`, `tests`, `docs`, `agent-scratchpad`, and any `.env` files, plus the stack's local build output.

**Runtime behavior.**

- All state lives under `/data`, mounted as a named volume. The root filesystem is read-only, with `/tmp` as tmpfs.
- Logs go to stdout as JSON lines, as described under Logging below. The app never writes log files.
- `GET /health` returns 200 once migrations have run and the database opens. It checks nothing external.
- The app shuts down cleanly on SIGTERM, finishing in-flight requests.

**Ports.** Each container has its own network namespace, so every app uses the same fixed ports inside its container. The runner maps them to host ports.

| Role | Port | Notes |
| --- | --- | --- |
| Web | 8000 + n | An app serving `/ui` and `/api` from one process uses 8000 only |
| API | 8100 + n | Only for an API served by a separate process |
| Metrics | 9000 + n | Optional. Never exposed on a web or API port |

`n` counts additional endpoints of the same role, starting at 0.

**Network tiers.** Each app declares one tier, recorded in the project spec and in `compose.yaml`. The runner enforces it.

| Tier | Meaning |
| --- | --- |
| `isolated` | No network access beyond its published ports |
| `allowlisted` | Outbound access only to the listed domains, through a proxy the runner provides. The app honors `HTTPS_PROXY` |
| `open` | Unrestricted outbound access. Needs a recorded reason in the project spec |

**Manifest.** `compose.yaml` declares what the app needs and supplies no real values. Required variables use `${NAME:?}` so a missing value fails at start. Ports are listed with `expose`, never `ports`, because host mapping is the runner's job. Settings for the runner go in `x-` keys, which Compose ignores.

```yaml
x-network-tier: allowlisted
x-egress-allowlist: [api.example.com]

services:
  app:
    image: <app>:${GIT_SHA:?}
    read_only: true
    tmpfs: [/tmp]
    cap_drop: [ALL]
    security_opt: ["no-new-privileges:true"]
    expose: ["8000"]
    environment:
      LOG_LEVEL: ${LOG_LEVEL:-info}
      API_TOKEN_FILE: /run/secrets/api_token
    secrets: [api_token]
    volumes: [data:/data]
    restart: unless-stopped

secrets:
  api_token:
    file: ${API_TOKEN_PATH:?}

volumes:
  data:
```

- A test parses `compose.yaml` and the settings class and fails if the app reads a setting the manifest does not declare, or the manifest declares one the app does not read.
- Backup and restore of the data volume are documented in the README until the runner takes them over.

## Configuration

Configuration is read once at startup. Ordinary values come from environment variables. A secret named `API_TOKEN` is read from the file that `API_TOKEN_FILE` points to; the plain `API_TOKEN` variable is accepted only in development, and setting both is an error. A missing required value stops startup with a clear error naming it. Paths default to the container layout, such as `DATA_DIR=/data`. The core never reads configuration; the shell passes in what it needs.

Secret values are wrapped in a type that prints as `***`, so they stay out of logs, error pages, tracebacks, and change reports.

## Logging

- Logs are JSON lines on stdout. Each line is one JSON object with `ts` (UTC, ISO 8601), `level`, `logger`, `event`, and any context fields.
- `event` is a short fixed string such as `import.completed`. Variable data goes in fields, never in the event string.
- Every web request gets a request ID, included in each log line for that request and returned in an `X-Request-ID` response header.
- Never log secrets, full request or response bodies, or imported file contents. Log counts and IDs instead.
- Levels: `error` for anything that needs the user's attention, `warning` for handled but unexpected conditions, `info` for state changes, `debug` for detail that is off by default.

## Request safety

Apps have no authentication, but any web page open in the user's browser can still send requests to them. These rules block cross-site requests and DNS rebinding. The stack document says how to apply each one.

- Requests whose `Host` header is not in an `ALLOWED_HOSTS` setting are rejected.
- Mutating requests (POST, PUT, PATCH, DELETE) must carry a header that forces a browser preflight, such as `HX-Request: true` for htmx routes or `Content-Type: application/json` for JSON routes. Anything else gets a 403.
- Templates escape output by default, and escaping is never turned off for data that came from a user or an import.
- Debug mode is never on in the image. The entry point refuses to start if it is set.
- If an app ever needs to be reachable from other machines, stop and ask: that requires authentication, which these standards do not yet define. See `standards/README.md`.
