ARG DENO_VERSION=2.9.3
FROM denoland/deno:${DENO_VERSION}@sha256:6288db6be1c26473bb9d1843f906d9a219c0dda57fd85de4aac90296951cf6ef AS deno

FROM node:24.18.1-bookworm-slim@sha256:235600a8101ab264e117b1768e925532262668dc9b581ef1dd7d96ced463b8e7 AS node

FROM mcr.microsoft.com/devcontainers/base@sha256:1a00517e89d3075f8c9dc8d9911404de0ff8991a4d71c62068573e9b016a89da

COPY --from=deno /usr/bin/deno /usr/local/bin/deno
COPY --from=node /usr/local/ /usr/local/

ARG TARGETARCH
ARG GH_VERSION=2.96.0
ARG GH_AMD64_SHA256=83d5c2ccad5498f58bf6368acb1ab32588cf43ab3a4b1c301bf36328b1c8bd60
ARG GH_ARM64_SHA256=06f86ec7103d41993b76cd78072f43595c34aaa56506d971d9860e67140bf909
ARG COPILOT_VERSION=1.0.72
ARG COPILOT_AMD64_SHA256=2a79c76a6381a09d8e96dde2affc22cfd33363503482a4f90a06c546bd9e1ccd
ARG COPILOT_ARM64_SHA256=7106f1e7f180880f6625be3e7085f19f6f1fa23f6a94e1d68dc929292f9f76ae

RUN command -v curl \
    && command -v sha256sum \
    && command -v tar \
    && case "${TARGETARCH}" in \
        amd64) \
          gh_arch=amd64; \
          gh_sha256="${GH_AMD64_SHA256}"; \
          copilot_arch=x64; \
          copilot_sha256="${COPILOT_AMD64_SHA256}" \
          ;; \
        arm64) \
          gh_arch=arm64; \
          gh_sha256="${GH_ARM64_SHA256}"; \
          copilot_arch=arm64; \
          copilot_sha256="${COPILOT_ARM64_SHA256}" \
          ;; \
        *) echo "Unsupported architecture: ${TARGETARCH}" >&2; exit 1 ;; \
      esac \
    && gh_archive="gh_${GH_VERSION}_linux_${gh_arch}.tar.gz" \
    && curl -fsSL \
      "https://github.com/cli/cli/releases/download/v${GH_VERSION}/${gh_archive}" \
      -o "/tmp/${gh_archive}" \
    && echo "${gh_sha256}  /tmp/${gh_archive}" | sha256sum -c - \
    && tar -xzf "/tmp/${gh_archive}" -C /tmp \
    && install -m 0755 \
      "/tmp/gh_${GH_VERSION}_linux_${gh_arch}/bin/gh" \
      /usr/local/bin/gh \
    && copilot_archive="copilot-linux-${copilot_arch}.tar.gz" \
    && curl -fsSL \
      "https://github.com/github/copilot-cli/releases/download/v${COPILOT_VERSION}/${copilot_archive}" \
      -o "/tmp/${copilot_archive}" \
    && echo "${copilot_sha256}  /tmp/${copilot_archive}" | sha256sum -c - \
    && tar -xzf "/tmp/${copilot_archive}" -C /tmp \
    && install -m 0755 /tmp/copilot /usr/local/bin/copilot \
    && rm -rf /tmp/gh_* /tmp/copilot /tmp/copilot-* \
    && test "$(node --version)" = "v24.18.0" \
    && test "$(npm --version)" = "11.16.0" \
    && gh --version | head -n 1 | grep -q "^gh version ${GH_VERSION} " \
    && copilot --version | grep -q "${COPILOT_VERSION}"

ENV DENO_DIR=/deno-dir \
    DENO_NO_PROMPT=1 \
    DENO_NO_UPDATE_CHECK=1

WORKDIR /tmp/bunny-edge-scripts

COPY deno.json deno.lock ./
COPY packages/bunny-ddns-edge-script/deno.json \
    packages/bunny-ddns-edge-script/
COPY packages/create-bunny-ddns/deno.json packages/create-bunny-ddns/

RUN deno ci \
    && printf 'export {};\n' > cache-probe.ts \
    && deno bundle cache-probe.ts -o cache-probe.js \
    && chown -R vscode:vscode /deno-dir \
    && rm -rf /tmp/bunny-edge-scripts

COPY --chmod=0755 .devcontainer/entrypoint.sh /usr/local/bin/development-entrypoint

WORKDIR /workspaces/bunny-edge-scripts
