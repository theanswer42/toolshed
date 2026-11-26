# Dev image for task containers. Build context: sandbox/ (see compose.yaml).
# Every download is pinned by version and checked against a SHA-256.
FROM ghcr.io/astral-sh/uv:0.13.10@sha256:a3ea1357342c1a4bf9a0c53a3deb1b55379aefa037338d8113d5771efa01774f AS uv

FROM debian:trixie-slim@sha256:8aa5a7bf5a1955bddbe7d74fcdd0b91ab30e74362a8b73af672b0481b35b44a0

ARG GO_VERSION=1.27.4
ARG GO_SHA256=7226736c2339719cda28fbf3a54d71aa63bcefe376e98cef00034268dab24840
ARG GH_VERSION=2.105.0
ARG GH_SHA256=79e7ab5db738c48777b696e374f8b428f0647debfb424f44d2f426370407fe2f
ARG BETTERLEAKS_VERSION=1.10.1
ARG BETTERLEAKS_SHA256=c174b42d7aa60caf58c0c3e555c0e4bed01fe6b0d99a412bce777b5af4ce913e
ARG CLAUDE_CODE_VERSION=2.1.332
ARG CLAUDE_CODE_SHA256=a2df1f41bb00250992926420d0063f89b127cb81abdd284dbefb80c50ff1d026
ARG PRE_COMMIT_VERSION=4.7.0
ARG PYTHON_DEFAULT=3.13
# Extra interpreters, oldest first; check-updates compares the last one.
ARG PYTHON_EXTRA="3.14 3.15"

SHELL ["/bin/bash", "-euo", "pipefail", "-c"]

# Tools Claude Code and the base spec reach for.
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      ca-certificates curl git jq ripgrep fd-find tree less file diffutils patch \
      procps unzip zip xz-utils make build-essential pkg-config sqlite3 \
 && ln -s /usr/bin/fdfind /usr/local/bin/fd \
 && rm -rf /var/lib/apt/lists/*

COPY --from=uv /uv /uvx /usr/local/bin/

RUN cd /tmp \
 && fetch() { curl -fsSL --retry 3 -o "$2" "$1" && echo "$3  $2" | sha256sum -c --quiet; } \
 && fetch "https://go.dev/dl/go${GO_VERSION}.linux-amd64.tar.gz" go.tgz "$GO_SHA256" \
 && tar -C /usr/local -xzf go.tgz \
 && fetch "https://github.com/cli/cli/releases/download/v${GH_VERSION}/gh_${GH_VERSION}_linux_amd64.tar.gz" gh.tgz "$GH_SHA256" \
 && mkdir /opt/gh && tar -C /opt/gh --strip-components=1 -xzf gh.tgz \
 && fetch "https://github.com/betterleaks/betterleaks/releases/download/v${BETTERLEAKS_VERSION}/betterleaks_${BETTERLEAKS_VERSION}_linux_x64.tar.gz" bl.tgz "$BETTERLEAKS_SHA256" \
 && tar -C /usr/local/bin -xzf bl.tgz betterleaks \
 && fetch "https://downloads.claude.ai/claude-code-releases/${CLAUDE_CODE_VERSION}/linux-x64/claude" /usr/local/bin/claude "$CLAUDE_CODE_SHA256" \
 && chmod 0755 /usr/local/bin/claude \
 && rm -f /tmp/*.tgz

# Python interpreters and global tools, installed outside $HOME so they survive
# the tmpfs home. Runtime uv state (cache, project venvs) goes to /cache and /work.
RUN UV_PYTHON_INSTALL_DIR=/opt/uv/python UV_PYTHON_BIN_DIR=/usr/local/bin \
    uv python install --preview-features python-install-default --default "$PYTHON_DEFAULT" \
 && UV_PYTHON_INSTALL_DIR=/opt/uv/python UV_PYTHON_BIN_DIR=/usr/local/bin \
    uv python install $PYTHON_EXTRA \
 && UV_PYTHON_INSTALL_DIR=/opt/uv/python UV_TOOL_DIR=/opt/uv/tools UV_TOOL_BIN_DIR=/usr/local/bin \
    uv tool install --python "$PYTHON_DEFAULT" "pre-commit==${PRE_COMMIT_VERSION}" \
 && rm -rf /root/.cache

# Agent config (INV-18): settings are enforced as managed settings, root-owned.
# The rest of sandbox/claude/ is copied into a tmpfs ~/.claude at start.
COPY claude/settings.json /etc/claude-code/managed-settings.json
COPY claude/ /etc/sandbox/claude/
RUN rm /etc/sandbox/claude/settings.json

COPY image/gitconfig /etc/gitconfig
COPY image/profile.sh /etc/profile.d/sandbox.sh
COPY image/git-credential-sandbox image/gh image/entrypoint /usr/local/bin/
RUN chmod -R a+rX,go-w /etc/claude-code /etc/sandbox /etc/gitconfig /etc/profile.d/sandbox.sh \
 && chmod 0755 /usr/local/bin/git-credential-sandbox /usr/local/bin/gh /usr/local/bin/entrypoint

RUN useradd --uid 10001 --create-home --shell /bin/bash agent \
 && install -d -o agent -g agent -m 0700 /work /cache

ENV HOME=/home/agent \
    PATH=/usr/local/go/bin:/cache/go/bin:/usr/local/bin:/usr/bin:/bin \
    HTTPS_PROXY=http://egress:3128 HTTP_PROXY=http://egress:3128 \
    https_proxy=http://egress:3128 http_proxy=http://egress:3128 \
    NO_PROXY=localhost,127.0.0.1 no_proxy=localhost,127.0.0.1 \
    CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1 \
    DISABLE_AUTOUPDATER=1 \
    ENABLE_CLAUDEAI_MCP_SERVERS=false \
    CLAUDE_CODE_DISABLE_ARTIFACT=1 \
    CLAUDE_CODE_DISABLE_AUTO_MEMORY=1 \
    UV_PYTHON_INSTALL_DIR=/opt/uv/python \
    UV_PYTHON_DOWNLOADS=never \
    UV_CACHE_DIR=/cache/uv \
    UV_LINK_MODE=copy \
    PRE_COMMIT_HOME=/cache/pre-commit \
    GOPATH=/cache/go GOCACHE=/cache/go-build GOTOOLCHAIN=local \
    XDG_CACHE_HOME=/cache/xdg

USER agent
WORKDIR /work
ENTRYPOINT ["/usr/local/bin/entrypoint"]
CMD ["bash", "-l"]
