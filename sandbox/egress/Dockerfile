FROM debian:trixie-slim@sha256:8aa5a7bf5a1955bddbe7d74fcdd0b91ab30e74362a8b73af672b0481b35b44a0

RUN apt-get update \
 && apt-get install -y --no-install-recommends squid-openssl- squid \
 && rm -rf /var/lib/apt/lists/*

COPY squid.conf /etc/squid/squid.conf
COPY render-squid.sh allowlist.txt /tmp/build/
RUN /tmp/build/render-squid.sh /tmp/build/allowlist.txt /etc/squid/allowlist.dstdomain \
 && rm -rf /tmp/build \
 && squid -k parse -f /etc/squid/squid.conf

USER proxy
EXPOSE 3128
# Checks that port 3128 (0C38) is listening without connecting, so the probe
# never shows up in the access log.
HEALTHCHECK --interval=5s --timeout=3s CMD ["grep", "-qs", ":0C38 00000000000000000000000000000000:0000 0A\\|:0C38 00000000:0000 0A", "/proc/net/tcp6", "/proc/net/tcp"]
ENTRYPOINT ["squid", "-N", "-f", "/etc/squid/squid.conf"]
